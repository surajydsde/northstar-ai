export interface DocumentInput { id?: string; userId: string; name: string; content?: string; mimeType?: string; metadata?: Record<string, string>; }
export interface DocumentChunk { id: string; documentId: string; userId: string; content: string; index: number; embedding?: number[]; metadata: Record<string, string>; }
export interface RetrievedDocument { chunk: DocumentChunk; score: number; }
