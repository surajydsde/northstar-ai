import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { conversations } from '@/db/schema';

export class ConversationService {
  async listByUser(userId: string) {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  }

  async findById(id: string) {
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: { userId: string; title?: string }) {
    const rows = await db
      .insert(conversations)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        title: input.title ?? 'New conversation',
      })
      .returning();

    return rows[0] ?? null;
  }

  async update(id: string, patch: { title?: string; lastMessageAt?: Date | null }) {
    const rows = await db
      .update(conversations)
      .set({
        title: patch.title,
        lastMessageAt: patch.lastMessageAt,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, id))
      .returning();

    return rows[0] ?? null;
  }

  async delete(id: string) {
    const result = await db.delete(conversations).where(eq(conversations.id, id));
    const rowCount = (result as { rowCount?: number | null }).rowCount ?? 0;
    return Number(rowCount) > 0;
  }
}

export const conversationService = new ConversationService();
