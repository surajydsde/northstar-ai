import { logger } from '@/lib/logger';

import { getAiConfig } from './config';
import { getChatProvider, getEmbeddingProvider } from './factory';
import { toAiError } from './errors';
import { delayFor, sleep, withRetry, withTimeout } from './retry';
import type {
  AiMessage,
  ChatChunk,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  EmbeddingTag,
} from './types';

/**
 * The application-facing AI surface. Every call is bounded by a timeout and
 * retried on transient failures. No caller knows which provider is configured.
 *
 * Logging records model, latency, token counts and error codes only — never
 * prompt or completion content, and never credentials.
 */
export const aiClient = {
  /** The vector space embeddings are currently written in, for tagging stored rows. */
  embeddingTag(): EmbeddingTag {
    const config = getAiConfig();
    return {
      provider: config.embeddingProvider,
      model: config.embeddingModel,
      dimensions: config.embeddingDimensions,
    };
  },

  async chat(messages: AiMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const config = getAiConfig();
    const provider = getChatProvider();
    const { signal, dispose } = withTimeout(config.timeoutMs, options.signal);
    const startedAt = performance.now();

    try {
      const result = await withRetry(() => provider.chat(messages, { ...options, signal }), {
        maxRetries: config.maxRetries,
        provider: provider.name,
        operation: 'chat',
        signal: options.signal,
      });

      logger.info('ai.chat', {
        provider: provider.name,
        model: result.model,
        latencyMs: Math.round(performance.now() - startedAt),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        finishReason: result.finishReason,
      });

      return result;
    } finally {
      dispose();
    }
  },

  async *stream(messages: AiMessage[], options: ChatOptions = {}): AsyncGenerator<ChatChunk> {
    const config = getAiConfig();
    const provider = getChatProvider();
    const { signal, dispose } = withTimeout(config.timeoutMs, options.signal);
    const startedAt = performance.now();

    /**
     * Retry policy for streams is split at the first emitted byte.
     *
     * Opening the stream is safely retryable — nothing has reached the caller
     * yet, and providers commonly reject the initial request with a transient
     * 503. Once a delta has been yielded, a retry would restart generation and
     * duplicate output, so from that point failures propagate.
     */
    try {
      let emitted = false;

      for (let attempt = 0; ; attempt += 1) {
        const iterator = provider.stream(messages, { ...options, signal })[Symbol.asyncIterator]();

        try {
          for (;;) {
            const next = await iterator.next();
            if (next.done) return;

            const chunk = next.value;
            emitted = true;

            if (chunk.type === 'done') {
              logger.info('ai.stream', {
                provider: provider.name,
                model: chunk.model,
                latencyMs: Math.round(performance.now() - startedAt),
                inputTokens: chunk.usage.inputTokens,
                outputTokens: chunk.usage.outputTokens,
                finishReason: chunk.finishReason,
              });
            }

            yield chunk;
          }
        } catch (error) {
          await iterator.return?.(undefined);

          const aiError = toAiError(error, provider.name);
          const canRetry =
            !emitted && aiError.retryable && attempt < config.maxRetries && !options.signal?.aborted;

          if (!canRetry) throw aiError;

          const wait = delayFor(attempt, aiError.retryAfterSeconds);
          logger.warn('ai.retry', {
            provider: provider.name,
            operation: 'stream.open',
            code: aiError.code,
            attempt: attempt + 1,
            maxRetries: config.maxRetries,
            waitMs: Math.round(wait),
          });
          await sleep(wait, options.signal);
        }
      }
    } finally {
      dispose();
    }
  },

  async embed(inputs: string[], options: EmbedOptions = {}): Promise<EmbedResult> {
    const config = getAiConfig();
    const provider = getEmbeddingProvider();

    if (inputs.length === 0) {
      return { vectors: [], ...this.embeddingTag() };
    }

    const { signal, dispose } = withTimeout(config.timeoutMs, options.signal);
    const startedAt = performance.now();

    try {
      const result = await withRetry(() => provider.embed(inputs, { ...options, signal }), {
        maxRetries: config.maxRetries,
        provider: provider.name,
        operation: 'embed',
        signal: options.signal,
      });

      logger.info('ai.embed', {
        provider: provider.name,
        model: result.model,
        latencyMs: Math.round(performance.now() - startedAt),
        count: inputs.length,
        dimensions: result.dimensions,
      });

      return result;
    } finally {
      dispose();
    }
  },

  /** Convenience for the common single-string case. */
  async embedOne(input: string, options: EmbedOptions = {}): Promise<{ vector: number[]; tag: EmbeddingTag }> {
    const result = await this.embed([input], options);
    const { vectors, ...tag } = result;
    return { vector: vectors[0] ?? [], tag };
  },

  async health(): Promise<{ chat: boolean; embedding: boolean }> {
    const [chat, embedding] = await Promise.all([
      getChatProvider().health(),
      getEmbeddingProvider().health(),
    ]);
    return { chat, embedding };
  },
};

export type AiClient = typeof aiClient;
