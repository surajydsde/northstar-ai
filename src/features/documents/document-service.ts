import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { documents } from '@/db/schema';

export class DocumentService {
  async listByUser(userId: string) {
    return db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt));
  }

  async findById(id: string) {
    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: {
    id?: string;
    userId: string;
    name: string;
    fileUrl: string;
    mimeType?: string;
    size?: number;
    status?: string;
    metadata?: Record<string, unknown>;
  }) {
    const rows = await db
      .insert(documents)
      .values({
        id: input.id ?? crypto.randomUUID(),
        userId: input.userId,
        name: input.name,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType ?? 'application/octet-stream',
        size: input.size ?? 0,
        status: input.status ?? 'uploaded',
        metadata: input.metadata ?? {},
      })
      .returning();

    return rows[0] ?? null;
  }

  async updateStatus(id: string, status: string, metadata: Record<string, unknown>) {
    const rows = await db
      .update(documents)
      .set({ status, metadata, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();

    return rows[0] ?? null;
  }
}

export const documentService = new DocumentService();
