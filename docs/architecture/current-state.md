# Architecture Report — Current State

**Date:** 2026-09-05
**Scope:** `chatgpt-clone/` (Next.js 16 App Router, ~2,321 LOC across 59 TS/TSX files)
**Method:** Static read of every source file, `tsc --noEmit`, `eslint`, `npm audit`, git inspection. No code was modified.

---

## 1. Actual runtime architecture

The README documents this:

```
Browser -> Next.js -> Better Auth -> PostgreSQL -> Ollama -> Chroma
```

What the code actually does:

```
Browser
 └─ Next.js 16 App Router (React 19)
     ├─ AuthProvider (client) ──► /api/auth/[...all] ──► Better Auth ──► Postgres (Drizzle)
     └─ DashboardShell (client)
         ├─ /api/conversations[/id]  ──► Postgres
         ├─ /api/upload ──► local disk `public/uploads/` + Postgres
         ├─ /api/memory ──► Postgres
         └─ /api/chat
              └─ runAgent()  [LangGraph StateGraph]
                   ├─ node: loadContext
                   │     ├─ searchMemories()  ─► Postgres + in-process cosine
                   │     └─ searchDocuments() ─► Postgres + in-process cosine
                   └─ node: respond
                         └─ ollamaService.chat()  ──► HTTP  Ollama /api/chat
                                                  └──► HTTP  Ollama /api/embed
```

**Chroma is not used anywhere.** Zero references in `src/`. It exists only in `docker-compose.yml`, `.env.example`, `README.md` and `docs/environment-variables.md`. Vector search is Postgres `json` columns plus full-scan cosine similarity computed in Node.

---

## 2. Ollama dependency graph

Every path that must change for the provider migration:

```
src/agents/agent-config.ts          ← OLLAMA_CHAT_MODEL / OLLAMA_EMBEDDING_MODEL / OLLAMA_BASE_URL
        ▲
        │
src/services/ollama-service.ts      ← the ONLY HTTP client. chat() / streamChat() / embed() / healthCheck()
        ▲
        ├── src/agents/agent-workflow.ts               (chat  — completion)
        ├── src/lib/streaming.ts                       (streamChat — DEAD CODE, no importers)
        ├── src/features/memory/memory-service.ts      (embed x3: create, search, updateMemory)
        ├── src/features/rag/rag-service.ts            (embed x1: vectorSearch)
        └── src/features/documents/document-indexer.ts (embed x1: indexDocument)
```

Consumers of the above:

| Entry point | Reaches Ollama via | Surface |
|---|---|---|
| `POST /api/chat` | `runAgent` → `respond` → `chat()` | completion |
| `POST /api/chat` | `loadContext` → memory/rag → `embed()` | embeddings |
| `POST /api/upload` | `indexDocument` → `embed()` | embeddings |
| `GET/POST /api/memory` | `memoryService` → `embed()` | embeddings |

**Blast radius: 6 files.** The service boundary is already clean — `ollama-service.ts` is the single egress point. This is the single most favourable fact about the migration.

---

## 3. Dependency inventory

Declared in `package.json`: Next 16.3.3, React 19.2.8, better-auth 1.7.2 + `@better-auth/drizzle-adapter`, drizzle-orm 0.45.2 + drizzle-kit 0.31.10, `postgres` 3.4.9, zod 4.5.4, `@t3-oss/env-nextjs`, react-markdown + remark-gfm, lodash, tsx, dotenv.

**Not declared but imported:** `@langchain/core`, `@langchain/langgraph`. See finding B-1.

Absent entirely: no test runner, no Playwright, no Husky, no commitlint, no Prettier, no CI config, no AI provider SDK.

---

## 4. Findings

Severity: **B** = blocker, **H** = high, **M** = medium, **L** = low.

### B-1 — LangChain is not a declared dependency; the Docker build cannot work

`@langchain/core` and `@langchain/langgraph` are imported by 5 files (`agent-state.ts`, `agent-workflow.ts`, `api/chat/route.ts`, `tools/index.ts`, `types/agent.ts`). They appear in neither `package.json` nor `package-lock.json`, and `node_modules/@langchain/` in this project is an **empty directory**.

Resolution succeeds only by accident: Node walks up and finds them in the parent folder's `node_modules`:

```
require.resolve('@langchain/core/messages')
→ C:\Users\Suraj\test-react\node_modules\@langchain\core\dist\messages\index.cjs
```

`C:\Users\Suraj\test-react\package.json` declares `@langchain/core`, `@langchain/langgraph`, `@langchain/ollama`, `langchain`. That folder is outside the project and outside the Docker build context.

Consequence: the `Dockerfile` runs `COPY package*.json ./ && npm install`, which will not install LangChain. `docker compose up --build` fails on the app image. The app runs only on this one machine, from this one directory position. **The "already functional" state is not reproducible.**

### B-2 — `tsc --noEmit` fails (2 errors)

```
src/features/auth/user-service.ts(24,8): TS2769 — insert into `user` omits required `id`
src/features/rag/rag-service.ts(49,5):    TS2322 — DB row {chunkIndex} does not satisfy DocumentChunk {index}
```

`next build` type-checks, so **the production build is currently broken**. Any CI gate added in Phase 7 fails on day one until these are fixed.

### B-3 — The project is not in version control

`git rev-parse --show-toplevel` → `C:/Users/Suraj/test-react`. `git ls-files` inside `chatgpt-clone/` returns **0 files**; `git status` shows `?? chatgpt-clone/`. The single commit on `master` (`5b3f696 App: ollama: Ai Agent`) contains a different project (`ai-chat/`), which the working tree currently shows as deleted.

There is no baseline to diff against, no rollback point, and the requested branch model (`main`/`develop`/`feature/*`) cannot be established until this is fixed. This is the prerequisite for every other phase.

### H-1 — IDOR on `POST /api/chat`

`src/app/api/chat/route.ts:40` fetches the conversation by id and **never checks ownership**, unlike `api/conversations/[id]/route.ts:17` which correctly returns 403. An authenticated attacker who supplies another user's `conversationId` writes a user message and an assistant reply into the victim's thread and mutates its title and `lastMessageAt`.

Not a read-exfiltration path — `loadContext` scopes memories and documents to the attacker's own `session.user.id` — but it is an unauthorized write to another user's resource.

### H-2 — Uploaded documents are served publicly with no authorization

`api/upload/route.ts:26` writes to `public/uploads/`, which Next serves as static assets. Any file any user uploads is retrievable by anyone with the URL, with no session check. Filenames embed a UUID, so this is obscurity rather than access control. Files also live on the container filesystem and are lost on redeploy.

### H-3 — Secrets have insecure production defaults

`src/lib/env.ts:8` ships a hard-coded 62-character `BETTER_AUTH_SECRET` default, and `DATABASE_URL` defaults to `postgres:postgres@localhost`. `createEnv` therefore never fails closed: a production deploy with a missing secret boots successfully on a publicly known signing key. Compounding this, `db/index.ts:11` sets `ssl: { rejectUnauthorized: false }` in production — TLS without certificate verification.

### H-4 — Streaming is simulated on the client

`features/chat/use-streaming-response.ts` receives the **complete** response from `/api/chat` as JSON, then re-emits it in 18-character slices on a 12 ms timer. The user waits for the full model round trip with no output, then sees a fake typewriter. Real server streaming exists in `lib/streaming.ts` but has **no importers** — it is dead code. The "streaming support" requirement is currently unmet.

### M-1 — Message ordering bug

`message-service.ts:12` orders `desc(messages.createdAt)` with `limit(100)`. The intent (newest 100) is right, but `dashboard-shell.tsx:23` renders the array as-returned, so **conversation history displays newest-first**. Needs a re-sort ascending after the limit.

### M-2 — Vector search does not scale and silently truncates

Both `rag-service.ts` and `memory-service.ts` load **all** candidate rows into Node and compute cosine similarity per row. RAG hard-caps at "the 5 most recent documents" (`rag-service.ts:26`) with an inline comment admitting it is a workaround for a CPU hang. Embeddings live in a `json` column, not `pgvector`, so no index is possible. Documents 6+ are unreachable by search.

### M-3 — Dead and unreachable code

`src/tools/` (6 LangChain tools, including a `calculator` built on the `Function` constructor), `src/lib/streaming.ts`, `src/features/chat/mock-data.ts` (117 lines), `src/components/chat-shell.tsx` (87 lines of hard-coded placeholder UI). None are imported. The `toolResults` channel in `agent-state.ts` is never written.

### M-4 — Prisma/Drizzle documentation mismatch

`package.json` has `"migrate": "npx prisma migrate dev --name init"` and the README references Prisma. The project uses **Drizzle**. `drizzle.config.ts` points `out` at `./src/db/migrations`, which **does not exist** — there are no migrations at all. The schema is presumably applied by hand.

### M-5 — Duplicate, conflicting PostCSS config

`postcss.config.js` (CommonJS, `tailwindcss` + `autoprefixer`, Tailwind v3 style) and `postcss.config.mjs` (ESM, `@tailwindcss/postcss`, Tailwind v4 style) both exist. `tailwindcss@3.4.17` is installed. Which file wins is resolution-order dependent and fragile.

### M-6 — Chroma is dead infrastructure

The compose stack starts a Chroma container, publishes port 8000, and mounts a volume for a service nothing connects to.

### L-1 — Lint debt

4 errors (`@typescript-eslint/no-explicit-any` at `agent-workflow.ts:19`, `api/chat/route.ts:68,75`, `rag-service.ts:41`) and 4 unused-import warnings. Note that `npm run lint` **exits 0 despite the errors** — it cannot gate CI as written.

### L-2 — Moderate dependency vulnerabilities

4 moderate advisories, all from `drizzle-kit → @esbuild-kit/esm-loader → esbuild <=0.24.2` (GHSA-67mh-4wv8-2f99, dev-server request forgery). Dev-time only. `npm audit fix --force` would downgrade drizzle-kit to 0.18.1 — do not run it.

### L-3 — Other

- `docker-compose.yml` bind-mounts `.:/app` and runs `npm run dev` — a development compose file presented as the deployment story. The `Dockerfile` builds for production but compose overrides its `CMD`.
- Compose maps Postgres to host `5433` while the `.env.example` `DATABASE_URL` uses `5432`.
- `db/schema.ts:135` defaults `agent_runs.model` to `'gpt-4o-mini'` — a leftover; nothing writes to `agent_runs` or `tool_executions`.
- `dashboard-shell.tsx:96` uses `window.prompt` to rename a chat, and the rename is local-state only — it never persists.
- `chat-sidebar.tsx:34` puts `onClick` on a `<div>` with no role, tabindex, or key handler — not keyboard reachable (accessibility phase).
- `.gitignore` has no `public/uploads/` entry; once the project is committed, user uploads would be committed with it.

---

## 5. What is genuinely good

- **The egress boundary is already correct.** One service class, one config object. The migration is a substitution, not a refactor.
- Route handlers are consistent: `requireSession()` → zod `safeParse` → service call → structured `logger.error` → 401/500 split.
- `logger` emits structured JSON and does not log request bodies or secrets.
- The Drizzle schema is complete and sensibly constrained, with `onDelete` cascades throughout, and already has `agent_runs` / `tool_executions` tables ready for provider telemetry.
- Better Auth wiring is standard and correct; `conversations/[id]` is a good ownership-check template to copy into `/api/chat`.
- `document-indexer.ts` already degrades gracefully when embeddings fail (`embeddingsAvailable: false`) — exactly the right pattern to preserve under a paid, rate-limited provider.
