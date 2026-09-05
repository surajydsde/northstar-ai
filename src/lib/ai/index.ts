/**
 * Public surface of the AI layer.
 *
 * Application code imports from `@/lib/ai` and nothing deeper. Vendor SDKs
 * (`@google/genai`, `openai`, `@anthropic-ai/sdk`) must never be imported
 * outside `src/lib/ai/providers/`.
 */

export { aiClient, type AiClient } from './client';
export { AiError, type AiErrorCode } from './errors';
export { getAiConfig, PROVIDER_NAMES, type AiConfig, type ProviderName } from './config';
export { sameVectorSpace } from './types';
export type {
  AiMessage,
  AiProvider,
  AiRole,
  AiToolCall,
  AiToolDefinition,
  ChatChunk,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedPurpose,
  EmbedResult,
  EmbeddingTag,
  FinishReason,
  TokenUsage,
} from './types';
