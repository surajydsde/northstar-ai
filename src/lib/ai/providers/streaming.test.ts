/**
 * Streaming behaviour across all three providers.
 *
 * Each vendor emits a different event shape; these tests pin the normalisation
 * into the shared `ChatChunk` union, including that a terminal `done` chunk
 * always arrives carrying usage and finish reason.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatChunk } from '../types';

const geminiStream = vi.fn();
const openaiCreate = vi.fn();
const anthropicCreate = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContentStream: geminiStream, generateContent: vi.fn(), embedContent: vi.fn() };
  },
}));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
    embeddings = { create: vi.fn() };
    models = { list: vi.fn() };
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

const { GeminiProvider } = await import('./gemini');
const { OpenAiProvider } = await import('./openai');
const { AnthropicProvider } = await import('./anthropic');

async function* gen<T>(...items: T[]) {
  for (const item of items) yield item;
}

async function drain(stream: AsyncGenerator<ChatChunk>) {
  const text: string[] = [];
  let done: Extract<ChatChunk, { type: 'done' }> | undefined;
  for await (const chunk of stream) {
    if (chunk.type === 'text') text.push(chunk.delta);
    if (chunk.type === 'done') done = chunk;
  }
  return { text, done };
}

const gemini = () =>
  new GeminiProvider({
    apiKey: 'k',
    chatModel: 'gemini-3.8-flash',
    embeddingModel: 'e',
    embeddingDimensions: 4,
    temperature: 0.2,
  });

const openai = () =>
  new OpenAiProvider({
    apiKey: 'k',
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'e',
    embeddingDimensions: 4,
    temperature: 0.2,
  });

const anthropic = () => new AnthropicProvider({ apiKey: 'k', chatModel: 'claude-sonnet-4-5', temperature: 0.2 });

beforeEach(() => vi.clearAllMocks());

describe('Gemini streaming', () => {
  it('yields text deltas then a done chunk with usage', async () => {
    geminiStream.mockResolvedValue(
      gen(
        { text: 'Hello ', candidates: [{}] },
        { text: 'world', candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 }, modelVersion: 'gemini-3.8-flash' },
      ),
    );

    const { text, done } = await drain(gemini().stream([{ role: 'user', content: 'hi' }]));
    expect(text).toEqual(['Hello ', 'world']);
    expect(done).toMatchObject({
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 2 },
      model: 'gemini-3.8-flash',
    });
  });

  it('skips empty deltas', async () => {
    geminiStream.mockResolvedValue(gen({ text: '', candidates: [{}] }, { text: 'x', candidates: [{ finishReason: 'STOP' }] }));
    const { text } = await drain(gemini().stream([{ role: 'user', content: 'hi' }]));
    expect(text).toEqual(['x']);
  });

  it('still emits done when the stream produced nothing', async () => {
    geminiStream.mockResolvedValue(gen());
    const { text, done } = await drain(gemini().stream([{ role: 'user', content: 'hi' }]));
    expect(text).toEqual([]);
    expect(done).toMatchObject({ finishReason: 'unknown' });
  });

  it('wraps a failure while opening the stream', async () => {
    geminiStream.mockRejectedValue(Object.assign(new Error('busy'), { status: 503 }));
    await expect(drain(gemini().stream([{ role: 'user', content: 'hi' }]))).rejects.toMatchObject({
      code: 'overloaded',
      provider: 'gemini',
    });
  });

  it('wraps a failure mid-stream', async () => {
    geminiStream.mockResolvedValue(
      (async function* () {
        yield { text: 'partial', candidates: [{}] };
        throw Object.assign(new Error('dropped'), { status: 500 });
      })(),
    );

    await expect(drain(gemini().stream([{ role: 'user', content: 'hi' }]))).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
});

describe('OpenAI streaming', () => {
  it('accumulates deltas and reads usage from the final chunk', async () => {
    openaiCreate.mockResolvedValue(
      gen(
        { choices: [{ delta: { content: 'Hel' } }], model: 'gpt-4o-mini' },
        { choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 4, completion_tokens: 2 } },
      ),
    );

    const { text, done } = await drain(openai().stream([{ role: 'user', content: 'hi' }]));
    expect(text).toEqual(['Hel', 'lo']);
    expect(done).toMatchObject({ finishReason: 'stop', usage: { inputTokens: 4, outputTokens: 2 } });
  });

  it('requests usage in the stream options', async () => {
    openaiCreate.mockResolvedValue(gen());
    await drain(openai().stream([{ role: 'user', content: 'hi' }]));
    expect(openaiCreate.mock.calls[0]?.[0].stream).toBe(true);
    expect(openaiCreate.mock.calls[0]?.[0].stream_options).toEqual({ include_usage: true });
  });

  it('wraps stream failures', async () => {
    openaiCreate.mockRejectedValue(Object.assign(new Error('limit'), { status: 429 }));
    await expect(drain(openai().stream([{ role: 'user', content: 'hi' }]))).rejects.toMatchObject({
      code: 'rate_limit',
    });
  });
});

describe('Anthropic streaming', () => {
  it('maps event types and splits usage across message_start and message_delta', async () => {
    anthropicCreate.mockResolvedValue(
      gen(
        { type: 'message_start', message: { usage: { input_tokens: 6 }, model: 'claude-sonnet-4-5' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'there' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
      ),
    );

    const { text, done } = await drain(anthropic().stream([{ role: 'user', content: 'hi' }]));
    expect(text).toEqual(['Hi ', 'there']);
    expect(done).toMatchObject({
      finishReason: 'stop',
      usage: { inputTokens: 6, outputTokens: 3 },
      model: 'claude-sonnet-4-5',
    });
  });

  it('ignores non-text delta events', async () => {
    anthropicCreate.mockResolvedValue(
      gen(
        { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      ),
    );

    const { text } = await drain(anthropic().stream([{ role: 'user', content: 'hi' }]));
    expect(text).toEqual(['answer']);
  });

  it('wraps stream failures', async () => {
    anthropicCreate.mockRejectedValue(Object.assign(new Error('nope'), { status: 400 }));
    await expect(drain(anthropic().stream([{ role: 'user', content: 'hi' }]))).rejects.toMatchObject({
      code: 'bad_request',
    });
  });
});
