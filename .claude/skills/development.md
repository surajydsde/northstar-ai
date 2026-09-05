---
name: development
description: TypeScript, React, Next.js, and service development standards for Northstar AI. Load this skill when implementing features, fixes, or refactors.
---

# Development Skill

## TypeScript standards

### Strict mode
`tsconfig.json` has `"strict": true`. All strict checks are active:
- `strictNullChecks` — handle `undefined` and `null` explicitly.
- `noImplicitAny` — type everything; never rely on inference from untyped sources.
- `strictFunctionTypes` — function parameter types are checked contravariantly.

### Acceptable patterns
```typescript
// Path alias (always use @/ for cross-feature imports)
import { aiClient } from '@/lib/ai';
import { db } from '@/db';
import { memories } from '@/db/schema';

// Zod schema for external input
const CreateMemorySchema = z.object({
  content: z.string().min(1).max(10000),
  source: z.enum(['chat', 'manual']).optional(),
});
type CreateMemoryInput = z.infer<typeof CreateMemorySchema>;

// Type guard
function isApiError(e: unknown): e is { message: string } {
  return typeof e === 'object' && e !== null && 'message' in e;
}
```

### Forbidden patterns
```typescript
// No: untyped any
const data: any = response;

// No: non-null assertion on user-controlled values
const id = req.params.id!;

// No: relative cross-feature imports
import { something } from '../../features/memory/memory-service';

// No: vendor SDK outside providers/
import { GoogleGenAI } from '@google/genai';  // in a route handler
```

## React standards

### Server vs client components
- Default to server components. Only add `"use client"` when you need:
  - `useState` / `useReducer`
  - `useEffect` / `useCallback` / `useMemo` with side effects
  - Browser APIs (`window`, `document`, `navigator`)
  - Event handlers that reference mutable state

### Component structure
```typescript
// 1. Imports (React, third-party, internal)
// 2. Types and interfaces
// 3. Component function
// 4. Sub-components (if small and tightly coupled)
// 5. Default export at the bottom

interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function Message({ id, role, content }: MessageProps) {
  // hooks first
  // derived values
  // handlers
  // render
}
```

### Accessibility in components
```typescript
// Use semantic elements
<button onClick={handleSend} type="button">    // not <div onClick>
<nav aria-label="Main navigation">
<main>
<section aria-labelledby="heading-id">

// Icon-only buttons always have aria-label
<button aria-label="Send message" onClick={handleSend}>
  <SendIcon aria-hidden="true" />
</button>

// Form inputs always have labels
<label htmlFor="message-input">Message</label>
<input id="message-input" type="text" ... />

// Dynamic content announces to screen readers
<div aria-live="polite" aria-label="Chat messages">
  {messages.map(...)}
</div>
```

## Next.js App Router standards

### Route handler pattern
Every API route in `src/app/api/` must follow this exact structure:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { myService } from '@/features/my-feature/my-service';

const RequestSchema = z.object({
  fieldName: z.string().min(1),
});

export async function POST(request: NextRequest) {
  // 1. Authentication
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Input validation
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // 3. Resource fetch + ownership check (for mutations on existing resources)
  // const resource = await myService.getById(parsed.data.id);
  // if (!resource) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // if (resource.userId !== session.user.id)
  //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 4. Business logic via service
  try {
    const result = await myService.doWork({
      userId: session.user.id,
      ...parsed.data,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error('my-feature.operation_failed', {
      userId: session.user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Streaming route handler
```typescript
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of aiClient.stream(messages)) {
          const line = JSON.stringify({ delta: chunk.text }) + '\n';
          controller.enqueue(encoder.encode(line));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
```

## Service module standards

```typescript
// src/features/my-feature/my-service.ts

import { db } from '@/db';
import { myTable } from '@/db/schema';
import { logger } from '@/lib/logger';

export class MyService {
  async create(input: { userId: string; content: string }) {
    const rows = await db
      .insert(myTable)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        content: input.content,
      })
      .returning();
    return rows[0] ?? null;
  }
}

export const myService = new MyService();
```

## Documentation standards

- Update `docs/environment-variables.md` if you add a new env variable.
- Update `CHANGELOG.md` under the `[Unreleased]` section.
- Update `README.md` scripts table if you add a new `package.json` script.
- Do not add TSDoc/JSDoc unless the function has a non-obvious contract.
