/**
 * Smoke-tests the configured AI provider end to end.
 *
 *   npm run ai:verify
 *
 * Exercises chat, streaming and embeddings against the real API, and checks
 * that embeddings are semantically meaningful rather than merely well-formed.
 * Run this after changing AI_PROVIDER or any model setting.
 */

import 'dotenv/config';

import { aiClient, getAiConfig } from '@/lib/ai';

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

async function main() {
  const config = getAiConfig();
  console.log('configuration');
  console.table({
    chatProvider: config.chatProvider,
    chatModel: config.chatModel,
    embeddingProvider: config.embeddingProvider,
    embeddingModel: config.embeddingModel,
    dimensions: config.embeddingDimensions,
  });

  console.log('\nchat (non-streaming)');
  const chat = await aiClient.chat([{ role: 'user', content: 'Reply with exactly: MIGRATION OK' }]);
  console.log({
    content: chat.content.trim(),
    finishReason: chat.finishReason,
    usage: chat.usage,
    model: chat.model,
  });

  console.log('\nchat (streaming)');
  let streamed = '';
  let chunkCount = 0;
  for await (const chunk of aiClient.stream([
    { role: 'user', content: 'Count from 1 to 5, space separated. No other text.' },
  ])) {
    if (chunk.type === 'text') {
      streamed += chunk.delta;
      chunkCount += 1;
    } else if (chunk.type === 'done') {
      console.log({ finishReason: chunk.finishReason, usage: chunk.usage });
    }
  }
  console.log({ chunkCount, streamed: streamed.trim() });
  if (chunkCount <= 1) {
    console.warn('WARNING: the response arrived as a single chunk — streaming may not be active.');
  }

  console.log('\nembeddings');
  const result = await aiClient.embed(
    ['the cat sat on the mat', 'felines rest on rugs', 'quantum chromodynamics and gluon confinement'],
    { purpose: 'document' },
  );
  console.log({
    count: result.vectors.length,
    dimensions: result.vectors[0]?.length,
    provider: result.provider,
    model: result.model,
  });

  // Vectors are normalised, so the dot product is the cosine similarity.
  const related = dot(result.vectors[0]!, result.vectors[1]!);
  const unrelated = dot(result.vectors[0]!, result.vectors[2]!);
  console.log({ relatedPair: related.toFixed(4), unrelatedPair: unrelated.toFixed(4) });

  if (related <= unrelated) {
    throw new Error(
      'Embeddings are not semantically meaningful: an unrelated pair scored at least as high as a related pair.',
    );
  }

  console.log('\nhealth');
  console.log(await aiClient.health());

  console.log('\nAll provider checks passed.');
}

main().catch((error: unknown) => {
  const err = error as { name?: string; code?: string; message?: string };
  console.error('\nFAILED:', [err.name, err.code].filter(Boolean).join(' / '), '-', err.message);
  process.exit(1);
});
