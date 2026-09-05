/**
 * Applies the SQL files in `src/db/migrations` in filename order.
 *
 *   npm run db:migrate
 *
 * The project has no migration history — the schema was applied by hand — so
 * this deliberately does not try to reconstruct a baseline. It records what it
 * has applied in `_migrations` and skips those next time. Every file must be
 * written to be safe if re-run (IF NOT EXISTS and similar).
 */

import 'dotenv/config';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import postgres from 'postgres';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'db', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const sql = postgres(url, { ssl: false, max: 1 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const applied = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((row) => row.name),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip    ${file} (already applied)`);
        continue;
      }

      const statements = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`apply   ${file}`);

      await sql.begin(async (tx) => {
        await tx.unsafe(statements);
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
    }

    console.log('Migrations up to date.');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
