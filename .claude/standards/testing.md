# Testing Standards — Northstar AI

## Framework

- **Vitest 5** — `vitest.config.mts`
- **Coverage:** v8 provider, reported per file
- **Thresholds:** 80% statements, 80% branches
- **jsdom environment:** use `// @vitest-environment jsdom` docblock (not config)

## File layout

```
src/features/memory/
├── memory-service.ts
└── memory-service.test.ts       ← unit tests alongside the source

src/app/api/memory/
├── route.ts
└── route.test.ts                ← route handler tests

src/lib/ai/
├── client.ts
├── client.test.ts
├── config.ts
└── config.test.ts
```

## Coverage targets

| File type | Statement | Branch |
|---|---|---|
| Service functions | ≥ 80% | ≥ 80% |
| Route handlers | ≥ 80% | ≥ 80% |
| AI provider adapters | ≥ 80% | ≥ 80% |
| UI components | ≥ 70% | ≥ 70% |
| Migration scripts | Not required | Not required |

## What every new function needs

| Scenario | Test required |
|---|---|
| Happy path with valid input | Yes |
| Empty string / empty array input | Yes (if accepted by type) |
| Null/undefined optional fields | Yes |
| Maximum input boundary | Yes (if documented limit) |
| Authentication failure (routes) | Yes — expect 401 |
| Invalid input / bad schema (routes) | Yes — expect 400 |
| Ownership failure (resource routes) | Yes — expect 403 |
| Service throws | Yes — confirm error propagation |
| Graceful degradation (AI failure) | Yes — confirm fallback |

## Mock hierarchy

Mock at the module boundary. Mocks go at the top of the file, before any
imports that depend on them.

### Priority order
1. Mock entire modules with `vi.mock('@/lib/ai', () => ...)`.
2. Override specific methods with `vi.mocked(fn).mockResolvedValue(...)` per test.
3. Use `vi.spyOn` for testing call counts without replacing implementation.

### Standard mocks

```typescript
// AI client (copy this block verbatim)
vi.mock('@/lib/ai', () => ({
  aiClient: {
    chat: vi.fn(),
    stream: vi.fn(),
    embed: vi.fn(),
    embedOne: vi.fn(),
    health: vi.fn().mockResolvedValue(true),
    embeddingTag: vi.fn().mockReturnValue({
      provider: 'gemini',
      model: 'gemini-embedding-001',
      dimensions: 768,
    }),
  },
}));

// Database (use specific table mocks, not generic db)
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    having: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

// Better Auth session
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
}));

// Logger (suppress noise in tests)
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
```

### Environment variable stubs

```typescript
// Use vi.stubEnv — restored automatically after each test with afterEach
beforeEach(() => {
  vi.stubEnv('AI_PROVIDER', 'gemini');
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
});

// For config tests, reset the module-level singleton
import { resetAiConfig } from '@/lib/ai/config';
afterEach(() => {
  resetAiConfig();
  vi.unstubAllEnvs();
});
```

## Test structure patterns

### Service unit test
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({ db: { ... } }));
vi.mock('@/lib/ai', () => ({ aiClient: { embedOne: vi.fn() } }));

import { memoryService } from './memory-service';
import { aiClient } from '@/lib/ai';
import { db } from '@/db';

describe('MemoryService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('stores the content and embedding vector', async () => {
      const vec = new Array(768).fill(0.1);
      vi.mocked(aiClient.embedOne).mockResolvedValue({ vector: vec, model: 'gemini-embedding-001' });
      vi.mocked(db.insert).mockReturnThis();
      vi.mocked(db.values).mockReturnThis();
      vi.mocked(db.returning).mockResolvedValue([{
        id: 'mem-1', userId: 'user-1', content: 'test', embeddingVec: vec,
      }]);

      const result = await memoryService.create({ userId: 'user-1', content: 'test' });

      expect(result).toMatchObject({ id: 'mem-1', content: 'test' });
      expect(aiClient.embedOne).toHaveBeenCalledWith('test', { purpose: 'document' });
    });

    it('still creates memory when embedding fails', async () => {
      vi.mocked(aiClient.embedOne).mockRejectedValue(new Error('quota'));
      vi.mocked(db.returning).mockResolvedValue([{
        id: 'mem-1', userId: 'user-1', content: 'test', embeddingVec: null,
      }]);

      const result = await memoryService.create({ userId: 'user-1', content: 'test' });

      expect(result).toMatchObject({ id: 'mem-1' });  // graceful degradation
    });
  });
});
```

### Route handler test
```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn() }));
vi.mock('@/features/memory/memory-service', () => ({
  memoryService: { create: vi.fn() },
}));

import { POST } from './route';
import { requireSession } from '@/lib/auth';
import { memoryService } from '@/features/memory/memory-service';

const req = (body: unknown, method = 'POST') =>
  new Request('http://localhost/api/memory', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/memory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    const res = await POST(req({ content: 'hi' }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty content', async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u1' } } as any);
    const res = await POST(req({ content: '' }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 with the created memory', async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u1' } } as any);
    vi.mocked(memoryService.create).mockResolvedValue({
      id: 'm1', content: 'hello', userId: 'u1', source: 'chat',
    } as any);

    const res = await POST(req({ content: 'hello' }) as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ content: 'hello' });
  });
});
```

## Running tests

```bash
npm test                   # one-shot run
npm run test:watch         # watch mode
npm run test:coverage      # with v8 coverage report at coverage/
```

## What is forbidden

- `.skip` or `.only` in committed code.
- `expect(true).toBe(true)` or other trivially-passing assertions.
- Tests that call real external APIs or the real database.
- Tests that rely on test execution order.
- `console.log` in test files (use `vi.fn()` to capture logger calls).
