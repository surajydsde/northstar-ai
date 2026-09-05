import { db } from '@/db';
import { documentChunks } from '@/db/schema';
import { writeTag } from '@/features/embeddings';
import { aiClient } from '@/lib/ai';
import { logger } from '@/lib/logger';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.log']);
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

/**
 * Embedding providers cap how many inputs a single request may carry, and a
 * large upload can produce hundreds of chunks. Batching keeps each request
 * within limits and makes rate-limit backoff granular.
 */
const EMBED_BATCH_SIZE = 50;

export function isTextDocument(fileName: string) {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return TEXT_EXTENSIONS.has(extension);
}

export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let start = 0; start < normalized.length; start += step) {
    const chunk = normalized.slice(start, start + chunkSize).trim();
    if (chunk) chunks.push(chunk);
    if (start + chunkSize >= normalized.length) break;
  }
  return chunks;
}

export async function indexDocument(input: {
  documentId: string;
  fileName: string;
  content: string;
}) {
  const chunks = chunkText(input.content);
  const embeddings: number[][] = [];
  let embeddingsAvailable = true;
  let tag = aiClient.embeddingTag();

  if (chunks.length > 0) {
    try {
      for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(start, start + EMBED_BATCH_SIZE);
        // Stored passages are embedded as documents, queries as queries;
        // providers that support asymmetric retrieval score better for it.
        const result = await aiClient.embed(batch, { purpose: 'document' });
        embeddings.push(...result.vectors);
        tag = { provider: result.provider, model: result.model, dimensions: result.dimensions };
      }
    } catch (error) {
      // Preserved from the original design: an embedding outage must not lose
      // the upload. Chunks are stored untagged and are simply not retrievable
      // until re-embedded.
      embeddingsAvailable = false;
      embeddings.length = 0;
      logger.warn('Document embeddings unavailable; storing chunks without vectors', {
        documentId: input.documentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (chunks.length > 0) {
    await db.insert(documentChunks).values(
      chunks.map((content, chunkIndex) => {
        const vector = embeddings[chunkIndex] ?? null;
        const base = { fileName: input.fileName, embeddings: vector };
        return {
          id: crypto.randomUUID(),
          documentId: input.documentId,
          content,
          chunkIndex,
          metadata: vector ? writeTag(base, tag) : base,
        };
      }),
    );
  }

  return { chunkCount: chunks.length, embeddingsAvailable };
}
