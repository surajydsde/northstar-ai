export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
};

export type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  lastActive: string;
  messages: ChatMessage[];
};
