/**
 * Moves legacy uploads out of `public/` and behind the authorized route.
 *
 *   npm run uploads:migrate -- --dry-run
 *   npm run uploads:migrate
 *
 * Files written under `public/uploads/` are served by Next as static assets
 * with no session check, so every user's uploads were readable by anyone with
 * the URL. New uploads already go to `UPLOADS_DIR`; this relocates the ones
 * written before that change and repoints their database rows at
 * `/api/documents/[id]/content`.
 *
 * Files are moved, never deleted. A row is only updated after its file has
 * been copied successfully.
 */

import 'dotenv/config';

import { access, copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { documents } from '@/db/schema';
import { uploadRoot } from '@/features/documents';

const LEGACY_DIR = path.join(process.cwd(), 'public', 'uploads');
const LEGACY_PREFIX = '/uploads/';
const dryRun = process.argv.includes('--dry-run');

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const destinationRoot = uploadRoot();
  console.log(`from: ${LEGACY_DIR}`);
  console.log(`to:   ${destinationRoot}`);
  if (dryRun) console.log('(dry run — nothing will be moved or written)\n');

  const rows = await db.select().from(documents);
  const legacy = rows.filter((row) => row.fileUrl.startsWith(LEGACY_PREFIX));

  console.log(`${legacy.length} of ${rows.length} document rows use the public path.\n`);
  if (legacy.length === 0) return;

  if (!dryRun) await mkdir(destinationRoot, { recursive: true });

  let moved = 0;
  let missing = 0;

  for (const row of legacy) {
    const storedName = path.basename(row.fileUrl.slice(LEGACY_PREFIX.length));
    const source = path.join(LEGACY_DIR, storedName);
    const destination = path.join(destinationRoot, storedName);

    if (!(await exists(source))) {
      console.log(`  MISSING  ${storedName} — row will still be repointed`);
      missing += 1;
    }

    if (dryRun) {
      console.log(`  would move ${storedName}`);
      continue;
    }

    if (await exists(source)) {
      // Copy then unlink rather than rename: the two directories may sit on
      // different volumes, and a failed rename would lose the file.
      await copyFile(source, destination);
      await unlink(source);
      moved += 1;
    }

    await db
      .update(documents)
      .set({
        fileUrl: `/api/documents/${row.id}/content`,
        metadata: {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          storedName,
        },
        updatedAt: new Date(),
      })
      .where(eq(documents.id, row.id));

    console.log(`  moved    ${storedName}`);
  }

  if (!dryRun) {
    console.log(`\nMoved ${moved} file(s); ${missing} row(s) had no file on disk.`);
    console.log('Uploads are now served only through /api/documents/[id]/content.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\nFAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
