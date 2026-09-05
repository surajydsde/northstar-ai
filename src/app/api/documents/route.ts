import { NextResponse } from 'next/server';
import { z } from 'zod';

import { documentService } from '@/features/documents';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session';

const documentSchema = z.object({
  name: z.string().trim().min(1),
  fileUrl: z.string().url(),
  mimeType: z.string().default('application/octet-stream'),
  size: z.number().int().nonnegative().default(0),
  status: z.string().default('uploaded'),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown())])).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const documents = await documentService.listByUser(session.user.id);
    return NextResponse.json(documents);
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Document list failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to list documents' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));
    const parsed = documentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid document payload' }, { status: 400 });
    }

    const document = await documentService.create({
      userId: session.user.id,
      name: parsed.data.name,
      fileUrl: parsed.data.fileUrl,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
      status: parsed.data.status,
      metadata: parsed.data.metadata ?? {},
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Document creation failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to create document' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}
