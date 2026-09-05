import { cosineDistance, desc, eq, gt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { memories } from '@/db/schema';
import { DEFAULT_MIN_SCORE } from '@/features/embeddings';
import { aiClient } from '@/lib/ai';
import { logger } from '@/lib/logger';

export type MemoryKind = 'preference' | 'fact' | 'instruction' | 'conversation';

export interface MemoryEntry {
  id: string;
  userId: string;
  content: string;
  embedding?: number[];
  source: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
}

export type Memory = MemoryEntry;

const MIN_SCORE = Number(process.env.MEMORY_MIN_SCORE ?? DEFAULT_MIN_SCORE);
/**
 * A literal substring hit is strong evidence on its own, so it must clear
 * MIN_SCORE regardless of how the vector threshold is tuned.
 */
const KEYWORD_SCORE = Math.max(0.75, MIN_SCORE + 0.05);

export class MemoryService {
  async listByUser(userId: string, limit = 20) {
    return db
      .select()
      .from(memories)
      .where(eq(memories.userId, userId))
      .orderBy(desc(memories.updatedAt))
      .limit(limit);
  }

  async create(input: {
    userId: string;
    content: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }) {
    let embeddingVec: number[] | undefined;

    try {
      const { vector } = await aiClient.embedOne(input.content, { purpose: 'document' });
      embeddingVec = vector;
    } catch (error) {
      // A memory without a vector is still useful: keyword search still finds
      // it, and it can be re-embedded later. Losing the memory would be worse.
      logger.warn('memory.embedding_unavailable', {
        userId: input.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const rows = await db
      .insert(memories)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        content: input.content,
        embeddingVec,
        source: input.source ?? 'chat',
        metadata: input.metadata ?? {},
      })
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Hybrid vector + keyword search, scored in Postgres.
   *
   * Similarity is computed via the `embedding_vec` pgvector column and an
   * HNSW index rather than pulling every candidate's embedding into Node —
   * the approach this replaced needed a `MEMORY_MAX_SCANNED` cap specifically
   * because it shipped every candidate's ~16KB JSON embedding over the wire
   * before scoring a single one. No such cap is needed here.
   *
   * A row whose `embedding_vec` is null (no vector yet, or one from a retired
   * embedding model never backfilled) contributes 0 to the vector term via
   * `coalesce` but can still match on keyword — the same graceful
   * degradation as before, now structural rather than a runtime model check.
   */
  async search(userId: string, query: string, limit = 8) {
    const normalized = query.trim();
    if (!normalized) {
      const recent = await this.listByUser(userId, limit);
      return recent.map((memory) => ({ ...memory, score: 1 }));
    }

    let queryVector: number[] = [];

    try {
      const embedded = await aiClient.embedOne(normalized, { purpose: 'query' });
      queryVector = embedded.vector;
    } catch (error) {
      // Degrade to keyword-only rather than returning nothing.
      logger.warn('memory.search_embedding_unavailable', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Escapes ILIKE wildcards in the user's own query text.
    const needle = `%${normalized.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

    const vectorScore =
      queryVector.length > 0
        ? sql<number>`coalesce(1 - (${cosineDistance(memories.embeddingVec, queryVector)}), 0)`
        : sql<number>`0`;
    const keywordScore = sql<number>`case when ${memories.content} ilike ${needle} then ${KEYWORD_SCORE} else 0 end`;
    const score = sql<number>`greatest(${vectorScore}, ${keywordScore})`;

    return db
      .select({
        id: memories.id,
        userId: memories.userId,
        content: memories.content,
        source: memories.source,
        createdAt: memories.createdAt,
        updatedAt: memories.updatedAt,
        metadata: memories.metadata,
        score,
      })
      .from(memories)
      .where(eq(memories.userId, userId))
      .having(gt(score, MIN_SCORE))
      .groupBy(memories.id)
      .orderBy((t) => desc(t.score))
      .limit(limit);
  }

  async delete(id: string) {
    try {
      await db.delete(memories).where(eq(memories.id, id));
      return true;
    } catch {
      return false;
    }
  }
}

export const memoryService = new MemoryService();

export async function saveMemory(input: {
  userId: string;
  content: string;
  kind?: MemoryKind;
  importance?: number;
  metadata?: Record<string, string>;
}) {
  return memoryService.create({
    userId: input.userId,
    content: input.content,
    source: input.kind ?? 'conversation',
    metadata: input.metadata ?? {},
  });
}

export async function retrieveMemories(userId: string, limit = 8) {
  return memoryService.listByUser(userId, limit);
}

export async function updateMemory(
  id: string,
  patch: Partial<Pick<MemoryEntry, 'content' | 'source' | 'metadata'>>,
) {
  let embeddingVec: number[] | undefined;

  if (patch.content) {
    const { vector } = await aiClient.embedOne(patch.content, { purpose: 'document' });
    embeddingVec = vector;
  }

  const rows = await db
    .update(memories)
    .set({
      content: patch.content,
      embeddingVec,
      source: patch.source,
      metadata: patch.metadata ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(memories.id, id))
    .returning();

  return rows[0] ?? null;
}

export async function deleteMemory(id: string): Promise<boolean> {
  return memoryService.delete(id);
}

export async function searchMemories(userId: string, query: string, limit = 8) {
  return memoryService.search(userId, query, limit);
}
