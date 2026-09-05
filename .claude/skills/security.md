---
name: security
description: OWASP Top 10 checklist, input validation, authentication, authorization, secret detection, XSS, CSRF, and SQL injection standards for Northstar AI.
---

# Security Skill

## Core security model

Northstar AI's security model is:

1. **Authentication via Better Auth.** `requireSession()` in `src/lib/auth.ts`
   is the single gate. Every non-public route calls it first.
2. **Row-level authorization.** Every resource has a `userId` column. A
   mismatch returns 403.
3. **Input validation via Zod.** Every client-supplied value is parsed with a
   Zod schema before use.
4. **Parameterised queries via Drizzle.** No user input is interpolated into SQL.
5. **Secrets in environment variables.** Never in source code.

---

## Authentication checklist

- [ ] `requireSession()` is the first call in every protected route handler.
- [ ] The return value is checked: if `null`, return `401`.
- [ ] `session.user.id` is used as the authenticated identity for all data access.
- [ ] Never trust a `userId` from the request body or query string as proof of
  identity — always use `session.user.id`.
- [ ] Session tokens are managed by Better Auth — do not implement custom
  session parsing or JWT decoding.

```typescript
// Correct pattern
const session = await requireSession();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const userId = session.user.id;  // authoritative identity

// Forbidden
const userId = req.body.userId;  // client-supplied — not trusted
```

---

## Authorization (ownership) checklist

- [ ] Every endpoint that reads a single resource by ID fetches the record and
  checks `record.userId === session.user.id`.
- [ ] Mismatch returns **403 Forbidden**, not 404.
- [ ] List endpoints filter by `where(eq(table.userId, session.user.id))` —
  never return all rows.
- [ ] Bulk operations validate ownership for every item in the batch.

```typescript
// Correct pattern
const conversation = await conversationService.getById(id);
if (!conversation) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
if (conversation.userId !== session.user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

---

## Input validation checklist

- [ ] Every client-supplied value is parsed with a Zod schema before use.
- [ ] String fields have `min(1)` (not empty) and `max(N)` (bounded length).
- [ ] IDs are validated as UUIDs: `z.string().uuid()`.
- [ ] Enum fields use `z.enum([...])` — no raw string comparison.
- [ ] File uploads: validate MIME type (check the actual bytes, not just the
  `Content-Type` header), file size, and extension against an allowlist.
- [ ] Numeric inputs have `.int()`, `.positive()`, `.max()` as appropriate.

```typescript
const MessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(100_000),
  model: z.enum(['gemini-3.8-flash', 'gpt-4o-mini']).optional(),
});
```

---

## Secret exposure checklist

Secrets that must never appear in source code:

| Pattern | What it looks like |
|---|---|
| Gemini API key | `AIza...` |
| OpenAI API key | `sk-...` |
| AWS access key | `AKIA...` |
| GitHub token | `ghp_...` |
| JWT secret | any long random string in source |
| Database password | in a connection string literal |

Grep for these before any commit:

```bash
grep -rn "AIza\|sk-\|AKIA\|ghp_\|password.*=.*['\"]" src/ --include="*.ts" --include="*.tsx"
```

Environment variables must be:
- Defined in `.env.example` with a placeholder value.
- Validated in `src/lib/env.ts` with `createEnv` from `@t3-oss/env-nextjs`.
- Accessed only via the validated `env` object, never via `process.env.X`
  directly in components or services.

---

## XSS prevention checklist

- [ ] Never use `dangerouslySetInnerHTML` with user-supplied content.
- [ ] `react-markdown` renders user message content — confirm it uses the
  existing safe configuration (no `rehype-raw` or HTML-passthrough plugins).
- [ ] `href` values from user input are validated: only `http://` and `https://`
  URLs are allowed (block `javascript:`, `data:`, `vbscript:`).
- [ ] Cookie attributes: `HttpOnly`, `Secure`, `SameSite=Strict` (managed by
  Better Auth — do not override these).

---

## CSRF prevention checklist

- [ ] Better Auth generates CSRF tokens automatically. Do not disable or bypass
  this mechanism.
- [ ] Mutations use `POST`, `PUT`, `PATCH`, or `DELETE` — never `GET`.
- [ ] SameSite cookie attribute is `Strict` or `Lax` (Better Auth default).

---

## SQL injection prevention checklist

- [ ] All database queries use Drizzle ORM — parameters are always bound.
- [ ] No raw SQL template literals with user input:
  ```typescript
  // Forbidden
  await sql`SELECT * FROM users WHERE email = '${userInput}'`;
  
  // Correct
  await db.select().from(users).where(eq(users.email, userInput));
  ```
- [ ] `cosineDistance` for vector queries — never interpolate vector arrays
  into raw SQL.

---

## Sensitive data exposure checklist

- [ ] API responses return only the fields the client needs — no full user
  records, no password hashes, no session tokens.
- [ ] Logs contain: user ID, operation name, error message. Logs never
  contain: full request body, API keys, passwords, session tokens, PII
  beyond user ID.
- [ ] Database URLs in logs are redacted (password replaced with `***`).
- [ ] Error responses in production do not include stack traces.

---

## File upload security checklist

- [ ] Files are written to `storage/uploads/` — never to `public/`.
- [ ] Filename is sanitised: use `path.basename()` and prepend a UUID.
  Never use the client-supplied filename directly.
- [ ] File extension is validated against the allowlist in `document-indexer.ts`
  (`TEXT_EXTENSIONS`).
- [ ] File size limit is enforced before writing.
- [ ] Content-Type from the client is not trusted — validate by reading the
  magic bytes for supported types.

---

## Dependency security checklist

Before adding any new dependency:

- [ ] Check `npmjs.com` or `snyk.io` for known vulnerabilities.
- [ ] Run `npm audit --audit-level=high` after installing.
- [ ] Prefer packages with active maintenance (recent commits, responsive issues).
- [ ] Avoid packages with no type definitions, tiny download counts, or single
  maintainers for security-critical roles.

After adding:

```bash
npm audit --audit-level=high
```

High and critical findings block the PR.

---

## OWASP Top 10 — 2021 quick reference

| # | Category | Primary check in this project |
|---|---|---|
| A01 | Broken Access Control | `requireSession()` + ownership check on every mutation |
| A02 | Cryptographic Failures | `resolveSsl()`, no hardcoded secrets, `BETTER_AUTH_SECRET` required in production |
| A03 | Injection | Drizzle ORM parameterisation, Zod input validation |
| A04 | Insecure Design | validate → authorise → act, never act → validate |
| A05 | Security Misconfiguration | Production fails closed without required env vars |
| A06 | Vulnerable Components | `npm audit --audit-level=high` on every dependency change |
| A07 | Auth Failures | Better Auth, `requireSession()`, no custom JWT parsing |
| A08 | Data Integrity Failures | No `dangerouslySetInnerHTML`, no `JSON.parse` without guard |
| A09 | Logging Failures | `logger.error` with structured context, no secrets in logs |
| A10 | SSRF | No server-side URL fetching of user-supplied URLs |
