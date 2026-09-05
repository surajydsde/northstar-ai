import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiError } from './errors';
import type { AiProvider, ChatChunk } from './types';

const provider = {
  name: 'stub',
  chatModel: 'stub-chat',
  embeddingModel: 'stub-embed',
  chat: vi.fn(),
  stream: vi.fn(),
  embed: vi.fn(),
  health: vi.fn(),
} satisfies AiProvider & Record<string, unknown>;

vi.mock('./factory', () => ({
  getChatProvider: () => provider,
  getEmbeddingProvider: () => provider,
  resetProviders: () => {},
  createProvider: () => provider,
}));

const { aiClient } = await import('./client');

const transient = () => new AiError('overloaded', 'busy', { provider: 'stub', status: 503 });

async function* textThen(...deltas: string[]): AsyncGenerator<ChatChunk> {
  for (const delta of deltas) yield { type: 'text', delta };
  yield { type: 'done', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 }, model: 'stub-chat' };
}

async function collect(gen: AsyncGenerator<ChatChunk>): Promise<string> {
  let out = '';
  for await (const chunk of gen) if (chunk.type === 'text') out += chunk.delta;
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('aiClient.embed', () => {
  it('short-circuits an empty input without calling the provider', async () => {
    const result = await aiClient.embed([]);
    expect(result.vectors).toEqual([]);
    expect(result.provider).toBe('gemini');
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('embedOne unwraps the first vector and returns the tag', async () => {
    provider.embed.mockResolvedValue({
      vectors: [[0.1, 0.2]],
      provider: 'stub',
      model: 'stub-embed',
      dimensions: 2,
    });

    const { vector, tag } = await aiClient.embedOne('hello');
    expect(vector).toEqual([0.1, 0.2]);
    expect(tag).toEqual({ provider: 'stub', model: 'stub-embed', dimensions: 2 });
  });
});

describe('aiClient.stream — retry boundary', () => {
  /**
   * Opening the stream is safely retryable: nothing has reached the caller yet,
   * and a transient 503 on the initial request is common on free tiers.
   */
  it('retries when the stream fails before emitting anything', async () => {
    provider.stream
      .mockImplementationOnce(() => {
        return (async function* () {
          throw transient();
        })();
      })
      .mockImplementationOnce(() => textThen('hello ', 'world'));

    await expect(collect(aiClient.stream([{ role: 'user', content: 'hi' }]))).resolves.toBe('hello world');
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  /**
   * The critical half: once a delta has reached the caller, restarting
   * generation would duplicate output, so the failure must propagate.
   */
  it('does NOT retry once a delta has been emitted', async () => {
    provider.stream.mockImplementation(() =>
      (async function* () {
        yield { type: 'text', delta: 'partial' } as ChatChunk;
        throw transient();
      })(),
    );

    const received: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of aiClient.stream([{ role: 'user', content: 'hi' }])) {
          if (chunk.type === 'text') received.push(chunk.delta);
        }
      })(),
    ).rejects.toBeInstanceOf(AiError);

    expect(received).toEqual(['partial']);
    // One attempt only — no duplicated 'partial'.
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-retryable failure even before emitting', async () => {
    provider.stream.mockImplementation(() =>
      (async function* () {
        throw new AiError('bad_request', 'nope', { provider: 'stub', status: 400 });
      })(),
    );

    await expect(collect(aiClient.stream([{ role: 'user', content: 'hi' }]))).rejects.toMatchObject({
      code: 'bad_request',
    });
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries on open', async () => {
    provider.stream.mockImplementation(() =>
      (async function* () {
        throw transient();
      })(),
    );

    await expect(collect(aiClient.stream([{ role: 'user', content: 'hi' }]))).rejects.toBeInstanceOf(AiError);
    // Initial attempt plus AI_MAX_RETRIES (default 3).
    expect(provider.stream).toHaveBeenCalledTimes(4);
  });

  it('passes chunks through in order and terminates', async () => {
    provider.stream.mockImplementation(() => textThen('a', 'b', 'c'));
    await expect(collect(aiClient.stream([{ role: 'user', content: 'hi' }]))).resolves.toBe('abc');
  });
});

describe('aiClient.chat', () => {
  it('retries a transient failure', async () => {
    provider.chat.mockRejectedValueOnce(transient()).mockResolvedValue({
      content: 'ok',
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1 },
      model: 'stub-chat',
    });

    await expect(aiClient.chat([{ role: 'user', content: 'hi' }])).resolves.toMatchObject({ content: 'ok' });
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it('supplies an abort signal to the provider so requests are bounded', async () => {
    provider.chat.mockResolvedValue({
      content: 'ok',
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0 },
      model: 'stub-chat',
    });

    await aiClient.chat([{ role: 'user', content: 'hi' }]);
    expect(provider.chat.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
