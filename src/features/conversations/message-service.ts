import { asc, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { messages } from '@/db/schema';

export class MessageService {
  /**
   * Returns the most recent `limit` messages in **chronological** order.
   *
   * Ordered by `seq`, not `created_at`: Postgres `now()` is transaction-scoped
   * and rapid inserts were measured sharing an identical timestamp, so the
   * timestamp alone cannot order a conversation. The window is taken
   * newest-first so a long thread keeps its latest turns, then reversed —
   * callers render and replay history oldest-first.
   */
  async listByConversation(conversationId: string, limit = 100) {
    const recent = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.seq))
      .limit(limit);

    return recent.reverse();
  }

  /** Oldest-first, for callers that want the head of a thread. */
  async listOldest(conversationId: string, limit = 100) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.seq))
      .limit(limit);
  }

  /** Removes a single message. Used to roll back an orphaned turn. */
  async delete(id: string) {
    const result = await db.delete(messages).where(eq(messages.id, id));
    return Number((result as { rowCount?: number | null }).rowCount ?? 0) > 0;
  }

  async create(input: {
    conversationId: string;
    userId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    const rows = await db
      .insert(messages)
      .values({
        id: crypto.randomUUID(),
        conversationId: input.conversationId,
        userId: input.userId,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? {},
      })
      .returning();

    return rows[0] ?? null;
  }
}

export const messageService = new MessageService();

