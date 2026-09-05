/**
 * Provider-neutral contracts for the AI layer.
 *
 * Nothing in this file may reference a vendor SDK. Application code imports
 * only from `@/lib/ai`; provider packages are confined to `./providers/*`.
 */

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

/** Declared now so adding tool dispatch later does not change the interface. */
export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'unknown';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Request a JSON response matching this schema (structured outputs). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Reserved for tool calling. Accepted by the interface, not yet dispatched. */
  tools?: AiToolDefinition[];
}

export interface ChatResult {
  content: string;
  finishReason: FinishReason;
  usage: TokenUsage;
  /** The model that actually served the request, as reported by the provider. */
  model: string;
  toolCalls?: AiToolCall[];
}

/**
 * Streaming yields a discriminated union rather than bare strings, so a chunk
 * can carry usage and finish reason. A raw-string stream cannot, which is why
 * the previous `streamChat` could never be wired into a route that also had to
 * persist the completed message.
 */
export type ChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: AiToolCall }
  | { type: 'done'; finishReason: FinishReason; usage: TokenUsage; model: string };

/**
 * Retrieval embeddings are asymmetric: the vector for a stored passage and the
 * vector for a search query are produced differently by providers that support
 * it (Gemini `taskType`, for one). Providers that do not support it ignore this.
 */
export type EmbedPurpose = 'document' | 'query';

export interface EmbedOptions {
  model?: string;
  purpose?: EmbedPurpose;
  signal?: AbortSignal;
}

/**
 * Identifies the vector space a stored embedding belongs to.
 *
 * This is the mitigation for the migration's highest-impact failure mode:
 * vectors from different models are not comparable even at identical
 * dimensionality, and cosine similarity between them yields a well-formed
 * number rather than an error. Every persisted vector carries this tag, and
 * queries discard non-matching vectors before scoring — turning silent
 * corruption into a visible retrieval gap.
 */
export interface EmbeddingTag {
  provider: string;
  model: string;
  dimensions: number;
}

export interface EmbedResult extends EmbeddingTag {
  /** One vector per input, in input order. */
  vectors: number[][];
}

export interface AiProvider {
  readonly name: string;
  readonly chatModel: string;
  readonly embeddingModel: string;

  chat(messages: AiMessage[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: AiMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
  embed(inputs: string[], options?: EmbedOptions): Promise<EmbedResult>;
  health(): Promise<boolean>;
}

/** True when two tags describe the same vector space. */
export function sameVectorSpace(a: EmbeddingTag | null | undefined, b: EmbeddingTag): boolean {
  return (
    !!a && a.provider === b.provider && a.model === b.model && a.dimensions === b.dimensions
  );
}
