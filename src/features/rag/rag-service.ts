import { and, cosineDistance, desc, eq, gt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { documentChunks, documents } from '@/db/schema';
import { DEFAULT_MIN_SCORE } from '@/features/embeddings';
import { aiClient } from '@/lib/ai';
import { logger } from '@/lib/logger';
import type { RetrievedDocument } from '@/types/rag';

const MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? DEFAULT_MIN_SCORE);

/**
 * Similarity is now computed in Postgres via the `embedding_vec` pgvector
 * column and an HNSW index, so a document/chunk cap is no longer needed to
 * bound the query cost — `ORDER BY ... LIMIT` only ever materialises the rows
 * actually returned. `RAG_MAX_DOCUMENTS` no longer applies.
 *
 * The stale-vector problem this replaced (a vector from a retired embedding
 * model being scored as if comparable) is now structural rather than a
 * runtime check: `embedding_vec` only ever holds vectors written by
 * `aiClient.embed`, which is always the currently configured model. A chunk
 * whose vector predates the current model, or has none, simply has
 * `embedding_vec IS NULL` and is excluded by the join condition below — it is
 * absent from results rather than scored incorrectly.
 */
export async function vectorSearch(userId: string, query: string, limit = 6): Promise<RetrievedDocument[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const { vector: queryVector } = await aiClient.embedOne(trimmed, { purpose: 'query' });
    if (queryVector.length === 0) return [];

    const similarity = sql<number>`1 - (${cosineDistance(documentChunks.embeddingVec, queryVector)})`;

    const rows = await db
      .select({
        id: documentChunks.id,
        documentId: documentChunks.documentId,
        content: documentChunks.content,
        chunkIndex: documentChunks.chunkIndex,
        ownerId: documents.userId,
        score: similarity,
      })
      .from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .where(and(eq(documents.userId, userId), gt(similarity, MIN_SCORE)))
      .orderBy((t) => desc(t.score))
      .limit(limit);

    return rows.map((row) => ({
      score: row.score,
      chunk: {
        id: row.id,
        documentId: row.documentId,
        userId: row.ownerId,
        content: row.content,
        index: row.chunkIndex,
        metadata: {},
      },
    }));
  } catch (error) {
    logger.error('rag.search_failed', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Retrieval is best-effort: a failure degrades the answer, it does not
    // fail the chat request.
    return [];
  }
}

export const searchDocuments = vectorSearch;
