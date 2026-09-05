# Architecture — Current State

**Project:** Northstar AI (`northstar-ai`)
**Updated:** 2026-09-06
**Stack:** Next.js 16 App Router · React 19 · Better Auth · Drizzle ORM ·
Neon PostgreSQL + pgvector HNSW · LangGraph RAG · Pluggable AI provider layer

---

## Runtime architecture

```
Browser
  └─ Next.js App Router (route handlers)
       ├─ Better Auth         — session, JWT, OAuth
       ├─ src/lib/ai/         — provider abstraction
       │    ├─ client.ts      — all AI calls enter here
       │    └─ providers/     — Gemini · OpenAI · Anthropic · OpenAI-compat
       ├─ LangGraph           — RAG StateGraph orchestration
       └─ Drizzle ORM
            └─ Neon PostgreSQL
                 ├─ conversations, messages, documents, chunks (text)
                 └─ embeddings (vector 768-dim, pgvector HNSW cosine index)
```

---

## Key design constraints

| Concern | Rule |
|---|---|
| AI calls | All through `src/lib/ai/client.ts`. Vendor SDKs only in `src/lib/ai/providers/`. |
| Vector retrieval | SQL `cosineDistance` via Drizzle. No in-process scan loops. |
| Streaming | Server-side NDJSON. No client-side replay. |
| File uploads | `storage/uploads/` only, served through the authorised download route. |
| TLS | `resolveSsl()` from `src/db/index.ts`. Never `ssl: false`. |
| Auth | `requireSession()` first in every protected route. |
| Ownership | `resource.userId === session.user.id` — 403 on mismatch. |

---

## Source structure

```
src/
  app/                  Next.js App Router — pages and route handlers
    api/
      auth/[...all]/    Better Auth handler
      chat/             NDJSON streaming chat endpoint
      conversations/    CRUD (list, get, delete)
      documents/        Upload, list, content retrieval
      memory/           Vector memory search
      upload/           File ingestion → chunking → embedding
  db/                   Drizzle schema, migrations, resolveSsl
  features/             Auth context, UI feature modules
  lib/
    ai/                 Provider abstraction + LangGraph RAG
    logger.ts           Pino structured logger
  services/             Business logic (conversation, document, memory)
```

---

## Test suite

- **Framework:** Vitest 5, jsdom environment
- **Coverage:** 154 tests across 11 files
- **Mocks:** AI client, DB, Better Auth, logger — all via `vi.mock`

---

## Quality gates

```bash
npm run typecheck     # tsc --noEmit — zero errors
npm run lint          # eslint --max-warnings 0 — zero warnings
npm test              # vitest run — 154 tests
npm run build         # next build — clean production build
```

CI enforces all four gates on every push to `main` and `develop`
(`.github/workflows/feature-pipeline.yml`, `ci.yml`).
