# Northstar AI — Claude Code Instructions

## Project identity

Production-grade AI chat platform. Next.js 16 App Router, React 19, Better Auth,
Drizzle ORM, Neon PostgreSQL + pgvector HNSW, LangGraph RAG orchestration,
pluggable provider layer (Gemini / OpenAI / Anthropic).

## Commit rules

- Conventional Commits enforced by `commit-msg` hook.
- Format: `type(scope): description`
- Valid types: `feat fix refactor test docs chore ci build perf style revert`
- **Never add Co-Authored-By or any attribution trailer.** Commits carry only
  `surajydsde <surajyadav.sde@gmail.com>`.

## Quality gates — must all pass before any commit

```
npm run typecheck     # tsc --noEmit — zero errors
npm run lint          # eslint --max-warnings 0 — zero warnings
npm test              # vitest run — all 154+ tests pass
npm run build         # next build — clean production build
```

Run in this order. Fix failures before proceeding. Never skip or `--no-verify`
the `commit-msg` hook.

## Agent workflow

For all feature, bugfix, and documentation changes, invoke agents in order:

```
1. repository-analyst    Read codebase, create branch
2. developer             Implement
3. test-engineer         Write and run tests
4. accessibility         WCAG 2.2 AA (skip for non-UI changes)
5. security              OWASP Top 10
6. validator             All quality gates → PASS/FAIL
7. git-governance        Stage, commit, push (human confirmation)
8. pr-author             Generate PR
9. pr-reviewer           Review → APPROVED/CHANGES REQUESTED
10. merge                Merge after human approval
```

Full pipeline documentation: `.claude/AGENT.md`
Agent definitions: `.claude/agents/`
Skill references: `.claude/skills/`
Workflow: `.claude/workflows/feature-delivery.md`
Standards: `.claude/standards/`

## Key architecture constraints

- All AI calls: `src/lib/ai/client.ts`. Vendor SDKs only inside
  `src/lib/ai/providers/`.
- Vector retrieval: SQL `cosineDistance` via Drizzle. No in-process loops.
- Streaming: server-side NDJSON. No client-side replay.
- Uploads: `storage/uploads/` only, served through the authorised download route.
- TLS: `resolveSsl()` from `src/db/index.ts`. Never `ssl: false`.
- Auth: `requireSession()` first in every protected route.
- Ownership: `resource.userId === session.user.id` → 403 on mismatch.

## Branch model

```
main      ← release tags only
develop   ← integration branch
feature/* bugfix/* hotfix/* docs/* ← short-lived, branch from develop
```

Never commit directly to `main` or `develop`.
