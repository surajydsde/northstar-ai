import { NextResponse } from 'next/server';
import { z } from 'zod';

import { runAgent, streamAgent } from '@/agents/agent-workflow';
import { conversationService, messageService } from '@/features/conversations';
import { memoryService } from '@/features/memory/memory-service';
import { AiError } from '@/lib/ai';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session';

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(32_000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(false),
});

/** History replayed to the model and used to decide whether to title a thread. */
const HISTORY_LIMIT = 40;

/**
 * Very short messages ("ok", "thanks") are noise as long-term memories, and
 * every stored memory costs an embedding call plus a row scanned on every
 * later search. Filtering them keeps recall useful and cost bounded.
 */
const MIN_MEMORABLE_LENGTH = 24;

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Chat API ready' });
}

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (error instanceof AiError) {
    logger.error('chat.provider_error', { code: error.code, provider: error.provider, status: error.status });
    const message =
      error.code === 'rate_limit'
        ? 'The AI provider is rate limiting requests. Please retry shortly.'
        : error.code === 'timeout'
          ? 'The AI provider took too long to respond.'
          : 'The AI provider is unavailable right now.';
    return NextResponse.json({ error: message, code: error.code }, { status: error.httpStatus });
  }

  logger.error('chat.request_failed', {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  return NextResponse.json({ error: 'Unable to process chat request' }, { status: 500 });
}

/** Resolves the target conversation, enforcing ownership. */
async function resolveConversation(conversationId: string | undefined, userId: string, firstMessage: string) {
  if (conversationId) {
    const existing = await conversationService.findById(conversationId);

    // Ownership check. Without it, any authenticated user could write messages
    // into another user's thread by supplying its id.
    if (existing) {
      if (existing.userId !== userId) return { forbidden: true as const };
      return { conversation: existing };
    }
  }

  const created = await conversationService.create({
    userId,
    title: firstMessage.slice(0, 60) || 'New conversation',
  });

  if (!created) throw new Error('Unable to create conversation');
  return { conversation: created };
}

async function persistTurn(input: {
  conversationId: string;
  userId: string;
  message: string;
  reply: string;
  isFirstTurn: boolean;
}) {
  await messageService.create({
    conversationId: input.conversationId,
    userId: input.userId,
    role: 'assistant',
    content: input.reply,
  });

  if (input.message.length >= MIN_MEMORABLE_LENGTH) {
    await memoryService.create({
      userId: input.userId,
      content: input.message,
      source: 'chat',
      metadata: { conversationId: input.conversationId },
    });
  }

  await conversationService.update(input.conversationId, {
    lastMessageAt: new Date(),
    ...(input.isFirstTurn ? { title: input.message.slice(0, 60) } : {}),
  });
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => ({}));
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid chat payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { message, conversationId, stream } = parsed.data;
    const userId = session.user.id;

    const resolved = await resolveConversation(conversationId, userId, message);
    if ('forbidden' in resolved) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const conversation = resolved.conversation;

    // Read history before writing the new turn, so it is not duplicated.
    const history = await messageService.listByConversation(conversation.id, HISTORY_LIMIT);
    const isFirstTurn = history.length === 0;

    await messageService.create({
      conversationId: conversation.id,
      userId,
      role: 'user',
      content: message,
    });

    const agentInput = {
      userId,
      conversationId: conversation.id,
      messages: [
        ...history.map((item) => ({
          role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: item.content,
        })),
        { role: 'user' as const, content: message },
      ],
    };

    if (!stream) {
      const result = await runAgent(agentInput);
      const last = result.messages[result.messages.length - 1];
      const reply = last?.content?.toString() ?? '';

      await persistTurn({ conversationId: conversation.id, userId, message, reply, isFirstTurn });

      return NextResponse.json({
        conversationId: conversation.id,
        message: reply,
        createdAt: new Date().toISOString(),
      });
    }

    // NDJSON stream: one JSON object per line.
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        let reply = '';

        try {
          send({ type: 'meta', conversationId: conversation.id });

          for await (const chunk of streamAgent(agentInput, request.signal)) {
            if (chunk.type === 'text') {
              reply += chunk.delta;
              send({ type: 'text', delta: chunk.delta });
            } else if (chunk.type === 'done') {
              send({ type: 'done', usage: chunk.usage, finishReason: chunk.finishReason });
            }
          }

          // Persist only after the stream completes. A client disconnect
          // aborts the provider call, and a partial answer is still worth
          // keeping — but an empty one is not.
          if (reply) {
            await persistTurn({ conversationId: conversation.id, userId, message, reply, isFirstTurn });
          }
        } catch (error) {
          const code = error instanceof AiError ? error.code : 'unknown';
          logger.error('chat.stream_failed', {
            conversationId: conversation.id,
            code,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          if (reply) {
            await persistTurn({ conversationId: conversation.id, userId, message, reply, isFirstTurn }).catch(
              () => undefined,
            );
          }

          // The status line is already sent, so the failure has to travel
          // in-band rather than as an HTTP status.
          send({ type: 'error', code, error: 'The response was interrupted.' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
