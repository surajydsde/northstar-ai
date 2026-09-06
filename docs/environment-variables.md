# Environment variables

Copy `.env.example` to `.env` and fill in real values. `.env` is gitignored.

An empty value means "not set" — `AI_CHAT_MODEL=` falls back to the default
rather than failing validation.

## Required

| Name | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. No production default — the app will not boot without it. |
| `BETTER_AUTH_SECRET` | Session signing secret, 32+ characters. No production default. Generate with `openssl rand -base64 48`. |
| `BETTER_AUTH_URL` | Base URL for Better Auth, usually the app URL. |
| `AI_PROVIDER` | `gemini` \| `openai` \| `anthropic`. Defaults to `gemini`. |
| *(provider key)* | `GEMINI_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, matching `AI_PROVIDER`. Configuration fails closed if the selected provider's key is missing. |

In development only, `DATABASE_URL`, `BETTER_AUTH_SECRET` and
`BETTER_AUTH_URL` fall back to local defaults. Those fallbacks are deliberately
**not** applied when `NODE_ENV=production`: a deployment missing its secret must
fail to start rather than run on a value published in this repository.

## AI provider

| Name | Default | Description |
|---|---|---|
| `AI_EMBEDDING_PROVIDER` | `AI_PROVIDER` | Provider for embeddings. Required when `AI_PROVIDER=anthropic`, which has no embeddings API. |
| `AI_CHAT_MODEL` | per provider | `gemini-3.8-flash` / `gpt-4o-mini` / `claude-sonnet-4-5`. |
| `AI_EMBEDDING_MODEL` | per provider | `gemini-embedding-001` / `text-embedding-3-small`. |
| `AI_EMBEDDING_DIMENSIONS` | `768` | **Changing this invalidates every stored vector.** Run `npm run ai:reembed`. |
| `AI_THINKING_LEVEL` | unset | `MINIMAL` \| `LOW` \| `MEDIUM` \| `HIGH`. Gemini only. Unset, time-to-first-token measured ~12 s; lower levels are far more responsive. |
| `AI_TEMPERATURE` | `0.2` | Sampling temperature. |
| `AI_REQUEST_TIMEOUT_MS` | `60000` | Per-request timeout. |
| `AI_MAX_RETRIES` | `3` | Retries for 429/5xx/network. Non-streaming calls only. |
| `OPENAI_BASE_URL` | unset | Point the OpenAI provider at any compatible endpoint (Groq, Together, OpenRouter, a local Ollama). |

## Retrieval

| Name | Default | Description |
|---|---|---|
| `RAG_MIN_SCORE` | `0.62` | Relevance floor for documents. **Model-specific** — see below. |
| `MEMORY_MIN_SCORE` | `0.62` | Relevance floor for memories. |

The score thresholds are properties of the embedding model, not constants.
Measured with `gemini-embedding-001` at 768 dimensions, unrelated pairs score
0.49–0.57 and correct matches 0.67–0.79, so `0.62` separates them. The value
inherited from the Ollama setup was `0.3`, which under these embeddings matches
everything and disables filtering entirely. Recalibrate with `npm run ai:verify`
whenever the embedding model changes.

Retrieval is handled inside Postgres via pgvector HNSW indexes. There are no
application-side scan caps — `ORDER BY ... LIMIT` only materialises the rows
returned, regardless of table size.

## Storage

| Name | Default | Description |
|---|---|---|
| `UPLOADS_DIR` | `storage/uploads` | **Must stay outside `public/`.** Files under `public/` are served by Next as static assets with no session check. |

## Database

| Name | Default | Description |
|---|---|---|
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` | Verify the server TLS certificate in production. Only set to `false` for a known-good private network. |

## App

| Name | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production`. |
| `PORT` | `3000` | Dev/start port. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL, exposed to the browser. |

## Removed

`OLLAMA_*` and `CHROMA_*` are no longer read. Inference moved to external
provider APIs, and Chroma was never connected to by any application code —
retrieval runs against Postgres.
