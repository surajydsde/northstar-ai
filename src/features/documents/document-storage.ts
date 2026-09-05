import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { v2 as cloudinary } from 'cloudinary';

import { env } from '@/lib/env';

/**
 * Uploaded files are stored outside `public/`.
 *
 * When CLOUDINARY_CLOUD_NAME is set, files go to Cloudinary and the returned
 * secure URL is stored in document.metadata.cloudinaryUrl. The download route
 * verifies ownership then redirects to that URL.
 *
 * Without Cloudinary the original local-disk path is used (development only —
 * local disk is ephemeral on every cloud platform that lacks a persistent volume).
 */
export function uploadRoot(): string {
  return path.resolve(process.cwd(), env.UPLOADS_DIR);
}

export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
  return base.replace(/^\.+/, '') || 'upload.bin';
}

export function resolveStoredPath(storedName: string): string | null {
  const root = uploadRoot();
  const resolved = path.resolve(root, path.basename(storedName));
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return resolved.startsWith(prefix) ? resolved : null;
}

function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Stores an upload and returns the Cloudinary secure URL, or null when falling
 * back to local disk.
 */
export async function storeUpload(storedName: string, data: Buffer): Promise<string | null> {
  if (isCloudinaryConfigured()) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', public_id: storedName, use_filename: false },
        (error, res) => (error ? reject(error) : resolve(res as { secure_url: string })),
      );
      stream.end(data);
    });

    return result.secure_url;
  }

  // Local disk fallback — ephemeral on cloud platforms without a persistent volume.
  const target = resolveStoredPath(storedName);
  if (!target) throw new Error('Invalid upload path');
  await mkdir(uploadRoot(), { recursive: true });
  await writeFile(target, data);
  return null;
}

export function buildStoredName(safeName: string): string {
  return `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}
