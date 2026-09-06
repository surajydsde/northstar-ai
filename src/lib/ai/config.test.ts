import { describe, expect, it } from 'vitest';

import { buildAiConfig } from './config';

const KEY = 'test-key';

/**
 * Builds a `ProcessEnv` for a test case. Next augments `ProcessEnv` so that
 * `NODE_ENV` is required, hence the explicit default.
 */
const env = (values: Record<string, string>): NodeJS.ProcessEnv => ({
  ...values,
  NODE_ENV: 'test',
});

describe('AI configuration — fails closed', () => {
  it('refuses to build when the selected provider has no key', () => {
    expect(() => buildAiConfig(env({ AI_PROVIDER: 'openai' }))).toThrow(
      /provider "openai" is selected but OPENAI_API_KEY is not set/,
    );
  });

  it('treats a whitespace-only key as missing', () => {
    expect(() => buildAiConfig(env({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: '   ' }))).toThrow(
      /GEMINI_API_KEY is not set/,
    );
  });

  it('requires a key for the embedding provider too, not just the chat provider', () => {
    expect(() =>
      buildAiConfig(
        env({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: KEY, AI_EMBEDDING_PROVIDER: 'openai' }),
      ),
    ).toThrow(/provider "openai" is selected but OPENAI_API_KEY is not set/);
  });

  it('rejects Anthropic as an embedding provider, since it has no embeddings API', () => {
    expect(() =>
      buildAiConfig(env({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: KEY })),
    ).toThrow(/does not offer embeddings/);
  });

  it('allows Anthropic for chat when embeddings are delegated elsewhere', () => {
    const config = buildAiConfig(
      env({
        AI_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: KEY,
        AI_EMBEDDING_PROVIDER: 'gemini',
        GEMINI_API_KEY: KEY,
      }),
    );

    expect(config.chatProvider).toBe('anthropic');
    expect(config.embeddingProvider).toBe('gemini');
    expect(config.embeddingModel).toBe('gemini-embedding-001');
  });

  it('rejects an unknown provider name', () => {
    expect(() => buildAiConfig(env({ AI_PROVIDER: 'llamafile' }))).toThrow(/Invalid AI configuration/);
  });
});

describe('AI configuration — empty values mean unset', () => {
  /**
   * `.env` files routinely carry empty placeholders (`AI_CHAT_MODEL=`), and
   * dotenv surfaces those as empty strings. Treating them as real values made
   * `.env.example` itself fail validation when copied.
   */
  it('falls back to defaults when optional values are empty strings', () => {
    const config = buildAiConfig(
      env({
        AI_PROVIDER: '',
        GEMINI_API_KEY: KEY,
        AI_CHAT_MODEL: '',
        AI_EMBEDDING_MODEL: '',
        AI_EMBEDDING_PROVIDER: '',
        AI_THINKING_LEVEL: '',
        OPENAI_BASE_URL: '',
        AI_EMBEDDING_DIMENSIONS: '',
        AI_MAX_RETRIES: '',
      }),
    );

    expect(config.chatProvider).toBe('gemini');
    expect(config.chatModel).toBe('gemini-3.8-flash');
    expect(config.embeddingModel).toBe('gemini-embedding-001');
    expect(config.embeddingDimensions).toBe(768);
    expect(config.maxRetries).toBe(3);
    expect(config.thinkingLevel).toBeUndefined();
  });
});

describe('AI configuration — values', () => {
  it('defaults the embedding provider to the chat provider', () => {
    const config = buildAiConfig(env({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: KEY }));
    expect(config.embeddingProvider).toBe('gemini');
  });

  it('honours explicit model overrides', () => {
    const config = buildAiConfig(
      env({
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: KEY,
        AI_CHAT_MODEL: 'gemini-3.5-flash',
        AI_EMBEDDING_DIMENSIONS: '1536',
      }),
    );

    expect(config.chatModel).toBe('gemini-3.5-flash');
    expect(config.embeddingDimensions).toBe(1536);
  });

  it('carries an OpenAI-compatible base URL through', () => {
    const config = buildAiConfig(
      env({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: KEY,
        OPENAI_BASE_URL: 'https://api.groq.com/openai/v1',
      }),
    );

    expect(config.credentials.openai?.baseUrl).toBe('https://api.groq.com/openai/v1');
  });

  it('rejects a malformed base URL', () => {
    expect(() =>
      buildAiConfig(env({ AI_PROVIDER: 'openai', OPENAI_API_KEY: KEY, OPENAI_BASE_URL: 'not-a-url' })),
    ).toThrow(/Invalid AI configuration/);
  });

  it('rejects an out-of-range retry count', () => {
    expect(() =>
      buildAiConfig(env({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: KEY, AI_MAX_RETRIES: '99' })),
    ).toThrow(/Invalid AI configuration/);
  });
});
