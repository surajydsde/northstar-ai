import { describe, expect, it, vi } from 'vitest';

import { AiError, type AiErrorCode } from './errors';
import { delayFor, withRetry, withTimeout } from './retry';

const opts = { maxRetries: 3, provider: 'test', operation: 'unit' };

const fail = (code: AiErrorCode, status?: number) =>
  new AiError(code, 'boom', { provider: 'test', status });

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const task = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(task, opts)).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(fail('overloaded', 503))
      .mockResolvedValue('recovered');

    await expect(withRetry(task, opts)).resolves.toBe('recovered');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and throws the last error', async () => {
    const task = vi.fn().mockRejectedValue(fail('rate_limit', 429));

    await expect(withRetry(task, { ...opts, maxRetries: 2 })).rejects.toMatchObject({
      code: 'rate_limit',
    });
    // Initial attempt plus two retries.
    expect(task).toHaveBeenCalledTimes(3);
  });

  /** A 4xx that is not 429 is a caller error; retrying it just wastes quota. */
  it('does not retry a non-retryable error', async () => {
    const task = vi.fn().mockRejectedValue(fail('bad_request', 400));

    await expect(withRetry(task, opts)).rejects.toMatchObject({ code: 'bad_request' });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not retry an auth failure', async () => {
    const task = vi.fn().mockRejectedValue(fail('auth', 401));

    await expect(withRetry(task, opts)).rejects.toMatchObject({ code: 'auth' });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('normalises a raw SDK exception into an AiError', async () => {
    const task = vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { status: 400 }));
    await expect(withRetry(task, opts)).rejects.toBeInstanceOf(AiError);
  });

  it('stops retrying once the caller aborts', async () => {
    const controller = new AbortController();
    const task = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(fail('overloaded', 503));
    });

    await expect(withRetry(task, { ...opts, signal: controller.signal })).rejects.toBeInstanceOf(AiError);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('never retries when maxRetries is zero', async () => {
    const task = vi.fn().mockRejectedValue(fail('overloaded', 503));
    await expect(withRetry(task, { ...opts, maxRetries: 0 })).rejects.toBeInstanceOf(AiError);
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe('delayFor', () => {
  it('honours a provider Retry-After hint', () => {
    expect(delayFor(0, 2)).toBe(2000);
  });

  it('caps a large Retry-After', () => {
    expect(delayFor(0, 3600)).toBe(20_000);
  });

  it('grows the backoff ceiling with each attempt', () => {
    const sample = (attempt: number) =>
      Math.max(...Array.from({ length: 200 }, () => delayFor(attempt)));

    expect(sample(0)).toBeLessThanOrEqual(500);
    expect(sample(3)).toBeGreaterThan(sample(0));
  });

  it('stays within the cap at high attempt counts', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(delayFor(20)).toBeLessThanOrEqual(20_000);
    }
  });

  /** Full jitter: identical inputs must not produce identical delays. */
  it('applies jitter', () => {
    const values = new Set(Array.from({ length: 50 }, () => delayFor(4)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('withTimeout', () => {
  it('returns a signal that aborts on timeout', async () => {
    const { signal, dispose } = withTimeout(10);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(signal.aborted).toBe(true);
    dispose();
  });

  it('aborts when the caller signal aborts', () => {
    const controller = new AbortController();
    const { signal, dispose } = withTimeout(60_000, controller.signal);

    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
    dispose();
  });

  it('is already aborted when the caller signal was aborted up front', () => {
    const controller = new AbortController();
    controller.abort();
    const { signal, dispose } = withTimeout(60_000, controller.signal);

    expect(signal.aborted).toBe(true);
    dispose();
  });
});
