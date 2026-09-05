---
name: repository-analysis
description: Repository review checklist, architecture review, pattern analysis, and risk identification for Northstar AI. Load this skill before analyzing the codebase for any task.
---

# Repository Analysis Skill

## Repository review checklist

Before touching any code, confirm you have read and understood:

- [ ] `CLAUDE.md` — project rules, architecture constraints, quality gates
- [ ] `AGENTS.md` — pipeline overview and stage responsibilities
- [ ] `.claude/AGENT.md` — full standards and guardrails
- [ ] `package.json` — scripts, dependencies, current version
- [ ] `tsconfig.json` — path aliases (`@/` → `src/`), strict mode settings
- [ ] `vitest.config.mts` — test runner config, coverage thresholds
- [ ] `eslint.config.mjs` — lint rules and enforced patterns
- [ ] `drizzle.config.ts` — database config and migration path
- [ ] `src/db/schema.ts` — full database schema
- [ ] `src/lib/env.ts` — validated environment variable definitions

## Architecture review checklist

Confirm your understanding of these architectural constraints:

### AI layer
- [ ] All AI calls go through `src/lib/ai/client.ts`.
- [ ] Vendor SDKs (`@google/genai`, `openai`, `@anthropic-ai/sdk`) exist only
  inside `src/lib/ai/providers/`.
- [ ] Embedding vectors are stored in `embedding_vec vector(768)` columns.
- [ ] Vector retrieval uses `cosineDistance` in Drizzle — never in-process.
- [ ] Streaming uses server-side NDJSON, not client-side replay.

### Database
- [ ] Drizzle ORM for all queries — no raw template literal SQL outside
  `src/db/index.ts` and migration scripts.
- [ ] TLS uses `resolveSsl()` — `ssl: false` is never hardcoded.
- [ ] Migrations live in `src/db/migrations/` — applied by `npm run db:migrate`.

### Auth and authorization
- [ ] `requireSession()` is called as the first operation in every protected route.
- [ ] Ownership checks use `resource.userId !== session.user.id` → 403.

### Uploads
- [ ] Files written to `storage/uploads/` (outside `public/`).
- [ ] Served only through `GET /api/documents/[id]/content` with session check.

## Pattern analysis workflow

For each area of the codebase touched by the task:

### Route handlers (`src/app/api/`)
```
grep -r "requireSession" src/app/api/ --include="*.ts" -l
```
Read 2-3 existing handlers to confirm the pattern: session → validate →
ownership → service → response.

### Feature services (`src/features/`)
```
grep -r "export" src/features/ --include="*.ts" -l
```
Read the service module most similar to the one you will create or modify.

### Tests
```
grep -r "describe\|it(" src/ --include="*.test.ts" -l
```
Read the test file for the module you will change. Match its mock patterns and
`describe`/`it` structure.

### Drizzle queries
```
grep -r "cosineDistance\|db.select\|db.insert" src/ --include="*.ts" -n
```
Read 2-3 existing queries to confirm the pattern before writing new ones.

## Risk identification checklist

Rate each risk and note the mitigation before starting:

| Risk | Severity | Questions to answer |
|---|---|---|
| Breaking API contract | H/M/L | Does this change a route URL, method, or response shape? |
| Schema migration | H/M/L | Does this add/remove/alter DB columns? Is the migration additive? |
| Auth regression | H | Does this touch session handling, ownership checks, or auth middleware? |
| Embedding model change | H | Does this change `AI_EMBEDDING_MODEL` or `AI_EMBEDDING_DIMENSIONS`? |
| Test regression | M | Which existing tests are most likely affected? |
| New dependency | M | Is the package well-maintained? Any known CVEs? |
| Performance | M | Does this add a new full-table scan, N+1 query, or unindexed column access? |
| Build size | L | Does this add a large client-side dependency? |

## Implementation recommendation format

After completing the analysis, output:

```markdown
## Implementation Recommendation

### Approach
[One paragraph describing the recommended implementation strategy]

### Step-by-step plan
1. [First concrete action — file to create or modify]
2. [Second action]
3. ...

### Reuse these existing assets
- `src/features/X/Y.ts` — use function Z instead of creating a new one
- `src/components/A.tsx` — extend this component

### Do NOT touch these files
- `src/lib/ai/` — no AI layer changes needed for this task
- `src/db/schema.ts` — no schema changes needed

### Tests to write
- `src/features/X/Y.test.ts` — test the happy path, empty input, and error path
```
