export type MessageRole = 'user' | 'assistant' | 'system';

export interface UserRecord {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface MemoryRecord {
  id: string;
  userId: string;
  content: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface DocumentRecord {
  id: string;
  userId: string;
  name: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
  context?: string[];
}

export interface ChatResponse {
  conversationId: string;
  message: string;
  model: string;
  createdAt: string;
}

export interface UploadedFileSummary {
  id: string;
  name: string;
  fileUrl: string;
  mimeType: string;
  size: number;
}
