# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow
[Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-09-06

Vector retrieval moved into Postgres via pgvector on Neon.

### Added

- `vector(768)` columns (`embedding_vec`) on `memories` and `document_chunks`
  with HNSW indexes for cosine similarity.
- Migration `src/db/migrations/0002_pgvector.sql` — idempotent; safe to re-run.
- `scripts/backfill-pgvector.ts` (`npm run db:backfill-vectors`) — backfills the
  new columns from existing json/jsonb embedding data.
- `src/db/index.ts` exports `resolveSsl()` — URL-based TLS selection replaces
  the `NODE_ENV`-based hardcoding that always disabled TLS in development.
- 154 automated tests (Vitest 5).

### Changed

- `rag-service.ts` and `memory-service.ts` delegate similarity scoring to
  Postgres (`cosineDistance` via Drizzle) instead of pulling candidate rows into
  Node and computing cosine in a loop.
- Memory search uses a hybrid score: `greatest(vector_score, keyword_score)`.
  Rows with a null `embedding_vec` (no vector, or a vector from a retired model)
  still match on keyword via `ILIKE`.
- Database moved to Neon (hosted Postgres, free tier). pgvector 0.8.0 is
  available on all Neon plans; the local Windows PostgreSQL 17 install does not
  ship the extension.

### Removed

- `RAG_MAX_DOCUMENTS`, `RAG_MAX_CHUNKS`, `MEMORY_MAX_SCANNED` environment
  variables. These were workarounds for in-process scanning and are unnecessary
  with HNSW indexing.
- Vector-space tagging in application code (`isComparable`, `writeTag`,
  `readTag`). Cross-model similarity corruption is now prevented structurally:
  `embedding_vec` only ever holds vectors from `aiClient.embed`; stale vectors
  from retired models have null columns and are absent from results rather than
  scored incorrectly.

### Known limitations

- The old `json`/`jsonb` embedding columns are still present. They are not
  written or read by application code, and will be dropped in a future migration
  once confirmed safe.

## [0.2.0] - 2026-09-06

Migration from local Ollama inference to pluggable external AI providers.

### Added

- `src/lib/ai` provider abstraction with Gemini, OpenAI and Anthropic
  implementations. Switching provider is an environment change; an ESLint rule
  fails the build if a vendor SDK is imported outside `src/lib/ai/providers/`.
- Real server-side streaming over NDJSON, replacing a client-side simulation
  that awaited the full response and replayed it on a timer.
- Vector-space tagging: every stored embedding records
  `{ provider, model, dimensions }`, and retrieval discards non-matching
  vectors before scoring.
- `npm run ai:verify` — live provider check for chat, streaming and embeddings.
- `npm run smoke:rag` — end-to-end retrieval, memory and persistence test.
- `npm run ai:reembed` — rewrites stored vectors under the current model.
- `npm run uploads:migrate` — relocates legacy uploads out of `public/`.
- `npm run db:migrate` and a re-runnable SQL migration runner.
- Authorized download route `GET /api/documents/[id]/content`.
- Husky hooks (pre-commit, commit-msg, pre-push), commitlint, Prettier,
  lint-staged, PR template and documented branch model.

### Changed

- Conversation history is now sent to the model. Previously only the current
  message was passed, so the assistant had no recollection of the thread.
- Messages are ordered by a new monotonic `seq` column. `created_at` alone
  could not order a conversation: Postgres `now()` is transaction-scoped and
  rapid inserts were measured sharing an identical timestamp.
- Relevance threshold raised from 0.3 to 0.62. Under `gemini-embedding-001`,
  unrelated pairs score 0.49–0.57, so the inherited 0.3 floor matched
  everything and disabled relevance filtering entirely.
- Retrieval bounds are configurable; the hard-coded five-document cap is gone.
- Configuration fails closed — a selected provider without its key, or a
  production deploy without `BETTER_AUTH_SECRET`, refuses to start.

### Fixed

- **IDOR in `POST /api/chat`.** The route accepted any `conversationId`
  without verifying ownership, allowing an authenticated user to write into
  another user's thread. Now returns 403.
- **Uploads served without authentication.** Files were written to
  `public/uploads/`, which Next serves as static assets with no session check.
- **Database TLS no longer skips certificate verification** in production.
- `@langchain/core` and `@langchain/langgraph` are now declared dependencies.
  They resolved only from a parent directory outside the project, so the Docker
  build could not have worked.
- Two type errors that broke `next build`.

### Removed

- Ollama service, client and all `OLLAMA_*` configuration.
- Chroma from `docker-compose.yml`. No application code ever connected to it;
  retrieval runs against Postgres.
- Duplicate, conflicting PostCSS configuration.

### Known limitations

- No automated test suite; `ai:verify` and `smoke:rag` need live credentials.
- No CI pipeline.
- Retrieval still scans in the application layer, bounded by
  `RAG_MAX_DOCUMENTS` and `MEMORY_MAX_SCANNED`. `pgvector` would remove the
  need for those bounds.

## [0.1.0]

Initial application: Next.js App Router, Better Auth, PostgreSQL, local Ollama
inference.
