/**
 * The only module that reads AI-related environment variables.
 *
 * Unlike `@/lib/env`, this configuration **fails closed**: selecting a provider
 * without supplying its credentials throws at startup rather than booting into
 * a broken state.
 */

import { z } from 'zod';

export const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
/** Provider-neutral reasoning-effort hint. Currently honoured only by Gemini. */
export type ThinkingLevelName = (typeof THINKING_LEVELS)[number];

export const PROVIDER_NAMES = ['gemini', 'openai', 'anthropic'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/**
 * Per-provider defaults, so AI_CHAT_MODEL / AI_EMBEDDING_MODEL stay optional
 * and switching providers is a one-variable change.
 */
const DEFAULTS: Record<ProviderName, { chat: string; embedding: string | null }> = {
  // Verified against the live API on 2026-09-06. Note that `models.list()` is
  // not proof of access: `gemini-2.5-flash` is listed but returns 404
  // "no longer available to new users" for keys issued recently.
  // `gemini-embedding-2` exists but returned one vector for a two-input batch,
  // so `-001` remains the correct choice for batched indexing.
  gemini: { chat: 'gemini-3.8-flash', embedding: 'gemini-embedding-001' },
  openai: { chat: 'gpt-4o-mini', embedding: 'text-embedding-3-small' },
  // Anthropic ships no embeddings endpoint; AI_EMBEDDING_PROVIDER must point elsewhere.
  anthropic: { chat: 'claude-sonnet-4-5', embedding: null },
};

/**
 * `.env` files routinely carry empty placeholders (`AI_CHAT_MODEL=`). dotenv
 * surfaces those as empty strings, which would fail `.min(1)` and `z.enum()`
 * and refuse to boot. An empty value means "not set".
 */
const optional = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), inner.optional());

const schema = z.object({
  AI_PROVIDER: optional(z.enum(PROVIDER_NAMES)),
  AI_EMBEDDING_PROVIDER: optional(z.enum(PROVIDER_NAMES)),
  AI_CHAT_MODEL: optional(z.string().min(1)),
  AI_EMBEDDING_MODEL: optional(z.string().min(1)),
  AI_EMBEDDING_DIMENSIONS: optional(z.coerce.number().int().positive()),
  AI_REQUEST_TIMEOUT_MS: optional(z.coerce.number().int().positive()),
  AI_MAX_RETRIES: optional(z.coerce.number().int().min(0).max(10)),
  AI_TEMPERATURE: optional(z.coerce.number().min(0).max(2)),
  /** Gemini 3.x only. Lower levels cut time-to-first-token substantially. */
  AI_THINKING_LEVEL: optional(z.enum(THINKING_LEVELS)),

  GEMINI_API_KEY: optional(z.string()),
  OPENAI_API_KEY: optional(z.string()),
  OPENAI_BASE_URL: optional(z.string().url()),
  ANTHROPIC_API_KEY: optional(z.string()),
});

export interface AiConfig {
  chatProvider: ProviderName;
  embeddingProvider: ProviderName;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  thinkingLevel?: ThinkingLevelName;
  credentials: {
    gemini?: string;
    openai?: { apiKey: string; baseUrl?: string };
    anthropic?: string;
  };
}

function keyVarFor(provider: ProviderName): string {
  return provider === 'gemini' ? 'GEMINI_API_KEY' : provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
}

function build(source: NodeJS.ProcessEnv): AiConfig {
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid AI configuration — ${issues}`);
  }

  const env = parsed.data;
  const chatProvider = env.AI_PROVIDER ?? 'gemini';
  const embeddingProvider = env.AI_EMBEDDING_PROVIDER ?? chatProvider;

  const keys: Record<ProviderName, string | undefined> = {
    gemini: env.GEMINI_API_KEY,
    openai: env.OPENAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
  };

  // Fail closed: a provider is unusable without its key.
  for (const provider of new Set<ProviderName>([chatProvider, embeddingProvider])) {
    if (!keys[provider]?.trim()) {
      throw new Error(
        `AI configuration error: provider "${provider}" is selected but ${keyVarFor(provider)} is not set.`,
      );
    }
  }

  if (DEFAULTS[embeddingProvider].embedding === null && !env.AI_EMBEDDING_MODEL) {
    throw new Error(
      `AI configuration error: provider "${embeddingProvider}" does not offer embeddings. ` +
        `Set AI_EMBEDDING_PROVIDER to a provider that does (gemini or openai).`,
    );
  }

  return {
    chatProvider,
    embeddingProvider,
    chatModel: env.AI_CHAT_MODEL ?? DEFAULTS[chatProvider].chat,
    embeddingModel: env.AI_EMBEDDING_MODEL ?? DEFAULTS[embeddingProvider].embedding!,
    embeddingDimensions: env.AI_EMBEDDING_DIMENSIONS ?? 768,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS ?? 60_000,
    maxRetries: env.AI_MAX_RETRIES ?? 3,
    temperature: env.AI_TEMPERATURE ?? 0.2,
    thinkingLevel: env.AI_THINKING_LEVEL,
    credentials: {
      gemini: keys.gemini,
      openai: keys.openai ? { apiKey: keys.openai, baseUrl: env.OPENAI_BASE_URL } : undefined,
      anthropic: keys.anthropic,
    },
  };
}

let cached: AiConfig | null = null;

/** Validated configuration, resolved once per process. */
export function getAiConfig(): AiConfig {
  cached ??= build(process.env);
  return cached;
}

/** Test seam — lets a suite build a config without mutating process.env. */
export function buildAiConfig(source: NodeJS.ProcessEnv): AiConfig {
  return build(source);
}

/** Test seam — clears the memoised config. */
export function resetAiConfig(): void {
  cached = null;
}
