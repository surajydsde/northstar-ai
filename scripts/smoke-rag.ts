/**
 * End-to-end smoke test of the retrieval + memory + persistence path.
 *
 *   npm run smoke:rag
 *
 * Indexes a document, stores a memory, runs the LangGraph agent against the
 * live provider, asserts the answer actually used the retrieved context, then
 * deletes everything it created. Requires a reachable database and a valid
 * provider key.
 */

import 'dotenv/config';

import { eq, inArray } from 'drizzle-orm';

import { runAgent } from '@/agents/agent-workflow';
import { db } from '@/db';
import { conversations, documentChunks, documents, memories, messages, user } from '@/db/schema';
import { indexDocument } from '@/features/documents';
import { memoryService } from '@/features/memory/memory-service';
import { searchDocuments } from '@/features/rag';

const MARKER = 'smoke-rag';

// A fact the model cannot know from pre-training — proof that retrieval worked.
const SECRET_FACT =
  'The internal codename for the Q3 platform migration project is Blue Marmot, ' +
  'and its rollout window is the third week of November.';

async function main() {
  const [existing] = await db.select().from(user).limit(1);
  if (!existing) throw new Error('No user in the database — sign up in the app first.');
  const userId = existing.id;
  console.log(`using user ${userId}`);

  const documentId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  let memoryId: string | null = null;

  try {
    // ---- index a document -------------------------------------------------
    await db.insert(documents).values({
      id: documentId,
      userId,
      name: `${MARKER}-notes.md`,
      fileUrl: `/api/documents/${documentId}/content`,
      mimeType: 'text/markdown',
      status: 'uploaded',
      metadata: { source: MARKER },
    });

    const indexed = await indexDocument({
      documentId,
      fileName: `${MARKER}-notes.md`,
      content: `# Project notes\n\n${SECRET_FACT}\n\nUnrelated filler about office plants and parking.`,
    });
    console.log('indexed:', indexed);
    if (!indexed.embeddingsAvailable) throw new Error('Embeddings were unavailable during indexing.');

    // ---- retrieval --------------------------------------------------------
    const hits = await searchDocuments(userId, 'What is the codename for the Q3 migration project?', 5);
    console.log(`retrieval hits: ${hits.length}`, hits.map((h) => h.score.toFixed(3)));
    if (hits.length === 0) throw new Error('Retrieval returned nothing — the document was not found.');
    if (!hits.some((h) => h.chunk.content.includes('Blue Marmot'))) {
      throw new Error('Retrieval returned chunks, but not the relevant one.');
    }

    // ---- memory -----------------------------------------------------------
    const memory = await memoryService.create({
      userId,
      content: 'The user prefers responses written in British English and kept under three sentences.',
      source: MARKER,
      metadata: { source: MARKER },
    });
    memoryId = memory?.id ?? null;

    const recalled = await memoryService.search(userId, 'what writing style does the user want?', 5);
    console.log(
      `memory hits: ${recalled.length}`,
      recalled.map((m) => m.score.toFixed(3)),
    );
    if (!recalled.some((m) => m.content.includes('British English'))) {
      throw new Error('Memory search did not recall the stored preference.');
    }

    // ---- agent end to end -------------------------------------------------
    await db.insert(conversations).values({ id: conversationId, userId, title: `${MARKER} conversation` });

    const result = await runAgent({
      userId,
      conversationId,
      messages: [{ role: 'user', content: 'What is the codename for the Q3 migration project, and when does it roll out?' }],
    });

    const answer = result.messages[result.messages.length - 1]?.content?.toString() ?? '';
    console.log('\nanswer:', answer.slice(0, 400));

    if (!/blue\s*marmot/i.test(answer)) {
      throw new Error('The agent answered without using the retrieved context (no "Blue Marmot" in the reply).');
    }

    // ---- persistence ------------------------------------------------------
    // Inserted separately, mirroring the chat route. A single multi-row insert
    // gives every row the same `now()`, which is precisely why ordering relies
    // on the monotonic `seq` column rather than `created_at`.
    await db.insert(messages).values({
      id: crypto.randomUUID(), conversationId, userId, role: 'user', content: 'question',
    });
    await db.insert(messages).values({
      id: crypto.randomUUID(), conversationId, userId, role: 'assistant', content: answer,
    });

    const { messageService } = await import('@/features/conversations');
    const stored = await messageService.listByConversation(conversationId);
    console.log(`\npersisted ${stored.length} messages; order:`, stored.map((m) => m.role).join(' -> '));
    if (stored[0]?.role !== 'user') {
      throw new Error('Message history is not in chronological order.');
    }

    console.log('\nAll RAG / memory / persistence checks passed.');
  } finally {
    // ---- cleanup ----------------------------------------------------------
    const chunkRows = await db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId));
    if (chunkRows.length) {
      await db.delete(documentChunks).where(inArray(documentChunks.id, chunkRows.map((c) => c.id)));
    }
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
    await db.delete(conversations).where(eq(conversations.id, conversationId));
    await db.delete(documents).where(eq(documents.id, documentId));
    if (memoryId) await db.delete(memories).where(eq(memories.id, memoryId));
    console.log('cleaned up test rows');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\nFAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
