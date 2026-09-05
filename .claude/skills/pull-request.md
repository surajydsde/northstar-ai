---
name: pull-request
description: PR template, review checklist, and approval workflow for Northstar AI. Load this skill when creating or reviewing pull requests.
---

# Pull Request Skill

## PR creation conditions

A PR may only be created when all of these gates have passed in the current
workflow run:

| Gate | Required state |
|---|---|
| TypeScript | PASS — zero errors |
| ESLint | PASS — zero warnings |
| Unit tests | PASS — all tests pass |
| Coverage | PASS — ≥ 80% statements on changed files |
| Build | PASS — clean `next build` |
| Accessibility | PASS or N/A (no UI changes) |
| Security | PASS |
| Validator Agent | PASS |

If any gate is not PASS: **PR BLOCKED**.

---

## PR title format

```
type(scope): description
```

Same Conventional Commits format as commit messages. The title represents the
overall change. ≤ 72 characters.

Examples:
```
feat(memory): add hybrid vector and keyword search with pgvector
fix(chat): prevent orphaned user messages on stream failure
test(ai): complete unit suite for provider abstraction layer
docs(pgvector): update migration guide to reflect Neon completion
```

---

## PR body template

```markdown
## Summary

<!-- 2-4 sentences: what was changed, why it was needed, and what it replaces
or fixes. Written for a reviewer who has not seen the task brief. -->

## Changes Made

<!-- Bulleted list. One line per changed file. Be specific. -->

- `src/features/memory/memory-service.ts` — replaced in-Node cosine loop with
  SQL `cosineDistance` via Drizzle; added hybrid keyword fallback
- `src/features/memory/memory-service.test.ts` — added 12 tests for hybrid
  search, null vectors, and keyword-only fallback
- `src/db/schema.ts` — added `embeddingVec: vector(768)` to `memories` table
- `src/db/migrations/0002_pgvector.sql` — adds extension, column, HNSW index
- `docs/pgvector-migration.md` — updated status to complete, added usage notes
- `CHANGELOG.md` — added v0.3.0 entry

## Testing Performed

- Unit tests: 154 pass (0 fail). Coverage: 84% statements, 81% branches.
- Manual: ran `npm run smoke:rag` against Neon — retrieved 6 relevant chunks
  from 10 indexed documents.
- Edge cases verified: null `embedding_vec` degrades to keyword-only; empty
  query falls back to recency-ordered list.

## Quality Gates

| Gate | Result |
|---|---|
| TypeScript | ✅ PASS |
| ESLint | ✅ PASS |
| Unit tests | ✅ PASS (154 tests) |
| Coverage | ✅ PASS (84% stmt) |
| Build | ✅ PASS (13 routes) |
| Accessibility | ✅ N/A (no UI changes) |
| Security | ✅ PASS |

## Risks

- **Migration risk (Low):** `0002_pgvector.sql` is additive (IF NOT EXISTS).
  Old json columns are preserved. Safe to roll forward and back.
- **Neon-specific (Low):** pgvector 0.8.0 on Neon. If migrated to a different
  provider, verify pgvector availability before deploying this migration.

## Rollback Plan

1. `git revert <merge-commit-sha>` on `develop`.
2. The migration is additive — no column drops. No compensating migration
   needed unless `embedding_vec` data must also be purged.
3. `npm run build && npm run start` to verify.

## Screenshots

<!-- Delete this section if there are no UI changes -->

- [ ] Before screenshot attached
- [ ] After screenshot attached
- [ ] Mobile viewport (375px) checked
- [ ] Dark mode checked

---

## Reviewer Checklist

- [ ] Architecture follows existing patterns (AI layer, DB, auth)
- [ ] Only task-related files were changed
- [ ] Happy path and error paths are tested
- [ ] Accessibility validated (if UI changes)
- [ ] Ownership checks present on all resource mutations
- [ ] Input validation with Zod on all external inputs
- [ ] No secrets or credentials in code
- [ ] CHANGELOG updated
- [ ] Documentation updated (if API or behaviour changed)
- [ ] Commit messages follow Conventional Commits
- [ ] No Co-Authored-By trailers
```

---

## Review checklist for PR Reviewer Agent

### Architecture review
- [ ] AI calls go through `src/lib/ai/client.ts` only.
- [ ] Vendor SDKs only in `src/lib/ai/providers/`.
- [ ] Vector retrieval is SQL-only.
- [ ] Route handler pattern: session → validate → ownership → service →
  response.
- [ ] Business logic in service modules, not route handlers.
- [ ] New code reuses existing utilities — no duplication.

### Code quality review
- [ ] TypeScript strict — no `any`, all types correct.
- [ ] No dead code, unused imports, or console.log.
- [ ] No unnecessary complexity.
- [ ] No comments explaining what code does (only WHY).
- [ ] Naming consistent with project conventions.

### Security review
- [ ] `requireSession()` first in every protected route.
- [ ] Ownership check on every mutation (→ 403 on mismatch).
- [ ] All inputs validated with Zod.
- [ ] No secrets in source.
- [ ] No `dangerouslySetInnerHTML` with user content.
- [ ] File paths sanitised.

### Testing review
- [ ] Tests for happy path, edge cases, error path.
- [ ] Mocks at module boundary.
- [ ] No trivially-passing tests.
- [ ] Coverage ≥ 80% on changed files.

### Accessibility review (UI only)
- [ ] All interactive elements keyboard-reachable.
- [ ] All inputs have labels.
- [ ] ARIA correct and not redundant.
- [ ] Focus management correct for modals/dynamic content.
- [ ] Color contrast ≥ 4.5:1 for normal text.

---

## Approval workflow

```
PR Author Agent creates PR
        ↓
PR Reviewer Agent reviews
        ↓
    APPROVED?
    ├─ No → CHANGES REQUESTED → back to Developer Agent
    └─ Yes → human approval required
              ↓
          Human types "approved" / "lgtm" / "merge it"
              ↓
          Merge Agent executes merge
```

No merge happens without both PR Reviewer `APPROVED` and explicit human approval.
