import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { ChatMessage as ChatMessageType } from "@/features/chat/types";

type ChatMessageProps = {
  message: ChatMessageType;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`message-row ${isUser ? "message-row-user" : "message-row-assistant"}`}>
      <div className={`message-bubble ${isUser ? "message-bubble-user" : "message-bubble-assistant"}`}>
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content || "_Thinking..._"} />
        )}
      </div>
    </div>
  );
}
