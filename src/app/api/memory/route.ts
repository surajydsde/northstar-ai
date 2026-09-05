import { NextResponse } from 'next/server';
import { z } from 'zod';

import { memoryService } from '@/features/memory/memory-service';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session';

const memorySchema = z.object({
  content: z.string().trim().min(1),
  source: z.string().default('chat'),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown())])).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') ?? '';
    const items = query ? await memoryService.search(session.user.id, query, 20) : await memoryService.listByUser(session.user.id, 20);

    return NextResponse.json(items);
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Memory fetch failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to fetch memories' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));
    const parsed = memorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid memory payload' }, { status: 400 });
    }

    const memory = await memoryService.create({
      userId: session.user.id,
      content: parsed.data.content,
      source: parsed.data.source,
      metadata: parsed.data.metadata ?? {},
    });

    return NextResponse.json(memory, { status: 201 });
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Memory creation failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to create memory' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : null;

    if (!id) {
      return NextResponse.json({ error: 'Memory id is required' }, { status: 400 });
    }

    const memory = (await memoryService.listByUser(session.user.id, 200)).find((item) => item.id === id);

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    const deleted = await memoryService.delete(id);
    return NextResponse.json({ success: deleted, id });
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Memory deletion failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to delete memory' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}
