import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';

import { searchMemories } from '@/features/memory';
import { searchDocuments } from '@/features/rag';
import { aiClient, type AiMessage, type ChatChunk } from '@/lib/ai';
import { recordDecision } from '@/lib/telemetry';

import { agentConfig } from './agent-config';
import { AgentState, type AgentStateType } from './agent-state';

function latestUserMessage(state: AgentStateType): string {
  return (
    [...state.messages].reverse().find((message) => message instanceof HumanMessage)?.content?.toString() ?? ''
  );
}

/**
 * The RAG node: retrieves long-term memories and document chunks for the
 * current query. Both are scoped to the requesting user inside their services.
 */
const loadContext = async (state: AgentStateType) => {
  const query = latestUserMessage(state);
  if (!query) return { memories: [], retrievedDocs: [] };

  const [memories, retrievedDocs] = await Promise.all([
    searchMemories(state.userId, query, agentConfig.maxMemoryResults),
    searchDocuments(state.userId, query, agentConfig.maxRetrievedDocuments),
  ]);

  recordDecision('context.loaded', {
    userId: state.userId,
    conversationId: state.conversationId,
    memoryCount: memories.length,
    documentCount: retrievedDocs.length,
  });

  return { memories, retrievedDocs };
};

/** Renders retrieved context into a system prompt. */
export function buildSystemPrompt(state: Pick<AgentStateType, 'memories' | 'retrievedDocs'>): string {
  const sections: string[] = [
    'You are a helpful assistant. Use the context below when it is relevant, and ignore it when it is not. Do not mention the context unless asked.',
  ];

  if (state.memories.length > 0) {
    sections.push(
      ['What you remember about this user:', ...state.memories.map((memory) => `- ${memory.content}`)].join('\n'),
    );
  }

  if (state.retrievedDocs.length > 0) {
    sections.push(
      [
        'Relevant excerpts from the user’s uploaded documents:',
        ...state.retrievedDocs.map((doc) => `- ${doc.chunk.content}`),
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}

/** Converts LangChain messages into the provider-neutral wire format. */
export function toAiMessages(messages: BaseMessage[]): AiMessage[] {
  return messages
    .filter((message) => !(message instanceof SystemMessage))
    .slice(-agentConfig.maxHistoryMessages)
    .map((message) => ({
      role: message instanceof AIMessage ? ('assistant' as const) : ('user' as const),
      content: message.content.toString(),
    }));
}

const respond = async (state: AgentStateType) => {
  const result = await aiClient.chat([
    { role: 'system', content: buildSystemPrompt(state) },
    ...toAiMessages(state.messages),
  ]);

  recordDecision('responded', {
    userId: state.userId,
    conversationId: state.conversationId,
    finishReason: result.finishReason,
  });

  return { messages: [new AIMessage(result.content)] };
};

/** Full pipeline: retrieve context, then answer. */
export const agentWorkflow = new StateGraph(AgentState)
  .addNode('loadContext', loadContext)
  .addNode('respond', respond)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', 'respond')
  .addEdge('respond', END)
  .compile();

/**
 * Retrieval only. The streaming path needs the context before it can start
 * emitting tokens, but cannot run `respond` — a graph node returns a value,
 * it cannot yield a stream.
 */
export const contextWorkflow = new StateGraph(AgentState)
  .addNode('loadContext', loadContext)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', END)
  .compile();

export interface AgentInput {
  /** Full conversation history, oldest first, including the new user message. */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  userId: string;
  conversationId: string;
}

function toLangChainMessages(input: AgentInput): BaseMessage[] {
  return input.messages.map((message) =>
    message.role === 'assistant' ? new AIMessage(message.content) : new HumanMessage(message.content),
  );
}

export async function runAgent(input: AgentInput) {
  return agentWorkflow.invoke({
    userId: input.userId,
    conversationId: input.conversationId,
    messages: toLangChainMessages(input),
    memories: [],
    retrievedDocs: [],
    toolResults: [],
  });
}

/** Retrieves context through the graph, then streams the completion. */
export async function* streamAgent(
  input: AgentInput,
  signal?: AbortSignal,
): AsyncGenerator<ChatChunk> {
  const messages = toLangChainMessages(input);

  const state = await contextWorkflow.invoke({
    userId: input.userId,
    conversationId: input.conversationId,
    messages,
    memories: [],
    retrievedDocs: [],
    toolResults: [],
  });

  yield* aiClient.stream(
    [{ role: 'system', content: buildSystemPrompt(state) }, ...toAiMessages(messages)],
    { signal },
  );
}
