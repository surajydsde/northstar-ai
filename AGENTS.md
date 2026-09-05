# Northstar AI — Agent Workflow

This repository uses a 7-stage ordered pipeline for all feature work.
Each stage is a hard gate: a failed stage may be retried up to three times
(including the original attempt). Retries must address the reported failure —
not blindly repeat the same command. After three failures, stop and report the
stage name, the command, and the exact failure.

## Stages

| # | Agent | Role |
|---|---|---|
| 1 | `feature-builder` | Reads the repo, implements the feature |
| 2 | `test-engineer` | Adds focused positive and negative tests |
| 3 | `quality-validator` | Runs all gates; validates success and failure paths |
| 4 | `code-reviewer` | Reviews the diff for correctness, security, regressions |
| 5 | `documentation-changelog` | Updates docs and the unreleased CHANGELOG entry |
| 6 | `release-builder` | Runs the production build |
| 7 | `release-publisher` | Pushes after explicit approval and a clean worktree |

Agent definitions live in `.claude/agents/`. Invoke them by name via the agent
host in order. The GitHub Actions workflow in
`.github/workflows/feature-pipeline.yml` is the deterministic quality gate —
it runs typecheck, lint, tests, and build on every PR to `main`/`develop`.

## Quality gates (stages 3 and 6 enforce these)

```bash
npm run typecheck   # tsc --noEmit — zero errors
npm run lint        # eslint --max-warnings 0 — zero warnings
npm test            # vitest run — all tests pass
npm run build       # next build — clean
```

## Commit rules

- Conventional Commits: `type(scope): description`
- Valid types: `feat fix refactor test docs chore ci build perf style revert`
- `commit-msg` hook enforces this via commitlint
- **No Co-Authored-By trailers.** Only `surajydsde <surajyadav.sde@gmail.com>`.

## Guardrails

- Read the relevant files, folder structure, package scripts, and existing tests
  before making any change.
- Keep changes scoped to the requested feature. Do not rewrite unrelated code.
- Never expose, commit, or print credentials, tokens, `.env` values, private
  keys, or API keys.
- Do not disable tests, lint rules, type checks, or security checks to pass a
  gate.
- Validate all external input at system boundaries; preserve existing
  authorization and privacy behaviour.
- Do not use destructive git commands (`reset --hard`, force-push, broad
  deletion) unless explicitly requested.
- Do not push directly to `main` or `develop` without explicit approval.
- Before pushing, show the commit range and destination and require explicit
  confirmation.
- If requirements are ambiguous or a destructive/security-sensitive choice is
  required, stop and ask for clarification.
