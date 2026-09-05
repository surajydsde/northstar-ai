# AI provider configuration

All model traffic goes through `src/lib/ai`. No application code knows which
provider is configured, and an ESLint rule (`no-restricted-imports`) fails the
build if a vendor SDK is imported outside `src/lib/ai/providers/`.

## Switching provider

Change one variable and supply the matching key:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=...
```

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=...
```

```bash
# Anthropic has no embeddings API, so embeddings must come from elsewhere.
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
AI_EMBEDDING_PROVIDER=gemini
GEMINI_API_KEY=...
```

Any OpenAI-compatible endpoint (Groq, Together, OpenRouter, a local Ollama)
works through the OpenAI provider:

```bash
AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=...
AI_CHAT_MODEL=llama-3.3-70b-versatile
```

The configuration **fails closed**: selecting a provider without its key throws
at startup rather than booting into a broken state.

## Verifying a change

```bash
npm run ai:verify
```

Exercises chat, streaming and embeddings against the live API, and asserts that
embeddings are semantically meaningful — a related pair must outscore an
unrelated one. Run it after any provider or model change.

```bash
npm run smoke:rag
```

Indexes a document, stores a memory, runs the LangGraph agent, and checks the
answer actually used retrieved context. Requires a database. Cleans up after
itself.

## Model IDs are not stable — verify, don't assume

`models.list()` is **not** proof of access. During this migration
`gemini-2.5-flash` appeared in the listing but returned:

```
404 — This model models/gemini-2.5-flash is no longer available to new users.
```

Defaults in `src/lib/ai/config.ts` were chosen by calling the API, not by
reading documentation. Re-verify with `npm run ai:verify` when a model is
retired.

Also worth knowing: `gemini-embedding-2` returned **one** vector for a
two-input batch. The provider asserts that the embedding count matches the
input count, so this surfaces as an error rather than silently misaligning
vectors with the chunks they belong to. `gemini-embedding-001` batches
correctly and remains the default.

## Embeddings: the failure mode to understand

**Vectors from different embedding models are not comparable, even at identical
dimensionality.** `nomic-embed-text` and `gemini-embedding-001` can both
produce 768-dimensional vectors, but cosine similarity between them is noise
that looks like a valid score — a well-formed number between -1 and 1, with no
error raised anywhere.

Mitigation, in `src/features/embeddings/embedding-store.ts`:

- every stored vector carries a `{ provider, model, dimensions }` tag;
- queries discard vectors whose tag does not match, **before** scoring;
- skipped rows are logged as `rag.stale_embeddings_skipped`, so a pending
  re-embed looks like a retrieval gap rather than silently wrong answers.

After changing `AI_EMBEDDING_MODEL` or `AI_EMBEDDING_DIMENSIONS`, existing
vectors become invisible to search until rewritten:

```bash
npm run ai:reembed -- --dry-run   # report what is stale
npm run ai:reembed                # rewrite it
```

This only overwrites vectors it successfully re-embeds. Content is never
deleted, and an interrupted run leaves already-updated rows valid.

## Relevance thresholds are model-specific

`RAG_MIN_SCORE` / `MEMORY_MIN_SCORE` default to `0.62`, which is **not** a
universal constant. Measured against `gemini-embedding-001` at 768 dimensions:

| pair | cosine |
|---|---|
| unrelated query / document | 0.49 – 0.57 |
| correct match | 0.67 – 0.79 |

The value inherited from the Ollama setup was `0.3`, which under these
embeddings admits everything — silently disabling relevance filtering
altogether. Re-measure and retune whenever the embedding model changes.

## Latency

Gemini 3.x models reason before emitting output. With `AI_THINKING_LEVEL`
unset, time-to-first-token measured ~12 s on a short prompt. Set
`AI_THINKING_LEVEL=MINIMAL` or `LOW` to trade reasoning depth for
responsiveness. The setting is currently honoured only by Gemini; other
providers ignore it.

## Reliability

- Every request is bounded by `AI_REQUEST_TIMEOUT_MS`.
- 429 / 5xx / network failures retry with exponential backoff and full jitter,
  honouring `Retry-After`, up to `AI_MAX_RETRIES`. A 4xx other than 429 is a
  caller error and never retries.
- Streaming retry is split at the first emitted byte: **opening** the stream
  retries (nothing has reached the caller, and a transient 503 on the initial
  request is common), but once a delta has been yielded, failures propagate —
  restarting generation there would duplicate output.
- Provider exceptions normalise to `AiError` with a stable `code`, so routes
  return 429 and 504 rather than a blanket 500.
- Logs record model, latency, token counts and error codes — never prompt or
  completion content, and never credentials.

## Adding a provider

1. Implement `AiProvider` in `src/lib/ai/providers/<name>.ts`.
2. Add the name to `PROVIDER_NAMES` and its defaults to `DEFAULTS` in `config.ts`.
3. Add a `case` to `createProvider` in `factory.ts`.
4. Add the SDK to the `no-restricted-imports` list in `eslint.config.mjs`.
5. Run `npm run ai:verify` against a real key.

No other file should need to change.
