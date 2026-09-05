import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '@/lib/env';

/**
 * Uploaded files are stored outside `public/`.
 *
 * Anything under `public/` is served by Next as a static asset with no session
 * check, which made every user's uploads readable by anyone who had the URL.
 * Files now live in a private directory and are served only through
 * `GET /api/documents/[id]/content`, which verifies ownership.
 */
export function uploadRoot(): string {
  return path.resolve(process.cwd(), env.UPLOADS_DIR);
}

export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
  // Avoid empty names and names that are only dots.
  return base.replace(/^\.+/, '') || 'upload.bin';
}

/**
 * Resolves a stored file name to an absolute path, refusing anything that
 * escapes the upload root. The name comes from the database rather than the
 * request, but a traversal check is cheap and this is the only read path.
 */
export function resolveStoredPath(storedName: string): string | null {
  const root = uploadRoot();
  const resolved = path.resolve(root, path.basename(storedName));
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return resolved.startsWith(prefix) ? resolved : null;
}

export async function storeUpload(storedName: string, data: Buffer): Promise<void> {
  const target = resolveStoredPath(storedName);
  if (!target) throw new Error('Invalid upload path');

  await mkdir(uploadRoot(), { recursive: true });
  await writeFile(target, data);
}

export function buildStoredName(safeName: string): string {
  return `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}
