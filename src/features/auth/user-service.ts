import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { user } from '@/db/schema';

export class UserService {
  async findById(id: string) {
    const rows = await db.select().from(user).where(eq(user.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const rows = await db.select().from(user).where(eq(user.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async list(limit = 25) {
    return db.select().from(user).limit(limit);
  }

  /**
   * Note: normal sign-up goes through Better Auth, which generates its own ids.
   * This exists for administrative/seed use, so it must supply an id itself —
   * `user.id` is a non-defaulted text primary key.
   */
  async create(input: { id?: string; name?: string | null; email: string; image?: string | null }) {
    const rows = await db
      .insert(user)
      .values({
        id: input.id ?? crypto.randomUUID(),
        name: input.name ?? null,
        email: input.email,
        image: input.image ?? null,
      })
      .returning();

    return rows[0] ?? null;
  }
}

export const userService = new UserService();
