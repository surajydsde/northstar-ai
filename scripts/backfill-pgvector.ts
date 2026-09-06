/**
 * Backfills the new `embedding_vec` columns from the existing json/jsonb
 * embedding data. Idempotent — only touches rows where embedding_vec is null
 * and a source vector exists.
 *
 *   npm run db:backfill-vectors
 */
import 'dotenv/config';

import postgres from 'postgres';

import { resolveSsl } from '../src/db';

const url = process.env.DATABASE_URL!;
const sql = postgres(url, { ssl: resolveSsl(url), max: 1 });

/** pgvector's text input format: `[0.1,0.2,...]`. */
function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

async function backfillMemories() {
  const rows = await sql<{ id: string; embedding: unknown }[]>`
    SELECT id, embedding FROM memories WHERE embedding_vec IS NULL
  `;

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const vector = Array.isArray(row.embedding) ? (row.embedding as unknown[]) : null;
    if (!vector || vector.length !== 768 || !vector.every((v) => typeof v === 'number')) {
      skipped += 1;
      continue;
    }

    await sql`
      UPDATE memories SET embedding_vec = ${toVectorLiteral(vector as number[])}::vector
      WHERE id = ${row.id}
    `;
    updated += 1;
  }

  return { total: rows.length, updated, skipped };
}

async function backfillChunks() {
  const rows = await sql<{ id: string; metadata: unknown }[]>`
    SELECT id, metadata FROM document_chunks WHERE embedding_vec IS NULL
  `;

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const vector = Array.isArray(metadata.embeddings) ? (metadata.embeddings as unknown[]) : null;

    if (!vector || vector.length !== 768 || !vector.every((v) => typeof v === 'number')) {
      skipped += 1;
      continue;
    }

    await sql`
      UPDATE document_chunks SET embedding_vec = ${toVectorLiteral(vector as number[])}::vector
      WHERE id = ${row.id}
    `;
    updated += 1;
  }

  return { total: rows.length, updated, skipped };
}

async function main() {
  console.log('Backfilling memories.embedding_vec ...');
  const memoryStats = await backfillMemories();
  console.log('Backfilling document_chunks.embedding_vec ...');
  const chunkStats = await backfillChunks();

  console.table({ memories: memoryStats, document_chunks: chunkStats });

  if (memoryStats.skipped > 0 || chunkStats.skipped > 0) {
    console.log(
      '\nSkipped rows have no usable source vector (wrong dimension, missing, or from a retired model).',
    );
    console.log('They remain unsearchable until re-embedded with `npm run ai:reembed`.');
  }
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error('Backfill failed:', error instanceof Error ? error.message : error);
    await sql.end();
    process.exit(1);
  });
