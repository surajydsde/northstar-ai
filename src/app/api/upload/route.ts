import { NextResponse } from 'next/server';

import {
  buildStoredName,
  documentService,
  indexDocument,
  isTextDocument,
  sanitizeFileName,
  storeUpload,
} from '@/features/documents';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session';

/** Bounds memory use and abuse; the whole file is buffered to compute the write. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A file is required in the form data.' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Files must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.` },
        { status: 413 },
      );
    }

    const safeName = sanitizeFileName(file.name || 'upload.bin');
    const storedName = buildStoredName(safeName);
    const cloudinaryUrl = await storeUpload(storedName, Buffer.from(await file.arrayBuffer()));

    // The id is generated here so the download URL can be built before insert.
    const documentId = crypto.randomUUID();

    const document = await documentService.create({
      id: documentId,
      userId: session.user.id,
      name: file.name || safeName,
      // Served through an authorized route, not as a public static asset.
      fileUrl: `/api/documents/${documentId}/content`,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      status: 'uploaded',
      metadata: {
        originalName: file.name,
        source: 'upload',
        storedName,
        ...(cloudinaryUrl && { cloudinaryUrl }),
      },
    });

    if (!document) {
      throw new Error('Unable to create document record');
    }

    let indexing = { chunkCount: 0, embeddingsAvailable: true };
    if (isTextDocument(file.name)) {
      indexing = await indexDocument({
        documentId: document.id,
        fileName: file.name,
        content: await file.text(),
      });
    }

    const indexedDocument = await documentService.updateStatus(document.id, 'indexed', {
      originalName: file.name,
      source: 'upload',
      storedName,
      indexed: true,
      chunkCount: indexing.chunkCount,
      embeddingsAvailable: indexing.embeddingsAvailable,
      ...(cloudinaryUrl && { cloudinaryUrl }),
    });

    return NextResponse.json({
      message: indexing.embeddingsAvailable
        ? 'Document uploaded successfully'
        : 'Document uploaded, but could not be indexed for search yet',
      document: indexedDocument ?? document,
      indexing,
    });
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Document upload failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Upload failed' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}
