"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ChatInput } from "@/components/chat-input";
import { ChatMessage } from "@/components/chat-message";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useAuth } from "@/features/auth/auth-context";
import type { ChatMessage as ChatMessageType, ChatThread } from "@/features/chat/types";
import { useStreamingResponse } from "@/features/chat/use-streaming-response";

type Conversation = { id: string; title: string; createdAt: string; updatedAt: string; lastMessageAt?: string | null };
type ConversationDetail = { conversation: Conversation; messages: Array<{ id: string; role: string; content: string; createdAt: string }> };

function toThread(conversation: Conversation, messages: ConversationDetail["messages"] = []): ChatThread {
  return {
    id: conversation.id,
    title: conversation.title || "New conversation",
    createdAt: conversation.createdAt,
    lastActive: conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
      timestamp: message.createdAt,
    })),
  };
}

export function DashboardShell() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { streamingText, isStreaming, streamChat } = useStreamingResponse();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingAssistantId, setPendingAssistantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) { handleUnauthorized(); throw new Error("Unauthorized"); }
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  }, [handleUnauthorized]);

  const loadConversation = useCallback(async (id: string) => {
    const detail = await api(`/api/conversations/${id}`) as ConversationDetail;
    setThreads((current) => current.map((thread) => thread.id === id ? toThread(detail.conversation, detail.messages) : thread));
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const conversations = await api("/api/conversations") as Conversation[];
        if (cancelled) return;
        const mapped = conversations.map((conversation) => toThread(conversation));
        setThreads(mapped);
        setActiveChatId(mapped[0]?.id ?? "");
        if (mapped[0]) await loadConversation(mapped[0].id);
      } catch (loadError) {
        if (!cancelled && (loadError as Error).message !== "Unauthorized") setError((loadError as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [api, loadConversation]);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeChatId), [threads, activeChatId]);
  const renderedMessages = useMemo(() => activeThread?.messages.map((message) => message.id === pendingAssistantId && isStreaming ? { ...message, content: streamingText } : message) ?? [], [activeThread, pendingAssistantId, isStreaming, streamingText]);

  async function createNewChat() {
    try {
      const conversation = await api("/api/conversations", { method: "POST", body: JSON.stringify({ title: "New conversation" }) }) as Conversation;
      const thread = toThread(conversation);
      setThreads((current) => [thread, ...current]);
      setActiveChatId(thread.id);
      setDraft("");
      setError(null);
    } catch (createError) { if ((createError as Error).message !== "Unauthorized") setError((createError as Error).message); }
  }

  function renameChat(chatId: string) {
    try {
      const nextTitle = window.prompt("Rename chat", "");
      if (!nextTitle?.trim()) return;
      setThreads((current) => current.map((thread) => thread.id === chatId ? { ...thread, title: nextTitle.trim() } : thread));
    } catch (e) {
      console.error("Prompt not supported", e);
      alert("Renaming is not supported in this environment.");
    }
  }

  async function deleteChat(chatId: string) {
    try {
      await api(`/api/conversations/${chatId}`, { method: "DELETE" });
      const nextThreads = threads.filter((thread) => thread.id !== chatId);
      setThreads(nextThreads);
      if (chatId === activeChatId) setActiveChatId(nextThreads[0]?.id ?? "");
    } catch (deleteError) { if ((deleteError as Error).message !== "Unauthorized") setError((deleteError as Error).message); }
  }

  async function selectChat(chatId: string) {
    setActiveChatId(chatId);
    try { await loadConversation(chatId); } catch (loadError) { if ((loadError as Error).message !== "Unauthorized") setError((loadError as Error).message); }
  }

  async function handleSubmit() {
    const message = draft.trim();
    if (!message || !activeThread || isStreaming) return;
    setError(null);
    const userMessage: ChatMessageType = { id: `pending-user-${Date.now()}`, role: "user", content: message, timestamp: new Date().toISOString() };
    const assistantMessage: ChatMessageType = { id: `pending-assistant-${Date.now()}`, role: "assistant", content: "", timestamp: new Date().toISOString() };
    setThreads((current) => current.map((thread) => thread.id === activeThread.id ? { ...thread, messages: [...thread.messages, userMessage, assistantMessage], lastActive: new Date().toISOString(), title: thread.messages.length ? thread.title : message.slice(0, 60) } : thread));
    setPendingAssistantId(assistantMessage.id);
    setDraft("");

    const settle = (content: string) => {
      setThreads((current) => current.map((thread) => thread.id === activeThread.id
        ? { ...thread, messages: thread.messages.map((item) => item.id === assistantMessage.id ? { ...item, content } : item) }
        : thread));
      setPendingAssistantId(null);
    };

    await streamChat({ message, conversationId: activeThread.id }, {
      onComplete: settle,
      onError: (streamError) => {
        setPendingAssistantId(null);
        // Drop the optimistic pair so the thread does not show a dangling
        // prompt with no answer.
        setThreads((current) => current.map((thread) => thread.id === activeThread.id
          ? { ...thread, messages: thread.messages.filter((item) => item.id !== userMessage.id && item.id !== assistantMessage.id) }
          : thread));
        if (streamError === "Unauthorized") handleUnauthorized();
        else setError(streamError);
      },
    });
  }

  async function handleLogout() { try { await logout(); router.replace("/login"); } catch (logoutError) { setError((logoutError as Error).message); } }

  return <div className="app-shell">
    <ChatSidebar chats={threads} activeChatId={activeThread?.id ?? ""} onSelectChat={selectChat} onNewChat={createNewChat} onRenameChat={renameChat} onDeleteChat={deleteChat} />
    <main className="main-panel">
      <AppHeader title={activeThread?.title ?? "New conversation"} subtitle="Workspace" user={user} onLogout={handleLogout} />
      <div className="chat-scroll-area">
        {loading ? <div className="empty-state"><div className="empty-state-card"><p>Loading conversations...</p></div></div> : error ? <div className="empty-state"><div className="empty-state-card"><h2>Unable to load chat</h2><p>{error}</p></div></div> : renderedMessages.length ? renderedMessages.map((message) => <ChatMessage key={message.id} message={message} />) : <div className="empty-state"><div className="empty-state-card"><h2>Start a new conversation</h2><p>Ask for an idea, a summary, or a plan.</p></div></div>}
      </div>
      <div className="composer-panel"><ChatInput value={draft} onChange={setDraft} onSubmit={handleSubmit} disabled={isStreaming || loading || !activeThread} /></div>
    </main>
  </div>;
}
