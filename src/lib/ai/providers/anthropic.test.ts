import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

const { AnthropicProvider } = await import('./anthropic');

const make = () =>
  new AnthropicProvider({ apiKey: 'test', chatModel: 'claude-sonnet-4-5', temperature: 0.2 });

const reply = (text: string, stopReason = 'end_turn') => ({
  content: [{ type: 'text', text }],
  stop_reason: stopReason,
  usage: { input_tokens: 3, output_tokens: 4 },
  model: 'claude-sonnet-4-5',
});

beforeEach(() => vi.clearAllMocks());

describe('AnthropicProvider — chat', () => {
  /** Anthropic takes the system prompt as a top-level field, not a message. */
  it('lifts system messages out of the turn list', async () => {
    create.mockResolvedValue(reply('hi'));

    await make().chat([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hello' },
    ]);

    const call = create.mock.calls[0]?.[0];
    expect(call.system).toBe('be terse');
    expect(call.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('omits system entirely when there is none', async () => {
    create.mockResolvedValue(reply('hi'));
    await make().chat([{ role: 'user', content: 'hello' }]);
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('system');
  });

  /** Anthropic rejects a request without an explicit output cap. */
  it('always sends max_tokens', async () => {
    create.mockResolvedValue(reply('hi'));
    await make().chat([{ role: 'user', content: 'hello' }]);
    expect(create.mock.calls[0]?.[0].max_tokens).toBe(4096);

    await make().chat([{ role: 'user', content: 'hello' }], { maxTokens: 100 });
    expect(create.mock.calls[1]?.[0].max_tokens).toBe(100);
  });

  it('concatenates multiple text blocks and ignores non-text blocks', async () => {
    create.mockResolvedValue({
      content: [
        { type: 'text', text: 'one ' },
        { type: 'thinking', thinking: 'ignored' },
        { type: 'text', text: 'two' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 2 },
      model: 'claude-sonnet-4-5',
    });

    expect((await make().chat([{ role: 'user', content: 'q' }])).content).toBe('one two');
  });

  it.each([
    ['end_turn', 'stop'],
    ['stop_sequence', 'stop'],
    ['max_tokens', 'length'],
    ['tool_use', 'tool_calls'],
    ['refusal', 'content_filter'],
    ['mystery', 'unknown'],
  ])('maps stop_reason %s to %s', async (raw, expected) => {
    create.mockResolvedValue(reply('x', raw));
    expect((await make().chat([{ role: 'user', content: 'q' }])).finishReason).toBe(expected);
  });

  it('wraps SDK errors', async () => {
    create.mockRejectedValue(Object.assign(new Error('bad'), { status: 401 }));
    await expect(make().chat([{ role: 'user', content: 'q' }])).rejects.toMatchObject({
      code: 'auth',
      provider: 'anthropic',
    });
  });
});

describe('AnthropicProvider — embeddings', () => {
  /**
   * Anthropic has no embeddings endpoint. Returning empty vectors would
   * silently disable retrieval, so this must be a loud failure. `config.ts`
   * prevents it being reachable in practice.
   */
  it('throws a directive error instead of returning empty vectors', async () => {
    await expect(make().embed(['a'])).rejects.toMatchObject({
      code: 'bad_request',
      provider: 'anthropic',
    });
    await expect(make().embed(['a'])).rejects.toThrow(/AI_EMBEDDING_PROVIDER/);
  });
});

describe('AnthropicProvider — health', () => {
  it('reports true when a minimal request succeeds', async () => {
    create.mockResolvedValue(reply('ok'));
    await expect(make().health()).resolves.toBe(true);
  });

  it('reports false rather than throwing', async () => {
    create.mockRejectedValue(new Error('down'));
    await expect(make().health()).resolves.toBe(false);
  });
});
