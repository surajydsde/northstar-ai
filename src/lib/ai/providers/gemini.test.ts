import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const embedContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent, embedContent, generateContentStream: vi.fn() };
  },
}));

const { GeminiProvider } = await import('./gemini');

const make = () =>
  new GeminiProvider({
    apiKey: 'test',
    chatModel: 'gemini-3.8-flash',
    embeddingModel: 'gemini-embedding-001',
    embeddingDimensions: 4,
    temperature: 0.2,
  });

const ok = (text: string, finishReason = 'STOP') => ({
  text,
  candidates: [{ finishReason }],
  usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
  modelVersion: 'gemini-3.8-flash',
});

beforeEach(() => vi.clearAllMocks());

describe('GeminiProvider — message mapping', () => {
  it('maps assistant turns to Gemini "model" role', async () => {
    generateContent.mockResolvedValue(ok('hi'));

    await make().chat([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'second' },
    ]);

    expect(generateContent.mock.calls[0]?.[0].contents).toEqual([
      { role: 'user', parts: [{ text: 'first' }] },
      { role: 'model', parts: [{ text: 'reply' }] },
      { role: 'user', parts: [{ text: 'second' }] },
    ]);
  });

  /** Gemini takes the system prompt out-of-band, not as a message turn. */
  it('lifts system messages into systemInstruction', async () => {
    generateContent.mockResolvedValue(ok('hi'));

    await make().chat([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hello' },
    ]);

    const call = generateContent.mock.calls[0]?.[0];
    expect(call.config.systemInstruction).toBe('be terse');
    expect(call.contents).toEqual([{ role: 'user', parts: [{ text: 'hello' }] }]);
  });

  it('joins multiple system messages', async () => {
    generateContent.mockResolvedValue(ok('hi'));

    await make().chat([
      { role: 'system', content: 'one' },
      { role: 'system', content: 'two' },
      { role: 'user', content: 'hello' },
    ]);

    expect(generateContent.mock.calls[0]?.[0].config.systemInstruction).toBe('one\n\ntwo');
  });

  it('omits systemInstruction when there is no system message', async () => {
    generateContent.mockResolvedValue(ok('hi'));
    await make().chat([{ role: 'user', content: 'hello' }]);
    expect(generateContent.mock.calls[0]?.[0].config.systemInstruction).toBeUndefined();
  });
});

describe('GeminiProvider — result mapping', () => {
  it('reports usage and finish reason', async () => {
    generateContent.mockResolvedValue(ok('answer'));
    const result = await make().chat([{ role: 'user', content: 'q' }]);

    expect(result).toMatchObject({
      content: 'answer',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 7 },
      model: 'gemini-3.8-flash',
    });
  });

  it('maps MAX_TOKENS to length', async () => {
    generateContent.mockResolvedValue(ok('truncated', 'MAX_TOKENS'));
    expect((await make().chat([{ role: 'user', content: 'q' }])).finishReason).toBe('length');
  });

  it('raises a content_filter error when a blocked response has no text', async () => {
    generateContent.mockResolvedValue({ text: '', candidates: [{ finishReason: 'SAFETY' }] });
    await expect(make().chat([{ role: 'user', content: 'q' }])).rejects.toMatchObject({
      code: 'content_filter',
    });
  });

  it('wraps an SDK error as an AiError with the mapped code', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('busy'), { status: 503 }));
    await expect(make().chat([{ role: 'user', content: 'q' }])).rejects.toMatchObject({
      code: 'overloaded',
      provider: 'gemini',
    });
  });
});

describe('GeminiProvider — embeddings', () => {
  it('returns one normalised vector per input, tagged', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [3, 4, 0, 0] }] });

    const result = await make().embed(['a']);
    // 3-4-0-0 has magnitude 5, so normalisation yields 0.6/0.8.
    expect(result.vectors[0]?.[0]).toBeCloseTo(0.6, 10);
    expect(result.vectors[0]?.[1]).toBeCloseTo(0.8, 10);
    expect(result).toMatchObject({ provider: 'gemini', model: 'gemini-embedding-001', dimensions: 4 });
  });

  it('requests the configured dimensionality', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0, 0] }] });
    await make().embed(['a']);
    expect(embedContent.mock.calls[0]?.[0].config.outputDimensionality).toBe(4);
  });

  /** Asymmetric retrieval: stored passages and queries are embedded differently. */
  it('uses RETRIEVAL_DOCUMENT for passages and RETRIEVAL_QUERY for queries', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0, 0] }] });

    await make().embed(['a'], { purpose: 'document' });
    expect(embedContent.mock.calls[0]?.[0].config.taskType).toBe('RETRIEVAL_DOCUMENT');

    await make().embed(['a'], { purpose: 'query' });
    expect(embedContent.mock.calls[1]?.[0].config.taskType).toBe('RETRIEVAL_QUERY');
  });

  /**
   * Observed live: `gemini-embedding-2` returned a single vector for a
   * two-input batch. Without this assertion, chunk N would silently receive
   * chunk M's vector.
   */
  it('throws when the provider returns fewer vectors than inputs', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0, 0] }] });

    await expect(make().embed(['a', 'b'])).rejects.toMatchObject({ provider: 'gemini' });
  });

  it('does not call the API for an empty input', async () => {
    const result = await make().embed([]);
    expect(result.vectors).toEqual([]);
    expect(embedContent).not.toHaveBeenCalled();
  });

  it('leaves a zero vector alone instead of dividing by zero', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [0, 0, 0, 0] }] });
    const result = await make().embed(['a']);
    expect(result.vectors[0]).toEqual([0, 0, 0, 0]);
  });
});
