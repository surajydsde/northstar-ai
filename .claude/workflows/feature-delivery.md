# Feature Delivery Workflow

## Overview

This workflow defines the complete, ordered pipeline for delivering a feature,
bug fix, or documentation change in Northstar AI. Every stage is a hard gate.

## Invocation

When a task is assigned, invoke agents in this exact order:

```
1. repository-analyst   — understand the codebase, create the branch
2. developer            — implement the change
3. test-engineer        — write and run tests
4. accessibility        — validate WCAG 2.2 AA (skip for non-UI changes)
5. security             — validate OWASP Top 10
6. validator            — run all quality gates, produce PASS/FAIL
7. git-governance       — stage, commit, push (with human confirmation)
8. pr-author            — generate and create the PR
9. pr-reviewer          — review the PR, produce APPROVED/CHANGES REQUESTED
10. [human approval]    — explicit human confirmation required
11. merge               — merge after all conditions met
```

## Retry policy

- A failed stage may be retried up to **3 times** (including the original).
- Each retry must address the reported failure — not repeat the same command.
- After 3 failures: stop, report the stage, command, and exact failure to the
  user. Do not attempt stage 4 and beyond.

## Hard gates

| Gate | Condition to proceed |
|---|---|
| After repository-analyst | Branch `git branch --show-current` returns expected name |
| After developer | `npm run typecheck` and `npm run lint` pass |
| After test-engineer | `npm test` passes, coverage ≥ 80% |
| After accessibility | Accessibility Agent reports PASS (or N/A for non-UI) |
| After security | Security Agent reports PASS |
| After validator | Validator Agent reports PASS |
| After git-governance | Push confirmed by human |
| After pr-reviewer | PR Reviewer reports APPROVED |
| Before merge | Human types explicit approval |

## Branch-to-merge flow

```
develop (latest)
    │
    ├── git checkout -b feature/NS-XX-description
    │
    │   [implementation, tests, validation]
    │
    ├── git commit "feat(scope): description"
    ├── git push origin feature/NS-XX-description
    │
    ├── PR: feature/NS-XX-description → develop
    │
    │   [PR review, human approval]
    │
    ├── merge --no-ff into develop
    │
    └── (when releasing) merge develop → main, tag vX.Y.Z
```

## Escalation points

Stop and ask the user when:

1. Requirements are ambiguous — two reasonable implementations exist.
2. A destructive git operation is the only path forward.
3. A security-sensitive architectural decision must be made.
4. A new dependency is required that introduces a known CVE.
5. A stage fails after 3 attempts.
6. A quality gate cannot pass without disabling a rule.

## Quality gates reference

```bash
npm run typecheck     # tsc --noEmit — zero errors
npm run lint          # eslint --max-warnings 0 — zero warnings
npm test              # vitest run — all tests pass
npm run test:coverage # vitest + coverage — ≥ 80% statements
npm run build         # next build — clean production build
```

## Non-UI task shortcut

For changes with no `.tsx` or `.jsx` modifications:

- Skip the Accessibility Agent (record N/A in the Validator report).
- Security Agent still runs for all tasks.

## Documentation updates (required for every PR)

- `CHANGELOG.md` — add entry under `[Unreleased]`.
- `docs/environment-variables.md` — update if a new env var was added.
- `README.md` — update scripts table if a new script was added.
- Feature-specific docs in `docs/` — update if an API or behaviour changed.
