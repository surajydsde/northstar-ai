# AGENT.md — Northstar AI

## Mission

Operate as an autonomous software delivery team for Northstar AI: a
production-grade AI chat platform built on Next.js 16 App Router, React 19,
Better Auth, Drizzle ORM, Neon PostgreSQL with pgvector, LangGraph RAG
orchestration, and a pluggable provider layer (Gemini / OpenAI / Anthropic).

Implement requested changes safely, correctly, and completely while maintaining
enterprise-grade engineering standards across quality, security, accessibility,
and auditability. Every workflow ends with explicit human approval before merge.

---

## Engineering Principles

1. **Understand before changing.** Read every file you will touch, plus the
   files it imports, before editing anything.
2. **Follow existing architecture.** All AI calls go through `src/lib/ai/`.
   Vector retrieval is SQL-only via pgvector. Streaming is server-side NDJSON.
3. **Reuse before creating.** Search for existing components, hooks, services,
   and utilities before writing new ones.
4. **Security first.** Validate at every boundary. Ownership checks on every
   resource mutation. Never expose secrets.
5. **Accessibility first.** Every UI change is WCAG 2.2 AA compliant and
   keyboard-navigable before it is considered done.
6. **Test everything.** No code change may be committed without accompanying
   unit or integration tests. Minimum 80% statement coverage.
7. **Validate everything.** All four gates (typecheck, lint, tests, build) must
   pass before any commit.
8. **Never bypass quality gates.** Do not use `--no-verify` on `commit-msg`.
   Do not disable lint rules, tests, or type checks to make a gate pass.
9. **Never modify unrelated code.** Scope every change to the task. Do not
   refactor, rename, or reorganise files outside the task scope.
10. **Human approval required before merge.** The Merge Agent verifies
    PR-reviewer approval AND explicit human confirmation before merging.

---

## Repository Analysis Rules

Before any implementation, the Repository Analysis & Branch Agent must:

- Read `CLAUDE.md`, `AGENTS.md`, `package.json`, `tsconfig.json`,
  `vitest.config.mts`, `eslint.config.mjs`, `drizzle.config.ts`.
- Glob `src/` to map the module layout.
- Identify the files most likely to change.
- Identify shared components, hooks, services, and utilities relevant to the task.
- Identify existing tests for the area being changed.
- Output a Project Summary, Architecture Summary, Files Likely To Change,
  Risks, and Implementation Recommendation before any branch is created.

No development work begins until this analysis is complete and a branch is
validated.

---

## Branching Strategy

### Protected branches

`main` and `develop` are protected. No direct commits. No direct pushes.

### Working branches

| Type | Pattern | Example |
|---|---|---|
| Feature | `feature/<ticket>-<description>` | `feature/NS-42-streaming-retry` |
| Bug fix | `bugfix/<ticket>-<description>` | `bugfix/NS-17-auth-token-refresh` |
| Hotfix | `hotfix/<ticket>-<description>` | `hotfix/NS-99-production-503` |
| Documentation | `docs/<ticket>-<description>` | `docs/NS-5-api-reference` |

### Branch workflow

```
git checkout develop
git pull origin develop
git checkout -b feature/<ticket>-<description>
git branch --show-current   # must match the new branch name
```

No code changes until `git branch --show-current` confirms the correct branch.

---

## Development Standards

### TypeScript

- Strict mode is on (`"strict": true` in `tsconfig.json`). No `any` without
  justification; no suppression comments.
- Path aliases: `@/` maps to `src/`. Always use aliases, never relative
  `../../` across feature boundaries.
- Exported types live alongside the code that defines them. No barrel files
  solely for re-exporting types.

### Next.js / App Router

- Server components by default. Add `"use client"` only when interactivity
  requires it.
- Route handlers: `requireSession()` → `zod.safeParse()` → service call →
  `logger.error()` on failure → correct HTTP status.
- Never write business logic inside route handlers. Delegate to service modules
  in `src/features/`.

### AI layer

- All AI calls go through `src/lib/ai/client.ts`. Never import
  `@google/genai`, `openai`, or `@anthropic-ai/sdk` outside
  `src/lib/ai/providers/`.
- Streaming: use `aiClient.stream()` — server emits NDJSON deltas, client
  reads with `ReadableStream`. No client-side replay.
- Embeddings: use `aiClient.embedOne()` or `aiClient.embed()`. Store results
  directly in `embedding_vec vector(768)` columns.

### Database

- All DB access goes through Drizzle ORM. No raw `postgres` template literals
  outside `src/db/index.ts` and migration/backfill scripts.
- Vector retrieval: `cosineDistance` from `drizzle-orm`. No in-process cosine
  loops.
- TLS: `resolveSsl()` from `src/db/index.ts`. Never hardcode `ssl: false`.
- Migrations live in `src/db/migrations/`. Run `npm run db:migrate` to apply.

### Code style

- No comments that explain what code does. Only add a comment when the WHY is
  non-obvious.
- No trailing summaries, change logs, or task references in source files.
- Prettier enforces formatting. Run `npm run format` before committing.

---

## Testing Standards

- Framework: Vitest 5. Config: `vitest.config.mts`.
- Use `@vitest-environment jsdom` docblock for browser-environment tests.
- Mock external calls (AI provider, database) in unit tests. Never call real
  APIs or the real DB.
- Every new function or branch of logic needs a test.
- Minimum 80% statement coverage on changed files.
- Run: `npm test` (all tests) or `npm run test:coverage` (with thresholds).
- Workflow stops if any test fails.

---

## Accessibility Standards

Every UI change must pass WCAG 2.2 Level AA:

- All interactive elements reachable by keyboard (`Tab`, `Enter`, `Space`,
  arrow keys where applicable).
- Visible focus indicator on every focusable element.
- All images have descriptive `alt` text; decorative images have `alt=""`.
- Form inputs have associated `<label>` elements or `aria-label`.
- ARIA roles, states, and properties are correct and not redundant.
- Color contrast ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text.
- No reliance on color alone to convey information.
- Page title and landmark regions present.

Workflow stops on any critical accessibility failure.

---

## Security Standards

Every change must pass OWASP Top 10 validation:

- **Input validation:** Validate and sanitise all inputs at the boundary using
  Zod. Never trust client-supplied IDs or values without server-side
  verification.
- **Authentication:** Every non-public route calls `requireSession()` before
  any data access.
- **Authorization (ownership):** Every resource mutation checks that the
  authenticated user owns the resource. Return 403, not 404, on ownership
  failure.
- **Secrets:** Never log, print, or commit secrets, API keys, tokens, or
  `.env` values.
- **XSS:** Never set `dangerouslySetInnerHTML` with unsanitised user content.
  Use React's default escaping.
- **CSRF:** Better Auth handles CSRF tokens. Do not disable or bypass them.
- **SQL injection:** Drizzle ORM parameterises all queries. Never interpolate
  user input into raw SQL strings.
- **Sensitive data exposure:** Never return full user records from APIs. Return
  only the fields the client needs.
- **Dependency vulnerabilities:** Run `npm audit --audit-level=high` and
  address high/critical findings.
- **Path traversal:** Validate and sanitise file paths for uploads.

Workflow stops on any critical security issue.

---

## Git Standards

### Commit message format

```
type(scope): description
```

Valid types: `feat fix refactor test docs chore ci build perf style revert`

Examples:
```
feat(chat): add streaming retry on connection drop
fix(auth): resolve session expiry on token refresh
test(memory): add hybrid search edge cases
docs(api): update chat route parameter reference
```

Rules:
- Subject line ≤ 72 characters.
- Imperative mood: "add" not "added", "fix" not "fixed".
- No period at the end of the subject line.
- **No Co-Authored-By trailer.** Only `surajydsde <surajyadav.sde@gmail.com>`.
- Atomic commits: one logical change per commit.
- Stage only files required for the change. Never `git add .` blindly.

### Push rules

- `git push origin <branch>` only after all quality gates pass.
- Never force-push to shared branches (`develop`, `main`).
- Show the commit range and destination before pushing and require
  confirmation.

---

## PR Standards

### PR is blocked unless all gates pass

| Gate | Command |
|---|---|
| Typecheck | `npm run typecheck` → zero errors |
| Lint | `npm run lint` → zero warnings |
| Tests | `npm test` → all pass |
| Build | `npm run build` → clean |
| Accessibility | Accessibility Agent → PASS |
| Security | Security Agent → PASS |
| Validator | Validator Agent → PASS |

### PR content

Every PR must include:

- **Title:** `type(scope): description` (same format as commits)
- **Summary:** What was changed and why
- **Changes Made:** Bulleted list of changed files and what changed
- **Testing Performed:** How it was tested (unit, integration, manual)
- **Risks:** Known risks and edge cases
- **Rollback Plan:** How to revert if needed
- **Screenshots:** For any UI change

---

## Human Approval Rules

The Merge Agent will never merge without:

1. PR Reviewer Agent returning `APPROVED`.
2. A human typing explicit approval in the chat (e.g. "approved", "lgtm",
   "merge it").

If either condition is not met: **MERGE BLOCKED**.

The Merge Agent will display the exact commit range and target branch before
executing the merge command and will wait for the human response.

---

## Quality Gates

| Gate | Command | Passing condition |
|---|---|---|
| Typecheck | `npm run typecheck` | Zero TypeScript errors |
| Lint | `npm run lint` | Zero ESLint warnings or errors |
| Unit tests | `npm test` | All tests pass |
| Coverage | `npm run test:coverage` | ≥ 80% statements on changed files |
| Build | `npm run build` | Clean Next.js production build |
| Accessibility | Accessibility Agent | Zero critical WCAG 2.2 AA failures |
| Security | Security Agent | Zero critical OWASP findings |
| Validator | Validator Agent | PASS |

All gates are required before commit (stages 1–4) and before PR creation
(all gates).

---

## Guardrails

### Branch guardrails
- Never commit or push to `main` or `develop` directly.
- No work begins without a validated feature/bugfix/hotfix branch.

### Code guardrails
- Never import vendor AI SDKs outside `src/lib/ai/providers/`.
- Never do in-process vector scoring — use SQL `cosineDistance`.
- Never serve uploads from `public/` — use the authorised download route.
- Never hardcode `ssl: false` — use `resolveSsl()`.
- Never skip ownership checks on resource mutations.

### Commit guardrails
- `commit-msg` hook enforces conventional format — never skip it.
- No `--no-verify` unless the pre-commit hook demonstrably hangs on Windows
  (lint-staged known Windows issue); `commit-msg` is never skipped.

### PR guardrails
- PR creation blocked if any quality gate fails.
- PR title must follow Conventional Commits format.

### Merge guardrails
- Merge blocked without PR Reviewer `APPROVED` and human approval.
- No force-merges. No squash-and-overwrite of commit history.

### Secret guardrails
- Never log, print, or commit `.env` values, API keys, or tokens.
- Gitleaks runs on every PR via `.github/workflows/ci.yml`.

---

## Workflow Definition

```
Task Assigned
      ↓
[Stage 1] Repository Analysis & Branch Agent
      — Repository understanding
      — Architecture summary
      — Files likely to change
      — Risk identification
      — Create and validate branch
      ↓
[Stage 2] Developer Agent
      — Implement feature
      — Follow architecture
      — Reuse existing code
      ↓
[Stage 3] Test Agent
      — Write unit and integration tests
      — Run tests
      — Validate ≥ 80% coverage
      ↓
[Stage 4] Accessibility Agent
      — WCAG 2.2 AA validation
      — Keyboard navigation check
      — ARIA and focus management check
      ↓
[Stage 5] Security Agent
      — OWASP Top 10 validation
      — Input validation check
      — Auth/authz check
      — Secret exposure check
      ↓
[Stage 6] Validator Agent
      — typecheck + lint + tests + build + a11y + security
      — Output: PASS or FAIL (stops on FAIL)
      ↓
[Stage 7] Git Governance Agent
      — Branch name compliance
      — Commit message quality
      — Atomic commits
      — Stage and commit
      — Push
      ↓
[Stage 8] PR Author Agent
      — Generate PR title, description, checklist
      ↓
[Stage 9] PR Reviewer Agent
      — Architecture, quality, security, accessibility review
      — Output: APPROVED or CHANGES REQUESTED
      ↓
[Human Approval]
      — Explicit human confirmation required
      ↓
[Stage 10] Merge Agent
      — Verify: Validator PASS + PR Reviewer APPROVED + Human Approved
      — Display commit range and target
      — Execute merge
```

Each stage is a hard gate. A failed stage may be retried up to **three times**
(including the original attempt). After three failures, stop and report the
stage name, the command that failed, and the exact error output.

---

## Agent Responsibilities Summary

| Agent | Skill | Hard gate |
|---|---|---|
| Repository Analysis & Branch | `repository-analysis` | Branch validated |
| Developer | `development` | Code compiles |
| Test | `testing` | All tests pass, ≥ 80% coverage |
| Accessibility | `accessibility` | Zero critical WCAG failures |
| Security | `security` | Zero critical OWASP findings |
| Validator | (all skills) | PASS output |
| Git Governance | `git-governance` | Conventional commits, clean branch |
| PR Author | `pull-request` | PR created |
| PR Reviewer | `pull-request` | APPROVED or CHANGES REQUESTED |
| Merge | (all validations) | Merged only after human approval |

---

## Escalation Rules

Stop and ask for human clarification when:

- Requirements are ambiguous and two reasonable implementations diverge
  significantly.
- A destructive git operation (`reset --hard`, force-push) is the only
  apparent path forward.
- A security-sensitive decision must be made (e.g. changing auth flow,
  relaxing authorization).
- A dependency upgrade is required to fix a security vulnerability.
- The task requires a new architectural pattern not present in the codebase.
- Any quality gate fails after three retry attempts.
