# ChatGPT Clone

A ChatGPT-style chat application built with Next.js, Better Auth, PostgreSQL and
a pluggable AI provider layer. Retrieval-augmented generation and long-term
memory are orchestrated with LangGraph and persisted in Postgres.

## Architecture

```text
Browser
  └─ Next.js App Router (React 19)
      ├─ Better Auth ──────────► PostgreSQL   sessions, accounts
      ├─ /api/conversations ───► PostgreSQL   threads, messages
      ├─ /api/upload ─────────► private disk + PostgreSQL   documents, chunks
      └─ /api/chat
           └─ LangGraph StateGraph
                ├─ loadContext ─► PostgreSQL   memories + document chunks (RAG)
                └─ respond ─────► src/lib/ai ─► Gemini | OpenAI | Anthropic
```

Everything that talks to a model goes through `src/lib/ai`. Swapping providers
is an environment change, not a code change — see
[docs/ai-providers.md](./docs/ai-providers.md).

Inference is served by an external provider API; there is no local model
runtime. Vector search runs against Postgres — there is no separate vector
database.

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL), or a PostgreSQL 16 instance
- An API key for one provider — Gemini, OpenAI, or Anthropic

## Quick start

```bash
cp .env.example .env
```

Set at minimum `AI_PROVIDER`, the matching API key, `DATABASE_URL` and
`BETTER_AUTH_SECRET` (`openssl rand -base64 48`).

```bash
npm install
npm run db          # start PostgreSQL
npm run db:migrate  # apply schema migrations
npm run ai:verify   # confirm the provider key works
npm run dev
```

Open http://localhost:3000.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (type-checks) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run db` | Start PostgreSQL via Docker |
| `npm run db:migrate` | Apply `src/db/migrations/*.sql` |
| `npm run db:generate` | Generate a Drizzle migration from the schema |
| `npm run ai:verify` | Live check of chat, streaming and embeddings |
| `npm run ai:reembed` | Rewrite stored vectors under the current model |
| `npm run smoke:rag` | End-to-end RAG + memory + persistence test |
| `npm test` | Unit tests (Vitest) |
| `npm run test:coverage` | Unit tests with coverage thresholds |
| `npm run format` | Prettier |

## Configuration

Every variable is documented in
[`.env.example`](./.env.example) and
[docs/environment-variables.md](./docs/environment-variables.md).

Two things are worth reading before changing them:

**Changing the embedding model invalidates every stored vector.** Vectors from
different models are not comparable even at the same dimensionality, and the
failure is silent — retrieval returns plausible-looking but meaningless scores.
The app tags each vector with its model and skips non-matching ones, so stale
data becomes a visible gap rather than wrong answers. Run `npm run ai:reembed`
after any embedding-model change.

**Relevance thresholds are model-specific.** `RAG_MIN_SCORE` defaults to `0.62`,
calibrated for `gemini-embedding-001`. A different embedding model needs a
different value; `npm run ai:verify` reports the numbers to calibrate against.

## Security notes

- Uploads are stored **outside** `public/` and served only through
  `/api/documents/[id]/content`, which verifies session and ownership. Anything
  placed under `public/` is served by Next with no authentication.
- `BETTER_AUTH_SECRET` and `DATABASE_URL` have no production defaults; the app
  refuses to boot without them.
- Database TLS verifies certificates by default
  (`DATABASE_SSL_REJECT_UNAUTHORIZED`).

## Known limitations

- **Retrieval scans in Node.** Embeddings live in `json` columns that no index
  can serve, so queries are bounded by `RAG_MAX_DOCUMENTS` (25) and
  `MEMORY_MAX_SCANNED` (1000). Content beyond those bounds is not searchable.
  Moving vectors to `pgvector` removes the need for the caps, but your
  PostgreSQL install does not provide the extension — see
  [docs/pgvector-migration.md](./docs/pgvector-migration.md).
- **No end-to-end browser tests.** 147 unit tests cover the AI layer and
  embedding logic (94% statements, 89% branches). Route handlers and React
  components are not yet covered; Playwright is not set up.
- **No git remote configured**, so CI has not run yet. The workflow in
  `.github/workflows/ci.yml` is written but unexercised.
- `src/tools/`, `src/features/chat/mock-data.ts` and
  `src/components/chat-shell.tsx` are unreferenced legacy files.

## Contributing

Branches follow `main` / `develop` / `feature|bugfix|hotfix|release/*`, and
commits follow [Conventional Commits](https://www.conventionalcommits.org/),
enforced by Husky and commitlint. Hooks install on `npm install`.

```bash
git checkout -b feature/my-change develop
```

See [docs/branching-and-releases.md](./docs/branching-and-releases.md).

## Documentation

- [Changelog](./CHANGELOG.md)
- [pgvector migration](./docs/pgvector-migration.md)
- [Branching and releases](./docs/branching-and-releases.md)
- [Architecture: current state](./docs/architecture/current-state.md)
- [AI provider migration plan](./docs/architecture/ai-provider-migration-plan.md)
- [AI provider configuration](./docs/ai-providers.md)
- [Environment variables](./docs/environment-variables.md)
