import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { memories } from '@/db/schema';
import { cosine, DEFAULT_MIN_SCORE, isComparable, readTag, toVector, writeTag } from '@/features/embeddings';
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

/**
 * The memories table grows with every chat turn and its vectors are scanned in
 * Node, so an unbounded search would degrade steadily as a user's history
 * grows. Bounded to the most recently updated rows until the vectors move into
 * `pgvector`.
 */
const MAX_SCANNED = Number(process.env.MEMORY_MAX_SCANNED ?? 1000);

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
    let embedding: number[] = [];
    let metadata: Record<string, unknown> = input.metadata ?? {};

    try {
      const { vector, tag } = await aiClient.embedOne(input.content, { purpose: 'document' });
      embedding = vector;
      metadata = writeTag(metadata, tag);
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
        embedding,
        source: input.source ?? 'chat',
        metadata,
      })
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Always returns scored rows, including for an empty query, so callers get
   * one shape rather than a union they have to narrow.
   */
  async search(userId: string, query: string, limit = 8) {
    const normalized = query.trim();
    if (!normalized) {
      const recent = await this.listByUser(userId, limit);
      return recent.map((memory) => ({ ...memory, score: 1 }));
    }

    const candidates = await db
      .select()
      .from(memories)
      .where(eq(memories.userId, userId))
      .orderBy(desc(memories.updatedAt))
      .limit(MAX_SCANNED);

    let queryVector: number[] = [];
    let queryTag = aiClient.embeddingTag();

    try {
      const embedded = await aiClient.embedOne(normalized, { purpose: 'query' });
      queryVector = embedded.vector;
      queryTag = embedded.tag;
    } catch (error) {
      // Degrade to keyword-only rather than returning nothing.
      logger.warn('memory.search_embedding_unavailable', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const needle = normalized.toLowerCase();

    const scored = candidates.map((memory) => {
      const vector = toVector(memory.embedding);
      const comparable =
        queryVector.length > 0 &&
        isComparable(readTag(memory.metadata as Record<string, unknown> | null), queryTag, vector);

      const vectorScore = comparable ? cosine(queryVector, vector) : 0;
      const keywordScore = memory.content.toLowerCase().includes(needle) ? KEYWORD_SCORE : 0;

      return { ...memory, score: Math.max(vectorScore, keywordScore) };
    });

    return scored
      .filter((item) => item.score > MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
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
  let embedding: number[] | undefined;
  let metadata = patch.metadata ?? undefined;

  if (patch.content) {
    const { vector, tag } = await aiClient.embedOne(patch.content, { purpose: 'document' });
    embedding = vector;
    // Re-tag: the vector has been replaced, so the old tag no longer describes it.
    metadata = writeTag(metadata, tag);
  }

  const rows = await db
    .update(memories)
    .set({
      content: patch.content,
      embedding,
      source: patch.source,
      metadata,
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
