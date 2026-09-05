---
name: testing
description: Unit testing, integration testing, coverage requirements, and test execution workflow for Northstar AI. Load this skill when writing or reviewing tests.
---

# Testing Skill

## Framework and configuration

- **Vitest 5** — `vitest.config.mts`
- **Global setup:** `src/test/setup.ts` (vi.mock calls, global mocks)
- **Coverage:** v8 provider, thresholds at 80% statements and 80% branches
- **Browser-environment tests:** add `// @vitest-environment jsdom` as the
  first line of the file (not in `vitest.config.mts` — `environmentMatchGlobs`
  was removed in Vitest 5)

## Unit testing standards

### File naming
- Test file lives alongside the module it tests: `my-service.ts` →
  `my-service.test.ts`.
- Integration tests: `my-service.integration.test.ts` (these may be slower
  and may be excluded from the default test run via glob patterns in
  `vitest.config.mts`).

### Structure
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock at module level, before any imports that use the mock
vi.mock('@/lib/ai', () => ({
  aiClient: {
    embedOne: vi.fn(),
    stream: vi.fn(),
  },
}));

vi.mock('@/db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: '1', content: 'test' }]),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
}));

import { myFunction } from './my-service';
import { aiClient } from '@/lib/ai';

describe('myFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the expected result for valid input', async () => {
    vi.mocked(aiClient.embedOne).mockResolvedValue({
      vector: new Array(768).fill(0.1),
      model: 'gemini-embedding-001',
    });

    const result = await myFunction({ userId: 'user-1', content: 'Hello' });

    expect(result).toMatchObject({ content: 'Hello' });
  });

  it('returns null when the record does not exist', async () => {
    const result = await myFunction({ userId: 'user-1', content: '' });
    expect(result).toBeNull();
  });

  it('throws when the AI client fails', async () => {
    vi.mocked(aiClient.embedOne).mockRejectedValue(new Error('quota exceeded'));

    await expect(myFunction({ userId: 'user-1', content: 'x' }))
      .rejects.toThrow('quota exceeded');
  });
});
```

### What every new function needs

- **Happy path:** valid input → expected output.
- **Edge cases:** empty string, array of length 0, maximum length, null where
  the type allows.
- **Error path:** invalid input or dependency failure → correct error or
  graceful degradation.

### Route handler test pattern
```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
}));

vi.mock('@/features/memory/memory-service', () => ({
  memoryService: {
    create: vi.fn(),
  },
}));

import { POST } from './route';
import { requireSession } from '@/lib/auth';
import { memoryService } from '@/features/memory/memory-service';

const mockRequest = (body: unknown) =>
  new Request('http://localhost/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/memory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    const res = await POST(mockRequest({ content: 'test' }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u1' } } as any);
    const res = await POST(mockRequest({ content: '' }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 with created memory', async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u1' } } as any);
    vi.mocked(memoryService.create).mockResolvedValue({
      id: 'm1', content: 'hello', userId: 'u1',
    } as any);

    const res = await POST(mockRequest({ content: 'hello' }) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ content: 'hello' });
  });
});
```

## Mock reference

### AI client
```typescript
vi.mock('@/lib/ai', () => ({
  aiClient: {
    chat: vi.fn().mockResolvedValue({ text: 'response', usage: {} }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { text: 'chunk1' };
      yield { text: 'chunk2' };
    }),
    embed: vi.fn().mockResolvedValue({ vectors: [new Array(768).fill(0.1)] }),
    embedOne: vi.fn().mockResolvedValue({ vector: new Array(768).fill(0.1) }),
    health: vi.fn().mockResolvedValue(true),
    embeddingTag: vi.fn().mockReturnValue({
      provider: 'gemini', model: 'gemini-embedding-001', dimensions: 768,
    }),
  },
}));
```

### Environment variables
```typescript
// Do NOT use `as NodeJS.ProcessEnv` — it is unsound.
// Use this helper instead:
const env = (values: Record<string, string>) => ({
  ...values,
  NODE_ENV: 'test' as const,
});

// In the test:
vi.stubEnv('AI_PROVIDER', 'gemini');
vi.stubEnv('GEMINI_API_KEY', 'test-key');
```

### AI config reset (for config tests)
```typescript
import { resetAiConfig } from '@/lib/ai/config';
afterEach(() => resetAiConfig());
```

## Coverage requirements

### Thresholds (from `vitest.config.mts`)
- Statements: ≥ 80%
- Branches: ≥ 80%

### How to check coverage on specific files
```bash
npx vitest run --coverage --reporter=verbose 2>&1 | grep "src/features/my-feature"
```

### When coverage fails
Add tests for uncovered branches. Common uncovered branches:
- The `catch` block of a try/catch that handles service failures.
- The `else` branch of an auth/ownership check.
- The empty-array or null-record early return.

## Test execution workflow

```bash
npm test                   # run all tests once
npm run test:watch         # watch mode for development
npm run test:coverage      # with coverage report
```

Stop if any test fails. Never `.skip` a test to make the suite pass — fix it.
