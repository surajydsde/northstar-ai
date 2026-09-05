import { getAiConfig, type AiConfig, type ProviderName } from './config';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { OpenAiProvider } from './providers/openai';
import type { AiProvider } from './types';

/**
 * Builds a provider instance. The switch here is the single place in the
 * codebase that knows provider names map to implementations.
 */
export function createProvider(name: ProviderName, config: AiConfig): AiProvider {
  switch (name) {
    case 'gemini': {
      const apiKey = config.credentials.gemini;
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
      return new GeminiProvider({
        apiKey,
        chatModel: config.chatModel,
        embeddingModel: config.embeddingModel,
        embeddingDimensions: config.embeddingDimensions,
        temperature: config.temperature,
        thinkingLevel: config.thinkingLevel,
      });
    }

    case 'openai': {
      const credentials = config.credentials.openai;
      if (!credentials) throw new Error('OPENAI_API_KEY is not configured.');
      return new OpenAiProvider({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        chatModel: config.chatModel,
        embeddingModel: config.embeddingModel,
        embeddingDimensions: config.embeddingDimensions,
        temperature: config.temperature,
      });
    }

    case 'anthropic': {
      const apiKey = config.credentials.anthropic;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
      return new AnthropicProvider({
        apiKey,
        chatModel: config.chatModel,
        temperature: config.temperature,
      });
    }
  }
}

const instances = new Map<ProviderName, AiProvider>();

function memoised(name: ProviderName, config: AiConfig): AiProvider {
  let instance = instances.get(name);
  if (!instance) {
    instance = createProvider(name, config);
    instances.set(name, instance);
  }
  return instance;
}

/** The provider serving completions, per `AI_PROVIDER`. */
export function getChatProvider(): AiProvider {
  const config = getAiConfig();
  return memoised(config.chatProvider, config);
}

/**
 * The provider serving embeddings, per `AI_EMBEDDING_PROVIDER` (falling back to
 * `AI_PROVIDER`). Separate because Anthropic has no embeddings endpoint.
 */
export function getEmbeddingProvider(): AiProvider {
  const config = getAiConfig();
  return memoised(config.embeddingProvider, config);
}

/** Test seam. */
export function resetProviders(): void {
  instances.clear();
}
