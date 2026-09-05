import OpenAI from 'openai';

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

const PROVIDER = 'openai';

export interface OpenAiProviderOptions {
  apiKey: string;
  /** Set for any OpenAI-compatible endpoint: Groq, Together, OpenRouter, Ollama. */
  baseUrl?: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  temperature: number;
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool_calls';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'unknown';
  }
}

export class OpenAiProvider implements AiProvider {
  readonly name = PROVIDER;
  readonly chatModel: string;
  readonly embeddingModel: string;

  private readonly client: OpenAI;
  private readonly dimensions: number;
  private readonly temperature: number;

  constructor(options: OpenAiProviderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl });
    this.chatModel = options.chatModel;
    this.embeddingModel = options.embeddingModel;
    this.dimensions = options.embeddingDimensions;
    this.temperature = options.temperature;
  }

  async chat(messages: AiMessage[], options?: ChatOptions): Promise<ChatResult> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: options?.model ?? this.chatModel,
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
          temperature: options?.temperature ?? this.temperature,
          max_tokens: options?.maxTokens,
          ...(options?.jsonSchema
            ? {
                response_format: {
                  type: 'json_schema' as const,
                  json_schema: { name: options.jsonSchema.name, schema: options.jsonSchema.schema, strict: true },
                },
              }
            : {}),
        },
        { signal: options?.signal },
      );

      const choice = response.choices[0];

      return {
        content: choice?.message?.content ?? '',
        finishReason: mapFinishReason(choice?.finish_reason),
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
        model: response.model ?? options?.model ?? this.chatModel,
      };
    } catch (error) {
      throw toAiError(error, PROVIDER);
    }
  }

  async *stream(messages: AiMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    let finishReason: FinishReason = 'unknown';
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let model = options?.model ?? this.chatModel;

    try {
      const iterator = await this.client.chat.completions.create(
        {
          model: options?.model ?? this.chatModel,
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
          temperature: options?.temperature ?? this.temperature,
          max_tokens: options?.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: options?.signal },
      );

      for await (const chunk of iterator) {
        const choice = chunk.choices[0];
        const delta = choice?.delta?.content;
        if (delta) yield { type: 'text', delta };
        if (choice?.finish_reason) finishReason = mapFinishReason(choice.finish_reason);
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          };
        }
        if (chunk.model) model = chunk.model;
      }
    } catch (error) {
      throw toAiError(error, PROVIDER);
    }

    yield { type: 'done', finishReason, usage, model };
  }

  async embed(inputs: string[], options?: EmbedOptions): Promise<EmbedResult> {
    const model = options?.model ?? this.embeddingModel;

    if (inputs.length === 0) {
      return { vectors: [], provider: PROVIDER, model, dimensions: this.dimensions };
    }

    try {
      const response = await this.client.embeddings.create(
        { model, input: inputs, dimensions: this.dimensions },
        { signal: options?.signal },
      );

      if (response.data.length !== inputs.length) {
        throw new AiError('unknown', 'The provider returned a different number of embeddings than inputs.', {
          provider: PROVIDER,
        });
      }

      // The API does not guarantee response order; `index` is authoritative.
      const ordered = [...response.data].sort((a, b) => a.index - b.index);

      return {
        vectors: ordered.map((item) => item.embedding),
        provider: PROVIDER,
        model,
        dimensions: this.dimensions,
      };
    } catch (error) {
      throw toAiError(error, PROVIDER);
    }
  }

  async health(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
