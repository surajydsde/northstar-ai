import type { BaseMessage } from "@langchain/core/messages";

export type MemoryKind = "preference" | "fact" | "instruction" | "conversation";
export interface Memory { id: string; userId: string; content: string; kind: MemoryKind; importance: number; createdAt: string; updatedAt: string; metadata?: Record<string, string>; }
export interface ToolResult { toolName: string; input: unknown; output: string; ok: boolean; latencyMs: number; }
export interface AgentState { messages: BaseMessage[]; userId: string; conversationId: string; memories: Memory[]; retrievedDocs: import("./rag").RetrievedDocument[]; toolResults: ToolResult[]; }
