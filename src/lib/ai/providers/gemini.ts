import { GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentConfig, GenerateContentResponse, ThinkingLevel } from '@google/genai';

import type { ThinkingLevelName } from '../config';

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

const PROVIDER = 'gemini';

export interface GeminiProviderOptions {
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  temperature: number;
  /**
   * Gemini 3.x models reason before emitting output. Left unset the model
   * chooses, which measured ~12s to first token on a short prompt — poor for
   * an interactive chat. MINIMAL/LOW trade reasoning depth for responsiveness.
   */
  thinkingLevel?: ThinkingLevelName;
}

/** Gemini uses `model` where the rest of the world uses `assistant`. */
function toGeminiContents(messages: AiMessage[]): { system?: string; contents: Content[] } {
  const systemParts: string[] = [];
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  return {
    system: systemParts.length ? systemParts.join('\n\n') : undefined,
    contents,
  };
}

function mapFinishReason(reason: string | undefined): FinishReason {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'PROHIBITED_CONTENT':
    case 'BLOCKLIST':
    case 'SPII':
      return 'content_filter';
    case undefined:
      return 'unknown';
    default:
      return 'unknown';
  }
}

function usageFrom(response: GenerateContentResponse): TokenUsage {
  return {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/**
 * `gemini-embedding-001` returns unit-normalised vectors only at its native
 * dimensionality; a truncated `outputDimensionality` is not re-normalised by
 * the API. Cosine similarity is scale-invariant so this does not affect the
 * current search, but normalising here keeps the vectors correct for a future
 * pgvector inner-product index.
 */
function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

export class GeminiProvider implements AiProvider {
  readonly name = PROVIDER;
  readonly chatModel: string;
  readonly embeddingModel: string;

  private readonly client: GoogleGenAI;
  private readonly dimensions: number;
  private readonly temperature: number;
  private readonly thinkingLevel?: ThinkingLevelName;

  constructor(options: GeminiProviderOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.chatModel = options.chatModel;
    this.embeddingModel = options.embeddingModel;
    this.dimensions = options.embeddingDimensions;
    this.temperature = options.temperature;
    this.thinkingLevel = options.thinkingLevel;
  }

  private buildConfig(options: ChatOptions | undefined, system: string | undefined): GenerateContentConfig {
    const config: GenerateContentConfig = {
      temperature: options?.temperature ?? this.temperature,
      abortSignal: options?.signal,
    };

    if (system) config.systemInstruction = system;
    if (options?.maxTokens) config.maxOutputTokens = options.maxTokens;
    if (this.thinkingLevel) {
      // The SDK models this as an enum whose members are these exact strings.
      config.thinkingConfig = { thinkingLevel: this.thinkingLevel as ThinkingLevel };
    }

    if (options?.jsonSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = options.jsonSchema.schema;
    }

    return config;
  }

  async chat(messages: AiMessage[], options?: ChatOptions): Promise<ChatResult> {
    try {
      const { system, contents } = toGeminiContents(messages);
      const response = await this.client.models.generateContent({
        model: options?.model ?? this.chatModel,
        contents,
        config: this.buildConfig(options, system),
      });

      const finishReason = mapFinishReason(response.candidates?.[0]?.finishReason);
      const content = response.text ?? '';

      if (!content && finishReason === 'content_filter') {
        throw new AiError('content_filter', 'The response was blocked by the provider safety filter.', {
          provider: PROVIDER,
        });
      }

      return {
        content,
        finishReason,
        usage: usageFrom(response),
        model: response.modelVersion ?? options?.model ?? this.chatModel,
      };
    } catch (error) {
      throw toAiError(error, PROVIDER);
    }
  }

  async *stream(messages: AiMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    let iterator: AsyncGenerator<GenerateContentResponse>;

    try {
      const { system, contents } = toGeminiContents(messages);
      iterator = await this.client.models.generateContentStream({
        model: options?.model ?? this.chatModel,
        contents,
        config: this.buildConfig(options, system),
      });
    } catch (error) {
      throw toAiError(error, PROVIDER);
    }

    let finishReason: FinishReason = 'unknown';
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let model = options?.model ?? this.chatModel;

    try {
      for await (const chunk of iterator) {
        const delta = chunk.text;
        if (delta) yield { type: 'text', delta };

        const reason = chunk.candidates?.[0]?.finishReason;
        if (reason) finishReason = mapFinishReason(reason);
        // Usage arrives on later chunks and is cumulative; keep the last seen.
        if (chunk.usageMetadata) usage = usageFrom(chunk);
        if (chunk.modelVersion) model = chunk.modelVersion;
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
      const response = await this.client.models.embedContent({
        model,
        contents: inputs,
        config: {
          outputDimensionality: this.dimensions,
          taskType: options?.purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          abortSignal: options?.signal,
        },
      });

      const embeddings = response.embeddings ?? [];

      if (embeddings.length !== inputs.length) {
        throw new AiError('unknown', 'The provider returned a different number of embeddings than inputs.', {
          provider: PROVIDER,
        });
      }

      return {
        vectors: embeddings.map((embedding) => normalise(embedding.values ?? [])),
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
      await this.client.models.embedContent({
        model: this.embeddingModel,
        contents: ['ping'],
        config: { outputDimensionality: this.dimensions },
      });
      return true;
    } catch {
      return false;
    }
  }
}
