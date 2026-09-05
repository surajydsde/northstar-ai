import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = {}; } }));
vi.mock('openai', () => ({ default: class { chat = {}; embeddings = {}; models = {}; } }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = {}; } }));

const { buildAiConfig } = await import('./config');
const { createProvider, getChatProvider, getEmbeddingProvider, resetProviders } = await import('./factory');

const KEY = 'test-key';

const configFor = (env: Record<string, string>) => buildAiConfig(env as NodeJS.ProcessEnv);

beforeEach(() => resetProviders());

describe('createProvider', () => {
  it('builds a Gemini provider', () => {
    const provider = createProvider('gemini', configFor({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: KEY }));
    expect(provider.name).toBe('gemini');
    expect(provider.chatModel).toBe('gemini-3.8-flash');
  });

  it('builds an OpenAI provider', () => {
    const provider = createProvider('openai', configFor({ AI_PROVIDER: 'openai', OPENAI_API_KEY: KEY }));
    expect(provider.name).toBe('openai');
    expect(provider.chatModel).toBe('gpt-4o-mini');
  });

  it('builds an Anthropic provider', () => {
    const config = configFor({
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: KEY,
      AI_EMBEDDING_PROVIDER: 'gemini',
      GEMINI_API_KEY: KEY,
    });
    const provider = createProvider('anthropic', config);
    expect(provider.name).toBe('anthropic');
  });

  it('refuses to build a provider whose credentials are absent', () => {
    // A config built for Gemini carries no OpenAI credentials.
    const config = configFor({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: KEY });
    expect(() => createProvider('openai', config)).toThrow(/OPENAI_API_KEY is not configured/);
    expect(() => createProvider('anthropic', config)).toThrow(/ANTHROPIC_API_KEY is not configured/);
  });

  it('every provider satisfies the AiProvider surface', () => {
    const provider = createProvider('gemini', configFor({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: KEY }));
    for (const method of ['chat', 'stream', 'embed', 'health'] as const) {
      expect(typeof provider[method]).toBe('function');
    }
  });
});

describe('provider memoisation', () => {
  it('reuses the same instance across calls', () => {
    expect(getChatProvider()).toBe(getChatProvider());
  });

  it('returns the same instance for chat and embeddings when both use one provider', () => {
    // The test environment configures gemini for both.
    expect(getChatProvider()).toBe(getEmbeddingProvider());
  });

  it('resetProviders clears the cache', () => {
    const before = getChatProvider();
    resetProviders();
    expect(getChatProvider()).not.toBe(before);
  });
});
