/**
 * Re-embeds stored vectors under the currently configured embedding model.
 *
 *   npm run ai:reembed -- --dry-run     inspect what would change
 *   npm run ai:reembed                  re-embed everything stale
 *
 * Vectors written by a different embedding model are unusable: they are not
 * comparable to new query vectors even when the dimensionality matches, so
 * retrieval skips them and the content becomes invisible to search. This
 * rewrites them in the current vector space.
 *
 * Non-destructive: it only overwrites rows it successfully re-embeds. Nothing
 * is deleted, and a failure part-way leaves already-updated rows valid.
 */

import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { documentChunks, memories } from '@/db/schema';
import { readTag, writeTag } from '@/features/embeddings';
import { aiClient, sameVectorSpace } from '@/lib/ai';

const BATCH_SIZE = 50;
const dryRun = process.argv.includes('--dry-run');

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function reembedMemories(): Promise<{ total: number; stale: number; updated: number }> {
  const target = aiClient.embeddingTag();
  const rows = await db.select().from(memories);

  const stale = rows.filter(
    (row) => !sameVectorSpace(readTag(row.metadata as Record<string, unknown> | null), target),
  );

  if (dryRun || stale.length === 0) {
    return { total: rows.length, stale: stale.length, updated: 0 };
  }

  let updated = 0;

  for (const batch of chunked(stale, BATCH_SIZE)) {
    const result = await aiClient.embed(
      batch.map((row) => row.content),
      { purpose: 'document' },
    );

    for (const [index, row] of batch.entries()) {
      const vector = result.vectors[index];
      if (!vector) continue;

      await db
        .update(memories)
        .set({
          embedding: vector,
          metadata: writeTag(row.metadata as Record<string, unknown> | null, {
            provider: result.provider,
            model: result.model,
            dimensions: result.dimensions,
          }),
        })
        .where(eq(memories.id, row.id));

      updated += 1;
    }

    console.log(`  memories: ${updated}/${stale.length}`);
  }

  return { total: rows.length, stale: stale.length, updated };
}

async function reembedChunks(): Promise<{ total: number; stale: number; updated: number }> {
  const target = aiClient.embeddingTag();
  const rows = await db.select().from(documentChunks);

  const stale = rows.filter(
    (row) => !sameVectorSpace(readTag(row.metadata as Record<string, unknown> | null), target),
  );

  if (dryRun || stale.length === 0) {
    return { total: rows.length, stale: stale.length, updated: 0 };
  }

  let updated = 0;

  for (const batch of chunked(stale, BATCH_SIZE)) {
    const result = await aiClient.embed(
      batch.map((row) => row.content),
      { purpose: 'document' },
    );

    for (const [index, row] of batch.entries()) {
      const vector = result.vectors[index];
      if (!vector) continue;

      const metadata = (row.metadata ?? {}) as Record<string, unknown>;

      await db
        .update(documentChunks)
        .set({
          metadata: writeTag({ ...metadata, embeddings: vector }, {
            provider: result.provider,
            model: result.model,
            dimensions: result.dimensions,
          }),
        })
        .where(eq(documentChunks.id, row.id));

      updated += 1;
    }

    console.log(`  chunks: ${updated}/${stale.length}`);
  }

  return { total: rows.length, stale: stale.length, updated };
}

async function main() {
  const target = aiClient.embeddingTag();
  console.log('target vector space:', target);
  if (dryRun) console.log('(dry run — nothing will be written)\n');

  const memoryStats = await reembedMemories();
  const chunkStats = await reembedChunks();

  console.table({ memories: memoryStats, document_chunks: chunkStats });

  const remaining = memoryStats.stale - memoryStats.updated + (chunkStats.stale - chunkStats.updated);
  if (dryRun && remaining > 0) {
    console.log(`\n${remaining} rows are in a different vector space and are currently invisible to search.`);
    console.log('Run `npm run ai:reembed` (without --dry-run) to rewrite them.');
  } else if (remaining === 0) {
    console.log('\nEvery stored vector is in the current vector space.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\nFAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
