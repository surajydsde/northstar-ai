import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { documentChunks, documents } from '@/db/schema';
import { cosine, DEFAULT_MIN_SCORE, isComparable, readTag, toVector } from '@/features/embeddings';
import { aiClient } from '@/lib/ai';
import { logger } from '@/lib/logger';
import type { RetrievedDocument } from '@/types/rag';

const MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? DEFAULT_MIN_SCORE);

/**
 * Retrieval scans candidate rows in Node because embeddings live in a `json`
 * column that no index can serve. These bounds keep a large corpus from
 * dragging the whole table (and megabytes of JSON) into memory on every chat
 * turn. They are a mitigation, not a solution — moving the vectors into
 * `pgvector` removes the need for a cap entirely.
 */
const MAX_DOCUMENTS = Number(process.env.RAG_MAX_DOCUMENTS ?? 25);
const MAX_CHUNKS = Number(process.env.RAG_MAX_CHUNKS ?? 2000);

export async function vectorSearch(userId: string, query: string, limit = 6): Promise<RetrievedDocument[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const { vector: queryVector, tag: queryTag } = await aiClient.embedOne(trimmed, { purpose: 'query' });
    if (queryVector.length === 0) return [];

    const recentDocs = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt))
      .limit(MAX_DOCUMENTS);

    const docIds = recentDocs.map((doc) => doc.id);
    if (docIds.length === 0) return [];

    const rows = await db
      .select({ chunk: documentChunks, ownerId: documents.userId })
      .from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .where(and(eq(documents.userId, userId), inArray(documentChunks.documentId, docIds)))
      .limit(MAX_CHUNKS);

    let skippedStale = 0;
    const scored: RetrievedDocument[] = [];

    for (const { chunk, ownerId } of rows) {
      const metadata = (chunk.metadata ?? {}) as Record<string, unknown>;
      const vector = toVector(metadata.embeddings);

      // Vectors from a different embedding model are discarded before scoring.
      // Comparing them would produce a plausible-looking but meaningless score.
      if (!isComparable(readTag(metadata), queryTag, vector)) {
        if (vector) skippedStale += 1;
        continue;
      }

      const score = cosine(queryVector, vector);
      if (score <= MIN_SCORE) continue;

      scored.push({
        score,
        chunk: {
          id: chunk.id,
          documentId: chunk.documentId,
          userId: ownerId,
          content: chunk.content,
          index: chunk.chunkIndex,
          metadata: {},
        },
      });
    }

    if (skippedStale > 0) {
      // Surfaced deliberately: this is what a pending re-embed looks like, and
      // it would otherwise be indistinguishable from "no relevant documents".
      logger.warn('rag.stale_embeddings_skipped', {
        userId,
        skipped: skippedStale,
        expectedModel: queryTag.model,
      });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
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
