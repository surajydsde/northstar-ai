import type { ChatThread } from "@/features/chat/types";

type ChatSidebarProps = {
  chats: ChatThread[];
  activeChatId: string;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
};

export function ChatSidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
}: ChatSidebarProps) {
  return (
    <aside className="sidebar-shell">
      <div className="sidebar-header">
        <div className="brand-row">
          <div className="brand-mark">N</div>
          <span>Northstar AI</span>
        </div>
        <button type="button" className="secondary-button" onClick={onNewChat}>
          New chat
        </button>
      </div>

      <div className="sidebar-list">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-item ${chat.id === activeChatId ? "chat-item-active" : ""}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <div className="chat-item-text">
              <span>{chat.title}</span>
              <small>{chat.messages.length} messages</small>
            </div>

            <div className="chat-item-actions" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="mini-button" onClick={() => onRenameChat(chat.id)}>
                Rename
              </button>
              <button type="button" className="mini-button danger" onClick={() => onDeleteChat(chat.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
