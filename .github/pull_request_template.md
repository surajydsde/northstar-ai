## Problem

<!-- What is wrong or missing today? Link the issue if there is one. -->

## Solution

<!-- What this change does, and why this approach over the alternatives. -->

## Screenshots

<!-- Required for any UI change. Before/after where it helps. Delete if N/A. -->

## Test evidence

<!-- Paste real output, not a claim that it passes. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run ai:verify` (if the AI layer changed)
- [ ] `npm run smoke:rag` (if retrieval, memory or persistence changed)

```
paste output here
```

## Risk assessment

<!-- What could break, and who notices first. Call out explicitly if this touches: -->

- [ ] Embedding model or dimensions — **invalidates every stored vector**; needs `npm run ai:reembed`
- [ ] Relevance thresholds — model-specific, must be re-measured
- [ ] Database schema — migration included and re-runnable
- [ ] Authentication or ownership checks
- [ ] File upload or serving paths
- [ ] Environment variables — `.env.example` and docs updated

## Rollback

<!-- How to undo this. "Revert the merge commit" is a valid answer only if it
     genuinely is: say so explicitly, or describe the extra steps (data
     backfill, re-embed, migration reversal). -->
