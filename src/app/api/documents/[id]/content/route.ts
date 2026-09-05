import { readFile } from 'node:fs/promises';

import { NextResponse } from 'next/server';

import { documentService, resolveStoredPath } from '@/features/documents';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session';

/**
 * Authorized download for an uploaded document.
 *
 * This route exists because uploads used to be written into `public/`, where
 * Next serves them statically with no session check at all.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const document = await documentService.findById(id);

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const storedName = (document.metadata as { storedName?: unknown } | null)?.storedName;
    if (typeof storedName !== 'string') {
      return NextResponse.json({ error: 'Document content is unavailable' }, { status: 404 });
    }

    const filePath = resolveStoredPath(storedName);
    if (!filePath) {
      return NextResponse.json({ error: 'Document content is unavailable' }, { status: 404 });
    }

    const data = await readFile(filePath);

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'content-type': document.mimeType || 'application/octet-stream',
        // Force download rather than inline rendering: an uploaded .html or
        // .svg rendered inline would execute script in the app's origin.
        'content-disposition': `attachment; filename="${encodeURIComponent(document.name)}"`,
        'content-length': String(data.byteLength),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    const isMissing = (error as NodeJS.ErrnoException)?.code === 'ENOENT';

    if (!isUnauthorized && !isMissing) {
      logger.error('Document download failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    if (isMissing) {
      return NextResponse.json({ error: 'Document content is unavailable' }, { status: 404 });
    }

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to read document' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}
