# Security Standards — Northstar AI

## Security model summary

| Layer | Mechanism |
|---|---|
| Authentication | Better Auth — `requireSession()` first in every protected route |
| Authorization | Row-level: `resource.userId === session.user.id` → 403 on mismatch |
| Input validation | Zod schemas on all external input |
| Database queries | Drizzle ORM — all parameters bound, no raw interpolation |
| Secrets | Environment variables only — validated by `src/lib/env.ts` |
| TLS | `resolveSsl()` from `src/db/index.ts` — never `ssl: false` |
| File uploads | `storage/uploads/` only — never `public/` |
| Logging | Structured JSON — no secrets, no PII beyond user ID |

## Authentication pattern

```typescript
// Every protected route handler — first line after imports
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;  // use only this for identity
  // ...
}
```

## Authorization pattern

```typescript
// Fetch resource, check ownership
const document = await documentService.getById(documentId);
if (!document) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
if (document.userId !== session.user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
// Safe to proceed
```

## Input validation pattern

```typescript
import { z } from 'zod';

const UploadSchema = z.object({
  fileName: z.string().min(1).max(255).regex(/^[\w\-. ]+$/, 'Invalid filename'),
  content: z.string().min(1).max(10_000_000),
});

const parsed = UploadSchema.safeParse(await request.json());
if (!parsed.success) {
  return NextResponse.json(
    { error: parsed.error.flatten() },
    { status: 400 }
  );
}
```

## Secrets management

```typescript
// src/lib/env.ts — all secrets defined here
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    GEMINI_API_KEY: z.string().optional(),
  },
  // ...
});

// In service code — always use the validated env object
import { env } from '@/lib/env';
const apiKey = env.GEMINI_API_KEY;   // typed, validated at startup

// Never
const apiKey = process.env.GEMINI_API_KEY;  // untyped, can be undefined silently
```

## File upload security

```typescript
import path from 'path';
import { randomUUID } from 'crypto';

// Allowed extensions (from document-indexer.ts)
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.log']);

function sanitizeUpload(originalName: string): string | null {
  // Extract basename to prevent path traversal
  const basename = path.basename(originalName);
  const ext = basename.slice(basename.lastIndexOf('.')).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) return null;
  return `${randomUUID()}-${basename}`;
}

// Write outside public/
const safeName = sanitizeUpload(fileName);
const filePath = path.join(process.cwd(), 'storage', 'uploads', safeName);
```

## Logging security

```typescript
// Correct: structured, no secrets
logger.error('memory.create_failed', {
  userId: session.user.id,
  error: error instanceof Error ? error.message : 'Unknown error',
});

// Forbidden: logs credentials
logger.error('db_error', { connectionString: env.DATABASE_URL });

// Forbidden: logs request body (may contain sensitive fields)
logger.info('request', { body: await request.json() });

// Forbidden: logs full error stack in production
logger.error('error', { stack: error.stack });
```

## Dependency security policy

1. Before adding any new package:
   - Check `npmjs.com` for download count and last publish date.
   - Check `snyk.io` for known vulnerabilities.
2. After adding: `npm audit --audit-level=high`.
3. High and critical advisories block the PR.
4. Moderate advisories are documented in the PR and scheduled for follow-up.
5. Never use `npm audit fix --force` — it may downgrade breaking dependencies.

## Security review triggers

The Security Agent must run (and pass) for any change that touches:

- Route handlers in `src/app/api/`
- Auth or session handling in `src/lib/auth.ts`
- File upload or download logic
- Drizzle queries or schema
- Environment variable handling in `src/lib/env.ts`
- Any new dependency
- Any change to `next.config.ts` (headers, CSP, redirects)

For changes that only touch `src/features/`, `src/components/`, or test files
with no auth/data-access logic: Security Agent reviews for XSS and input
validation only.
