/**
 * Normalised error taxonomy. Every provider maps its SDK exceptions onto these
 * codes so route handlers can respond correctly without knowing the provider.
 */

export type AiErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'auth'
  | 'overloaded'
  | 'bad_request'
  | 'content_filter'
  | 'unavailable'
  | 'unknown';

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly provider: string;
  readonly status?: number;
  /** Seconds to wait before retrying, when the provider tells us. */
  readonly retryAfterSeconds?: number;

  constructor(
    code: AiErrorCode,
    message: string,
    options: { provider: string; status?: number; retryAfterSeconds?: number; cause?: unknown } ,
  ) {
    // Never interpolate the provider payload into the message: responses can
    // echo request content, and API keys must never reach a log line.
    super(message, { cause: options.cause });
    this.name = 'AiError';
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** Transient conditions worth retrying. */
  get retryable(): boolean {
    return this.code === 'rate_limit' || this.code === 'overloaded' || this.code === 'unavailable' || this.code === 'timeout';
  }

  /** HTTP status to surface to the client. */
  get httpStatus(): number {
    switch (this.code) {
      case 'rate_limit':
        return 429;
      case 'timeout':
        return 504;
      case 'overloaded':
      case 'unavailable':
        return 503;
      case 'bad_request':
      case 'content_filter':
        return 400;
      case 'auth':
        // A provider auth failure is a server misconfiguration, not a client error.
        return 500;
      default:
        return 500;
    }
  }
}

/** Maps an HTTP status onto the taxonomy. Shared by all providers. */
export function codeForStatus(status: number | undefined): AiErrorCode {
  if (status === undefined) return 'unknown';
  if (status === 401 || status === 403) return 'auth';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status === 503) return 'overloaded';
  if (status >= 500) return 'unavailable';
  if (status >= 400) return 'bad_request';
  return 'unknown';
}

/** Recognises an aborted request regardless of which layer raised it. */
export function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/**
 * Wraps an arbitrary provider exception as an AiError. `status` is read from
 * whichever shape the SDK uses without importing the SDK.
 */
export function toAiError(error: unknown, provider: string): AiError {
  if (error instanceof AiError) return error;

  if (isAbort(error)) {
    return new AiError('timeout', 'The AI request timed out or was aborted.', { provider, cause: error });
  }

  const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const rawStatus = typeof candidate?.status === 'number'
    ? candidate.status
    : typeof candidate?.statusCode === 'number'
      ? candidate.statusCode
      : undefined;

  const code = codeForStatus(rawStatus);
  const message =
    code === 'auth'
      ? 'The AI provider rejected the credentials.'
      : code === 'rate_limit'
        ? 'The AI provider rate limit was exceeded.'
        : 'The AI provider request failed.';

  return new AiError(code, message, { provider, status: rawStatus, cause: error });
}
