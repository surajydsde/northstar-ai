# TypeScript Standards — Northstar AI

## Compiler configuration

`tsconfig.json` enforces:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

All strict checks are active. The build fails on unused variables, unused
parameters, and switch fallthrough.

## Path aliases

Always use `@/` for imports across feature boundaries:

```typescript
// Correct
import { aiClient } from '@/lib/ai';
import { db } from '@/db';
import { requireSession } from '@/lib/auth';

// Forbidden — relative cross-feature import
import { something } from '../../../lib/ai';
```

Relative imports are acceptable within the same directory only:
```typescript
import { helper } from './helpers';
```

## Type definitions

### Type vs Interface
- Use `interface` for object shapes that describe domain entities.
- Use `type` for unions, intersections, or derived types.

```typescript
// Interface for entity shapes
export interface MemoryEntry {
  id: string;
  userId: string;
  content: string;
  embeddingVec?: number[];
  createdAt: Date;
}

// Type for unions and derivatives
export type MemoryKind = 'preference' | 'fact' | 'instruction' | 'conversation';
export type CreateMemoryInput = Pick<MemoryEntry, 'userId' | 'content'> & {
  kind?: MemoryKind;
};
```

### Forbidden patterns

```typescript
// No any without documented justification and explicit cast
const x: any = ...;

// No non-null assertion on externally-supplied values
const id = params.id!;   // id might be undefined

// No type casting as a workaround for type errors
const user = session.user as Admin;  // bypasses type safety

// No @ts-ignore or @ts-expect-error without a comment explaining why
// @ts-ignore
doSomething(x);
```

### Null handling

```typescript
// Explicit null returns from service functions
async function getById(id: string): Promise<MemoryEntry | null> {
  const rows = await db.select().from(memories).where(eq(memories.id, id));
  return rows[0] ?? null;
}

// Check before use
const entry = await memoryService.getById(id);
if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

## Zod schemas

All external inputs use Zod. Place schemas adjacent to the code that uses them:

```typescript
import { z } from 'zod';

// Request body schema
const CreateConversationSchema = z.object({
  title: z.string().min(1).max(200),
  model: z.string().optional(),
});

// Infer the type
type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

// Parse — never use .parse() which throws; use .safeParse() to handle gracefully
const parsed = CreateConversationSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
}
```

## Error handling

```typescript
// At service boundaries — catch and wrap
try {
  const result = await externalService.call();
  return result;
} catch (error) {
  logger.error('feature.operation_failed', {
    userId,
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  throw error;  // or return null, depending on contract
}

// Type guard for unknown errors
function isError(e: unknown): e is Error {
  return e instanceof Error;
}
```

## Async patterns

```typescript
// Prefer async/await over .then() chains
const result = await myService.doWork(input);

// Parallel async operations
const [memories, documents] = await Promise.all([
  memoryService.search(userId, query),
  ragService.vectorSearch(userId, query),
]);

// Sequential when order matters or later depends on earlier
const conversation = await conversationService.getById(id);
const messages = await messageService.listByConversation(conversation.id);
```

## Module exports

```typescript
// Named exports only — no anonymous default exports
export function myFunction() { ... }
export class MyService { ... }
export const myInstance = new MyService();

// Default exports are acceptable only for Next.js pages and route handlers
// where the framework requires them
export default function Page() { ... }
```
