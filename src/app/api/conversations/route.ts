import { NextResponse } from 'next/server';
import { z } from 'zod';

import { conversationService } from '@/features/conversations';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session';

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const conversations = await conversationService.listByUser(session.user.id);
    return NextResponse.json(conversations);
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Conversation list failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to list conversations' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));
    const parsed = createConversationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid conversation payload' }, { status: 400 });
    }

    const conversation = await conversationService.create({
      userId: session.user.id,
      title: parsed.data.title,
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Conversation creation failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to create conversation' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}
