import { logger } from '@/lib/logger';

import { AiError, toAiError } from './errors';

export interface RetryOptions {
  maxRetries: number;
  provider: string;
  operation: string;
  signal?: AbortSignal;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 20_000;

/** Exponential backoff with full jitter, capped, honouring a provider hint. */
export function delayFor(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)) {
    return Math.min(retryAfterSeconds * 1000, MAX_DELAY_MS);
  }
  const ceiling = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return Math.random() * ceiling;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Runs `task`, retrying only transient failures (429, 5xx, network). A 4xx
 * other than 429 is a caller error and is never retried.
 */
export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: AiError | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const aiError = toAiError(error, options.provider);

      // A caller-initiated abort is not a failure to retry through.
      if (options.signal?.aborted) throw aiError;
      if (!aiError.retryable || attempt === options.maxRetries) throw aiError;

      lastError = aiError;
      const wait = delayFor(attempt, aiError.retryAfterSeconds);

      logger.warn('ai.retry', {
        provider: options.provider,
        operation: options.operation,
        code: aiError.code,
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
        waitMs: Math.round(wait),
      });

      await sleep(wait, options.signal);
    }
  }

  /* istanbul ignore next — the loop either returns or throws. */
  throw lastError ?? new AiError('unknown', 'Retry loop exhausted.', { provider: options.provider });
}

/**
 * Composes a caller signal with a timeout so every provider request is bounded.
 * Returns the signal plus a cleanup function the caller must invoke.
 */
export function withTimeout(timeoutMs: number, signal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) return { signal: timeoutSignal, dispose: () => {} };

  const controller = new AbortController();
  const abort = (reason: unknown) => controller.abort(reason);
  const onCaller = () => abort(signal.reason);
  const onTimeout = () => abort(timeoutSignal.reason);

  if (signal.aborted) abort(signal.reason);
  else if (timeoutSignal.aborted) abort(timeoutSignal.reason);
  else {
    signal.addEventListener('abort', onCaller, { once: true });
    timeoutSignal.addEventListener('abort', onTimeout, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      signal.removeEventListener('abort', onCaller);
      timeoutSignal.removeEventListener('abort', onTimeout);
    },
  };
}
