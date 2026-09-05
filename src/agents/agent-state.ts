import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { Memory, ToolResult } from "@/types/agent";
import type { RetrievedDocument } from "@/types/rag";
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  userId: Annotation<string>({ reducer: (_, value) => value, default: () => "anonymous" }),
  conversationId: Annotation<string>({ reducer: (_, value) => value, default: () => crypto.randomUUID() }),
  memories: Annotation<Memory[]>({ reducer: (_, value) => value, default: () => [] }),
  retrievedDocs: Annotation<RetrievedDocument[]>({ reducer: (_, value) => value, default: () => [] }),
  toolResults: Annotation<ToolResult[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
});
export type AgentStateType = typeof AgentState.State;
