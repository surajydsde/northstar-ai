# Branching, commits and releases

## Branches

| Branch | Purpose | Merges from | Merges into |
|---|---|---|---|
| `main` | Production. Every commit is a release. | `release/*`, `hotfix/*` | — |
| `develop` | Integration. Always green. | `feature/*`, `bugfix/*` | `release/*` |
| `feature/<name>` | New work | `develop` | `develop` |
| `bugfix/<name>` | Non-urgent fix | `develop` | `develop` |
| `release/<version>` | Stabilisation | `develop` | `main` **and back into** `develop` |
| `hotfix/<name>` | Urgent production fix | `main` | `main` **and back into** `develop` |

No direct commits to `main` or `develop`.

Release and hotfix branches merge back into `develop` as well as `main`.
Skipping that step is how a production fix silently disappears in the next
release.

### Feature

```bash
git checkout develop && git pull
git checkout -b feature/streaming-cancel
# ... work, committing conventionally ...
git push -u origin feature/streaming-cancel
# open a PR into develop
```

### Release

```bash
git checkout -b release/0.2.0 develop
# version bump, changelog, final fixes only — no new features
git checkout main && git merge --no-ff release/0.2.0
git tag -a v0.2.0 -m "0.2.0"
git checkout develop && git merge --no-ff release/0.2.0
```

### Hotfix

```bash
git checkout -b hotfix/session-refresh main
# ... fix ...
git checkout main && git merge --no-ff hotfix/session-refresh
git tag -a v0.2.1 -m "0.2.1"
git checkout develop && git merge --no-ff hotfix/session-refresh
```

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), enforced by
commitlint in the `commit-msg` hook. Invalid messages are rejected.

```
<type>(<scope>): <subject>
```

Types: `feat` `fix` `refactor` `test` `docs` `chore` `ci` `build` `perf`
`style` `revert`.

```
feat(chat): add streaming response support
fix(auth): resolve session refresh issue
refactor(ai): create provider abstraction layer
docs(ai): document embedding vector-space tagging
```

Subject in lower case, imperative mood, no trailing period, 100 characters max.
Body length is unconstrained — explain *why* in it.

## Hooks

| Hook | Runs | Roughly |
|---|---|---|
| `pre-commit` | `lint-staged` — ESLint (`--max-warnings=0`) and Prettier on staged files | seconds |
| `commit-msg` | `commitlint` | instant |
| `pre-push` | `typecheck`, `lint`, `build` | ~1 minute |

Hooks install automatically via the `prepare` script on `npm install`.

To bypass in a genuine emergency: `git commit --no-verify`. If you find
yourself doing this routinely, fix the hook or the code — not the habit.

## Pull requests

`.github/pull_request_template.md` is applied automatically. Every PR needs a
problem statement, the solution, test evidence (real output, not a claim), a
risk assessment and a rollback plan.

The risk checklist calls out the changes that have bitten this codebase before:

- **Embedding model or dimensions.** Changing either invalidates every stored
  vector. They are not comparable across models even at identical
  dimensionality, and the failure is silent. Requires `npm run ai:reembed`.
- **Relevance thresholds.** Model-specific, not constants. Must be re-measured.
- **Schema changes.** Migrations must be safe to re-run.
- **Auth and ownership checks.** `/api/chat` previously accepted any
  conversation id without verifying the owner.
- **Upload paths.** Anything under `public/` is served with no authentication.

## Branch protection

Configured in the Git host, not the repository. Once a remote exists, require
on `main` and `develop`:

- pull request before merging, with at least one approval
- status checks passing (typecheck, lint, build, tests)
- branches up to date before merge
- no force pushes, no deletions

## Not yet in place

- No CI pipeline — the `pre-push` hook is the only automated gate, and it is
  local and skippable.
- No automated test suite. `ai:verify` and `smoke:rag` are live smoke tests
  requiring real credentials and a database, so they cannot gate CI as written.
- No remote configured; this repository is currently local only.
