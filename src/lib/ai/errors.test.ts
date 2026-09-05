import { describe, expect, it } from 'vitest';

import { AiError, codeForStatus, isAbort, toAiError, type AiErrorCode } from './errors';

describe('codeForStatus', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [408, 'timeout'],
    [429, 'rate_limit'],
    [400, 'bad_request'],
    [404, 'bad_request'],
    [500, 'unavailable'],
    [502, 'unavailable'],
    [503, 'overloaded'],
    [undefined, 'unknown'],
  ] as const)('maps %s to %s', (status, expected) => {
    expect(codeForStatus(status)).toBe(expected);
  });
});

describe('AiError.retryable', () => {
  const make = (code: AiErrorCode) => new AiError(code, 'x', { provider: 'test' });

  it.each(['rate_limit', 'overloaded', 'unavailable', 'timeout'] as const)('retries %s', (code) => {
    expect(make(code).retryable).toBe(true);
  });

  it.each(['auth', 'bad_request', 'content_filter', 'unknown'] as const)('does not retry %s', (code) => {
    expect(make(code).retryable).toBe(false);
  });
});

describe('AiError.httpStatus', () => {
  const status = (code: AiErrorCode) => new AiError(code, 'x', { provider: 'test' }).httpStatus;

  it('surfaces rate limiting as 429 rather than a blanket 500', () => {
    expect(status('rate_limit')).toBe(429);
  });

  it('surfaces a timeout as 504', () => {
    expect(status('timeout')).toBe(504);
  });

  it('surfaces overload and unavailability as 503', () => {
    expect(status('overloaded')).toBe(503);
    expect(status('unavailable')).toBe(503);
  });

  /**
   * A rejected API key is our misconfiguration, not the caller's fault, so it
   * must not be reported to the client as a 4xx.
   */
  it('reports a provider auth failure as 500, not 401', () => {
    expect(status('auth')).toBe(500);
  });
});

describe('isAbort', () => {
  it('recognises abort and timeout errors', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';

    expect(isAbort(abort)).toBe(true);
    expect(isAbort(timeout)).toBe(true);
    expect(isAbort(new Error('other'))).toBe(false);
    expect(isAbort('string')).toBe(false);
  });
});

describe('toAiError', () => {
  it('passes an AiError through unchanged', () => {
    const original = new AiError('rate_limit', 'x', { provider: 'gemini' });
    expect(toAiError(original, 'gemini')).toBe(original);
  });

  it('reads a status from either `status` or `statusCode`', () => {
    expect(toAiError(Object.assign(new Error('e'), { status: 429 }), 'g').code).toBe('rate_limit');
    expect(toAiError(Object.assign(new Error('e'), { statusCode: 503 }), 'g').code).toBe('overloaded');
  });

  it('classifies an abort as a timeout', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(toAiError(abort, 'g').code).toBe('timeout');
  });

  it('falls back to unknown when there is no status', () => {
    expect(toAiError(new Error('network down'), 'g').code).toBe('unknown');
  });

  /**
   * Provider error payloads can echo request content, and must never be
   * interpolated into a message that reaches logs or clients.
   */
  it('does not leak the provider payload into the error message', () => {
    const leaky = Object.assign(new Error('key=AIzaSyEXAMPLE user asked about salaries'), { status: 401 });
    const wrapped = toAiError(leaky, 'gemini');

    expect(wrapped.message).not.toContain('AIzaSy');
    expect(wrapped.message).not.toContain('salaries');
    expect(wrapped.message).toBe('The AI provider rejected the credentials.');
    // The original is still reachable for debugging, just not in the message.
    expect(wrapped.cause).toBe(leaky);
  });

  it('retains the provider name and status', () => {
    const wrapped = toAiError(Object.assign(new Error('e'), { status: 429 }), 'anthropic');
    expect(wrapped.provider).toBe('anthropic');
    expect(wrapped.status).toBe(429);
  });
});
