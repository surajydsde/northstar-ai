# Migration Plan — Ollama → Pluggable External AI Providers

**Status:** Proposed. Awaiting approval.
**Companion document:** [current-state.md](./current-state.md)

**Decisions taken (2026-09-05):**
- **Gemini is the reference provider.** It is the one with a working key, so it is the one verified end-to-end. OpenAI and Anthropic providers are still built to the same interface, but ship unverified.
- **Postgres is the memory and retrieval store.** Chroma is removed. Context persistence stays in the database.

---

## 1. Objective

Remove the runtime dependency on local Ollama models. Route all completion and embedding traffic through a provider abstraction selected by environment variable, with no provider-specific logic outside `src/lib/ai/`. Keep Next.js, Better Auth, Postgres and Drizzle exactly as they are.

Interface priority (all implemented): OpenAI → Anthropic → Gemini → OpenAI-compatible.
Runtime default: **Gemini**.

---

## 2. Two blockers that gate everything

Phase 1 found three blockers (B-1, B-2, B-3 in the companion report). Two must be resolved before any migration work starts, because without them there is no reproducible build and no rollback point.

**B-3 — commit the project.** `chatgpt-clone/` is entirely untracked. Nothing else in this plan is safe until there is a baseline commit. Proposed first action: initialise the branch model and commit the current working tree verbatim as `chore: baseline import of chatgpt-clone`, with `public/uploads/` added to `.gitignore` and the existing `.env` confirmed excluded.

**B-1 — declare the LangChain dependencies.** `npm install @langchain/core @langchain/langgraph` inside this project, pinned to the versions currently resolving from the parent folder (`@langchain/core@^1.2.9`, `@langchain/langgraph@^1.4.13`). Without this the Docker image does not build, so no migration can be verified in a container.

**B-2 — fix the two type errors** so `next build` succeeds and CI has a green starting point.

These three are small, mechanical, and non-destructive. I recommend doing them as Phase 2a before the provider work.

---

## 3. Target design

### 3.1 Directory layout

```
src/lib/ai/
├── types.ts        # provider-neutral contracts (see 3.2)
├── config.ts       # zod-validated env → AiConfig; the only place env vars are read
├── errors.ts       # AiError taxonomy: RateLimit | Timeout | Auth | Overloaded | BadRequest | Unknown
├── retry.ts        # bounded exponential backoff + jitter, honours Retry-After
├── factory.ts      # AI_PROVIDER string → AiProvider instance, memoised
├── client.ts       # the app-facing singleton: chat / stream / embed / health
├── index.ts        # public surface — the ONLY module the rest of the app imports
└── providers/
    ├── openai.ts       # OpenAI + any OPENAI_BASE_URL-compatible endpoint (Groq, Together, OpenRouter, Ollama)
    ├── anthropic.ts
    └── gemini.ts
```

Nothing outside `src/lib/ai/` imports a vendor SDK. Enforced by an ESLint `no-restricted-imports` rule added in Phase 5.

### 3.2 The contract

```ts
export type AiRole = 'system' | 'user' | 'assistant';
export interface AiMessage { role: AiRole; content: string; }

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  jsonSchema?: { name: string; schema: object };  // structured outputs
  tools?: AiToolDefinition[];                     // declared now, dispatched later
}

export interface ChatResult {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  toolCalls?: AiToolCall[];
}

export type ChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: AiToolCall }
  | { type: 'done'; result: Omit<ChatResult, 'content'> };

export interface AiProvider {
  readonly name: string;
  chat(messages: AiMessage[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: AiMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
  embed(input: string[], model?: string): Promise<number[][]>;
  health(): Promise<boolean>;
}
```

Design notes:

- **`embed` always takes and returns arrays.** The current `embed(string | string[])` union is the source of the awkward `(await embed(x))[0] || []` idiom at three call sites.
- **`stream` yields a discriminated union, not raw strings.** Raw strings cannot carry usage, finish reason, or tool calls — which is why the current `streamChat` could never be wired into a route that also needs to persist the message.
- **Usage is first-class.** Under a paid provider, token accounting stops being optional. The `agent_runs` table already has `input_tokens` / `output_tokens` columns waiting.
- **`tools` is in the signature from day one, unimplemented.** Adding tool calling later must not change the interface.

### 3.3 Configuration

```bash
AI_PROVIDER=gemini            # gemini | openai | anthropic
AI_EMBEDDING_PROVIDER=        # optional; defaults to AI_PROVIDER (see §4.4)
AI_CHAT_MODEL=                # optional; per-provider default from config.ts
AI_EMBEDDING_MODEL=
AI_EMBEDDING_DIMENSIONS=768
AI_REQUEST_TIMEOUT_MS=60000
AI_MAX_RETRIES=3

GEMINI_API_KEY=...
OPENAI_API_KEY=
OPENAI_BASE_URL=              # optional — set for Groq / Together / OpenRouter / local Ollama
ANTHROPIC_API_KEY=
```

The SDK is **`@google/genai`** (v2.21.0 current). Note that `@google/generative-ai` (0.24.1) is the deprecated predecessor — do not use it.

Proposed Gemini defaults, to be confirmed against the live API during Phase 3 rather than trusted from documentation:

| Setting | Proposed |
|---|---|
| chat model | `gemini-2.5-flash` |
| embedding model | `gemini-embedding-001` |
| embedding dimensions | 768 (the model accepts a configurable `outputDimensionality`) |

`config.ts` validates with zod and **fails closed**: if `AI_PROVIDER=openai` and `OPENAI_API_KEY` is empty, the process refuses to start. This is the opposite of the current `env.ts` behaviour (H-3) and is deliberate.

Per-provider model defaults live in `config.ts` so `AI_CHAT_MODEL` stays optional; switching provider requires editing one variable.

### 3.4 Reliability

- **Timeout:** every request gets an `AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)`, composed with any caller-supplied signal.
- **Retry:** 429 / 5xx / network errors only. Bounded exponential backoff with full jitter, capped at `AI_MAX_RETRIES`, honouring `Retry-After` when present. 4xx other than 429 never retries.
- **Errors:** SDK exceptions normalise to `AiError` with a stable `code`. Route handlers map `RateLimit` → 429 and `Timeout` → 504 instead of today's blanket 500.
- **Never log request or response bodies**, only model, latency, token counts, and error code. API keys never enter a log line or an error message.

---

## 4. The embeddings problem — the one genuinely hard part

This is where the migration stops being a drop-in substitution, and it deserves an explicit decision.

**Vectors from different models are not comparable, even at equal dimensionality.** This is the trap, and choosing Gemini walks straight into it.

`nomic-embed-text` produces 768-dimensional vectors. `gemini-embedding-001` can be configured to produce 768-dimensional vectors too. They are *not* in the same vector space: the cosine similarity between a nomic vector and a Gemini vector is noise that happens to be a well-formed number between -1 and 1.

Had the dimensions differed, the mismatch would at least be *detectable* — a length check would catch it. At matching dimensions there is nothing to detect. The cosine function in `rag-service.ts:8` already treats a missing index as `0`, so it never throws either way. Every existing row in `memories.embedding` and `document_chunks.metadata.embeddings` becomes garbage the moment the embedding model changes, retrieval quietly returns wrong documents, and **no error surfaces anywhere** — not in logs, not in the UI, not in a test that only asserts "results were returned".

Given that the whole point of this feature is making the application remember context, silent retrieval corruption is the highest-impact failure mode in this migration. It is R1 in the risk register and the reason the mitigations below are not optional.

The secondary constraint: **Anthropic ships no embeddings API at all**, which the design must accommodate regardless of which provider is default.

This must be handled deliberately:

1. **Persist the embedding model and dimension alongside every vector.** `document-indexer.ts:60` already writes an `embeddingModel` field but hardcodes the string `'ollama'`. Extend it to `{ provider, model, dimensions }` and add the same to the `memories` table.
2. **Filter by model at query time, before scoring.** A vector whose `model` tag does not match the current embedding model is skipped, never scored. Stale vectors become *absent* rather than *silently wrong* — a visible retrieval gap instead of invisible bad results.
3. **Backfill.** A one-off `scripts/reembed.ts` re-embeds existing rows under the new model. For a dev database, truncating `document_chunks` and `memories` is also acceptable — but that is a destructive action and I will not do it without an explicit instruction.
4. **Anthropic needs a separate embeddings provider.** Because Anthropic has no embeddings endpoint, `AI_PROVIDER=anthropic` must fall back to a Gemini or OpenAI key for embeddings, or disable RAG. Hence the distinct `AI_EMBEDDING_PROVIDER` variable, defaulting to `AI_PROVIDER`, so chat and embedding providers can differ.
5. **A regression test that would actually catch this.** Assert that a query embedded with model A does not retrieve chunks tagged model B. A test that only asserts "some results came back" passes happily on corrupted data, which is precisely how this class of bug ships.

**Cost note.** `POST /api/chat` currently calls `embed()` twice per message (memory search, RAG search) and writes a new memory row on *every* message. Against a metered API that is 2 embedding calls plus 1 completion per user turn, and an unbounded-growth memories table. I recommend adding an embedding cache and a "is this worth remembering" filter in Phase 3, but flag it now because it changes the cost profile materially. Gemini's free tier makes this survivable during development; it does not make it correct.

---

## 4b. Keeping context in the database

Postgres is confirmed as the memory and retrieval store, and Chroma is removed. That decision is sound — but the *current* Postgres implementation will not deliver the "remember the context" goal as written, and this is worth separating from the provider migration.

Today, both `rag-service.ts` and `memory-service.ts` load every candidate row into Node and compute cosine similarity in a loop. Embeddings sit in a `json` column, which no index can help. RAG is hard-capped at the five most recent documents (`rag-service.ts:26`) with an inline comment conceding it is a workaround for a CPU hang. **Documents six and older are permanently unreachable** — the application does not remember them, by construction.

The natural fix keeps everything in the database: the **`pgvector`** extension, a `vector(768)` column replacing the `json` one, and an HNSW index. Similarity becomes a `<=>` operator in SQL with `ORDER BY ... LIMIT`, the full-scan and the five-document cap both disappear, and retrieval stays entirely in Postgres — no new service, no Chroma, no change to the architecture you asked for.

`postgres:16-alpine` in the current compose file does not ship `pgvector`; it needs `pgvector/pgvector:pg16` or an equivalent image. That is a one-line compose change plus a `CREATE EXTENSION`.

I have scoped this as **Phase 3c, separate and optional**, because it is a schema migration with its own risk profile and the provider migration must not depend on it. Phase 3 works correctly on the existing `json` columns — just slowly, and still capped at five documents. My recommendation is to do 3c, since the five-document cap directly contradicts the stated goal.

---

## 5. Phased plan

Each phase ends with a working tree that builds, lints and passes tests. Each is a separate `feature/*` branch into `develop`.

### Phase 2a — Stabilise the baseline *(blockers; recommend approving immediately)*
Commit the project; declare `@langchain/*`; fix the 2 type errors; delete the duplicate PostCSS config; correct the `migrate` script. Result: `npm run build` succeeds and `docker compose up --build` works.
**Risk:** minimal. **Rollback:** `git revert`.

### Phase 2b — Build the provider layer *(additive, zero behaviour change)*
Create all of `src/lib/ai/` with the OpenAI provider and unit tests against a mocked SDK. Nothing imports it yet; `ollama-service.ts` is untouched and still live.
**Risk:** none — dead code until Phase 3. **Rollback:** delete the directory.

### Phase 3 — Cut over
Replace the six Ollama call sites with `aiClient`. Add the embedding-model metadata and the model-match filter from §4. Delete `ollama-service.ts`, `agent-config.ts`'s Ollama fields, and `lib/streaming.ts`. Remove the `ollama` service from compose. Add the Anthropic and Gemini providers and verify a provider switch by env var alone.

Ship real SSE streaming here (H-4) — a paid API makes a 10-second silent wait far worse than it is locally, and retrofitting streaming after the fact means touching every call site twice.

**Breaking changes:** `OLLAMA_*` variables stop being read; deployments must set `AI_PROVIDER` + a key or the app will refuse to boot (intentional). Existing embeddings are orphaned until re-embedded.
**Validation:** integration tests against a mocked provider; manual smoke of chat, upload, memory search; one run against each of the three real providers.
**Rollback:** revert the merge commit — Phase 2b left `ollama-service.ts` intact, so the revert is clean. Keep the `ollama` compose service commented rather than deleted for one release.

### Phase 3b — Security fixes *(strongly recommend not deferring)*
H-1 IDOR on `/api/chat`; H-3 fail-closed env; H-2 move uploads out of `public/` behind an authorized route; M-1 message ordering. These are small, and H-1 in particular should not wait for a "security phase" at the end.

### Phase 3c — `pgvector` *(optional, recommended — see §4b)*
Swap the `postgres:16-alpine` image for `pgvector/pgvector:pg16`, `CREATE EXTENSION vector`, migrate `memories.embedding` and the chunk embeddings from `json` to `vector(768)`, add HNSW indexes, and replace the in-Node cosine loops with SQL `<=>` ordering. Removes the five-document cap and the full-table scan.
**Risk:** a real schema migration on real data. **Rollback:** the `json` columns stay in place for one release; the new columns are additive until the switch is verified.

### Phase 4 — Testing
Vitest + RTL + Playwright, coverage gates at 80%. Provider layer, retry and error mapping first; then route handlers; then E2E for auth → chat → upload.
**Honest note:** 80% across all four metrics on a codebase with zero tests is a substantial effort — realistically comparable to all prior phases combined. I would suggest ratcheting (start at the measured baseline, raise the floor each PR) rather than a hard 80% gate on day one, but will implement a hard gate if you prefer.

### Phase 5 — Code quality
Prettier; ESLint flat config with `no-explicit-any` as an error, `no-restricted-imports` banning vendor SDKs outside `src/lib/ai/`, and unused-import removal; fix `npm run lint` to exit non-zero. Delete the dead code in M-3. Tighten `tsconfig` (`noUncheckedIndexedAccess`, `noUnusedLocals`).

### Phase 6 — Git workflow
`main` / `develop` / `feature|bugfix|hotfix|release/*`; Husky pre-commit (lint-staged), commit-msg (commitlint/conventional), pre-push (typecheck + unit tests); PR template with problem / solution / test evidence / risk / rollback; branch protection.
**Note:** branch protection and required status checks are configured in GitHub's UI or via `gh api`, not in the repo. This project has a remote (`origin`) pointing at the parent repo — we should confirm whether `chatgpt-clone` should live there or get its own repository.

### Phase 7 — CI/CD
GitHub Actions: install → typecheck → lint → unit → integration (Postgres service container) → build → `npm audit` → coverage upload. Required on PRs to `develop` and `main`.

### Phase 8 — Documentation
Rewrite the README (it currently describes Ollama and Chroma as the architecture); `docs/` for architecture, setup, deployment, branching, releases, testing, and AI provider configuration; ADRs for the provider abstraction, the embedding-dimension decision, and the Chroma removal.

---

## 6. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Embedding model change silently corrupts retrieval — undetectable at matching dimensions | **Certain without mitigation** | **High** | Tag every vector with `{provider, model, dimensions}`; filter by model *before* scoring; backfill script; regression test asserting cross-model isolation (§4) |
| R2 | Docker build still fails after B-1 for another undeclared dep | Medium | High | Verify with a clean `npm ci` in a container before Phase 3 |
| R3 | Anthropic has no embeddings API | **Certain** | Medium | Separate `AI_EMBEDDING_PROVIDER` (§4.4). Not on the critical path while Gemini is default |
| R10 | Retrieval remains capped at 5 documents, so the app still fails to "remember" older context | **Certain without Phase 3c** | **High** | `pgvector` + HNSW index (§4b) |
| R11 | Gemini free-tier rate limits (RPM/RPD) throttle development and demos | High | Low | Retry with backoff honouring `Retry-After`; surface 429 as retryable, not 500 |
| R4 | Per-message API cost is higher than expected (2 embeds + 1 completion per turn, unbounded memory writes) | High | Medium | Embedding cache; memory-worthiness filter; usage logging to `agent_runs` |
| R5 | Rate limits on free tiers break the app under light load | Medium | Medium | Retry with backoff; surface 429 to the client as a retryable state, not a 500 |
| R6 | Provider streaming formats differ (SSE deltas vs. Anthropic event types vs. Gemini chunks) | Certain | Low | Normalised `ChatChunk` union absorbs this inside each provider |
| R7 | LangGraph pins conflict with a provider SDK | Low | Medium | Providers are called via their own SDKs, not LangChain adapters — no coupling |
| R8 | No migrations exist; schema changes in Phase 3 have no forward path | Medium | Medium | Generate an initial Drizzle baseline migration during Phase 2a |
| R9 | 80% coverage target slips the schedule | High | Low | Ratchet rather than hard-gate (Phase 4 note) |

---

## 7. Complete breaking-change list

1. `OLLAMA_BASE_URL`, `OLLAMA_CHAT_MODEL`, `OLLAMA_EMBEDDING_MODEL`, `OLLAMA_ENABLED`, `OLLAMA_KEEP_ALIVE` are no longer read.
2. `AI_PROVIDER` and a matching API key become **required**; the app fails to boot without them.
3. `src/services/ollama-service.ts` and its exported types (`OllamaMessage`, `OllamaChatOptions`, `ollamaService`) are deleted.
4. `src/lib/streaming.ts` is deleted (currently unreferenced).
5. The `ollama` service leaves `docker-compose.yml`; the `ollama_data` volume is orphaned.
6. Existing rows in `memories.embedding` and `document_chunks.metadata.embeddings` become unusable until re-embedded.
7. `chroma` leaves `docker-compose.yml` and `CHROMA_*` leaves the env docs and `.env.example` (M-6). **Confirmed:** Postgres is the context store.
8. `POST /api/chat` gains a 403 response for foreign `conversationId` (H-1). Any client relying on the current permissive behaviour breaks — none should.
9. Upload URLs change from `/uploads/<file>` to an authorized route (H-2). Existing `documents.file_url` rows need rewriting.

---

## 8. Open questions

**Answered 2026-09-05:**
- ~~Which provider key?~~ **Gemini.** Reference provider; the only one verified end-to-end.
- ~~Chroma?~~ **Removed.** Postgres is the memory and retrieval store.

**Still open:**

1. **Existing embeddings:** re-embed via script, or is truncating `document_chunks` / `memories` in the dev database acceptable? Destructive — I will not do it unprompted.
2. **Phase 3c (`pgvector`):** in scope? Without it the five-document retrieval cap stands and the app still cannot remember older context (§4b, R10). Recommended.
3. **Repository:** should `chatgpt-clone` be committed into the existing `test-react` repo, or extracted into its own?
4. **Coverage gate:** hard 80% in Phase 4, or ratchet from baseline?
5. **Agents:** the brief describes seven specialist agents. I have applied those seven lenses myself in this analysis. Do you want me to spawn actual parallel subagents for later phases, or continue single-threaded? Subagents cost more and start without this context, so I would only recommend them for genuinely parallel work such as writing the test suite while CI is being set up.

**Note on the key itself:** put `GEMINI_API_KEY` into `.env` yourself — do not paste it into this conversation. `.env` is already covered by `.gitignore`.
