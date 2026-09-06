/**
 * One-time copy of local Postgres data into the Neon database now configured
 * as DATABASE_URL. Run once, after `drizzle-kit push` has created the schema
 * on Neon.
 *
 *   LOCAL_DATABASE_URL=postgresql://... npx tsx scripts/migrate-data-to-neon.ts
 *
 * Copies in dependency order (parents before children) and reports row counts
 * on both sides before and after. Safe to re-run: uses upsert on primary key.
 */
import 'dotenv/config';

import postgres from 'postgres';

import { resolveSsl } from '../src/db';

const TABLES_IN_ORDER = [
  'user',
  'account',
  'session',
  'verification',
  'conversations',
  'messages',
  'memories',
  'documents',
  'document_chunks',
  'agent_runs',
  'tool_executions',
] as const;

async function main() {
  const localUrl = process.env.LOCAL_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;

  if (!localUrl) throw new Error('Set LOCAL_DATABASE_URL to the source Postgres connection string.');
  if (!targetUrl) throw new Error('DATABASE_URL is not set.');

  const source = postgres(localUrl, { ssl: resolveSsl(localUrl), max: 1 });
  const target = postgres(targetUrl, { ssl: resolveSsl(targetUrl), max: 1 });

  try {
    console.log('table                | source | target (before) | copied | target (after)');
    console.log('-'.repeat(80));

    for (const table of TABLES_IN_ORDER) {
      const [srcCount] = await source`SELECT count(*)::int AS n FROM ${source(table)}`;
      const [beforeCount] = await target`SELECT count(*)::int AS n FROM ${target(table)}`;

      const rows = await source`SELECT * FROM ${source(table)}`;

      let copied = 0;
      if (rows.length > 0) {
        // Column order comes from the source row itself, so this works for
        // any table without hardcoding a column list per table.
        for (const row of rows) {
          const columns = Object.keys(row);
          await target`
            INSERT INTO ${target(table)} ${target(row, ...columns)}
            ON CONFLICT (id) DO NOTHING
          `;
          copied += 1;
        }
      }

      const [afterCount] = await target`SELECT count(*)::int AS n FROM ${target(table)}`;
      console.log(
        `${table.padEnd(21)} | ${String(srcCount!.n).padStart(6)} | ${String(beforeCount!.n).padStart(16)} | ${String(copied).padStart(6)} | ${String(afterCount!.n).padStart(14)}`,
      );
    }

    console.log('\nData migration to Neon complete.');
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
