import { NextResponse } from 'next/server';

import { conversationService, messageService } from '@/features/conversations';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const conversation = await conversationService.findById(id);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messages = await messageService.listByConversation(id);

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Conversation fetch failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to fetch conversation' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const conversation = await conversationService.findById(id);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await conversationService.delete(id);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    const isUnauthorized = error instanceof Error && error.message === 'Unauthorized';
    logger.error('Conversation delete failed', { error: error instanceof Error ? error.message : 'Unknown error' });

    return NextResponse.json(
      { error: isUnauthorized ? 'Unauthorized' : 'Unable to delete conversation' },
      { status: isUnauthorized ? 401 : 500 },
    );
  }
}
