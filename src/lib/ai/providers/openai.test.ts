import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
const embeddingsCreate = vi.fn();
const modelsList = vi.fn();
const captured: { apiKey?: string; baseURL?: string }[] = [];

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
    embeddings = { create: embeddingsCreate };
    models = { list: modelsList };
    constructor(options: { apiKey: string; baseURL?: string }) {
      captured.push(options);
    }
  },
}));

const { OpenAiProvider } = await import('./openai');

const make = (baseUrl?: string) =>
  new OpenAiProvider({
    apiKey: 'test',
    baseUrl,
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 4,
    temperature: 0.2,
  });

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
});

describe('OpenAiProvider — chat', () => {
  it('passes roles through unchanged and maps the result', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
      model: 'gpt-4o-mini',
    });

    const result = await make().chat([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hello' },
    ]);

    expect(create.mock.calls[0]?.[0].messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hello' },
    ]);
    expect(result).toMatchObject({
      content: 'hi',
      finishReason: 'stop',
      usage: { inputTokens: 3, outputTokens: 4 },
    });
  });

  it.each([
    ['length', 'length'],
    ['tool_calls', 'tool_calls'],
    ['content_filter', 'content_filter'],
    ['something_new', 'unknown'],
  ])('maps finish_reason %s to %s', async (raw, expected) => {
    create.mockResolvedValue({ choices: [{ message: { content: '' }, finish_reason: raw }], usage: {} });
    expect((await make().chat([{ role: 'user', content: 'q' }])).finishReason).toBe(expected);
  });

  it('wraps an SDK error with the mapped code', async () => {
    create.mockRejectedValue(Object.assign(new Error('limit'), { status: 429 }));
    await expect(make().chat([{ role: 'user', content: 'q' }])).rejects.toMatchObject({
      code: 'rate_limit',
      provider: 'openai',
    });
  });
});

describe('OpenAiProvider — OpenAI-compatible endpoints', () => {
  it('forwards a custom base URL to the SDK', () => {
    make('https://api.groq.com/openai/v1');
    expect(captured[0]?.baseURL).toBe('https://api.groq.com/openai/v1');
  });

  it('leaves the base URL undefined when not configured', () => {
    make();
    expect(captured[0]?.baseURL).toBeUndefined();
  });
});

describe('OpenAiProvider — embeddings', () => {
  it('reorders results by index rather than trusting response order', async () => {
    // The API does not guarantee ordering; `index` is authoritative.
    embeddingsCreate.mockResolvedValue({
      data: [
        { index: 1, embedding: [9, 9] },
        { index: 0, embedding: [1, 1] },
      ],
    });

    const result = await make().embed(['first', 'second']);
    expect(result.vectors).toEqual([
      [1, 1],
      [9, 9],
    ]);
  });

  it('throws when the count does not match the inputs', async () => {
    embeddingsCreate.mockResolvedValue({ data: [{ index: 0, embedding: [1] }] });
    await expect(make().embed(['a', 'b'])).rejects.toMatchObject({ provider: 'openai' });
  });

  it('requests the configured dimensionality', async () => {
    embeddingsCreate.mockResolvedValue({ data: [{ index: 0, embedding: [1, 0, 0, 0] }] });
    await make().embed(['a']);
    expect(embeddingsCreate.mock.calls[0]?.[0].dimensions).toBe(4);
  });

  it('skips the call for empty input', async () => {
    await expect(make().embed([])).resolves.toMatchObject({ vectors: [] });
    expect(embeddingsCreate).not.toHaveBeenCalled();
  });
});

describe('OpenAiProvider — health', () => {
  it('reports true when the API answers', async () => {
    modelsList.mockResolvedValue({ data: [] });
    await expect(make().health()).resolves.toBe(true);
  });

  it('reports false rather than throwing', async () => {
    modelsList.mockRejectedValue(new Error('down'));
    await expect(make().health()).resolves.toBe(false);
  });
});
