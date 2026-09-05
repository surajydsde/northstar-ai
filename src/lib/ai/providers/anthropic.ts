import Anthropic from '@anthropic-ai/sdk';

import { AiError, toAiError } from '../errors';
import type {
  AiMessage,
  AiProvider,
  ChatChunk,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  FinishReason,
  TokenUsage,
} from '../types';

const PROVIDER = 'anthropic';

/** Anthropic requires an explicit output cap on every request. */
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicProviderOptions {
  apiKey: string;
  chatModel: string;
  temperature: number;
}

function mapStopReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    case 'refusal':
      return 'content_filter';
    default:
      return 'unknown';
  }
}

/** Anthropic takes the system prompt out-of-band rather than as a message. */
function split(messages: AiMessage[]): { system?: string; turns: Anthropic.MessageParam[] } {
  const systemParts: string[] = [];
  const turns: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    turns.push({ role: message.role, content: message.content });
  }

  return { system: systemParts.length ? systemParts.join('\n\n') : undefined, turns };
}

export class AnthropicProvider implements AiProvider {
  readonly name = PROVIDER;
  readonly chatModel: string;
  /** Anthropic ships no embeddings endpoint — see `embed`. */
  readonly embeddingModel = '';

  private readonly client: Anthropic;
  private readonly temperature: number;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.chatModel = options.chatModel;
    this.temperature = options.temperature;
  }

  async chat(messages: AiMessage[], options?: ChatOptions): Promise<ChatResult> {
    try {
      const { system, turns } = split(messages);
      const response = await this.client.messages.create(
        {
          model: options?.model ?? this.chatModel,
          max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: options?.temperature ?? this.temperature,
          ...(system ? { system } : {}),
          messages: turns,
        },
        { signal: options?.signal },
      );

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        content,
        finishReason: mapStopReason(response.stop_reason),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
      };
    } catch (error) {
      throw toAiError(error, PROVIDER);
    }
  }

  async *stream(messages: AiMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    let finishReason: FinishReason = 'unknown';
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let model = options?.model ?? this.chatModel;

    try {
      const { system, turns } = split(messages);
      const iterator = await this.client.messages.create(
        {
          model: options?.model ?? this.chatModel,
          max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: options?.temperature ?? this.temperature,
          ...(system ? { system } : {}),
          messages: turns,
          stream: true,
        },
        { signal: options?.signal },
      );

      for await (const event of iterator) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', delta: event.delta.text };
        } else if (event.type === 'message_start') {
          usage.inputTokens = event.message.usage.input_tokens;
          model = event.message.model;
        } else if (event.type === 'message_delta') {
          finishReason = mapStopReason(event.delta.stop_reason);
          usage.outputTokens = event.usage.output_tokens;
        }
      }
    } catch (error) {
      throw toAiError(error, PROVIDER);
    }

    yield { type: 'done', finishReason, usage, model };
  }

  /**
   * Anthropic has no embeddings API. `config.ts` refuses to start with
   * `AI_EMBEDDING_PROVIDER=anthropic`, so this should be unreachable; it throws
   * rather than returning empty vectors, which would silently disable retrieval.
   */
  async embed(_inputs: string[], _options?: EmbedOptions): Promise<EmbedResult> {
    throw new AiError(
      'bad_request',
      'Anthropic does not provide an embeddings API. Set AI_EMBEDDING_PROVIDER to gemini or openai.',
      { provider: PROVIDER },
    );
  }

  async health(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.chatModel,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
