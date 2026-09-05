---
name: git-governance
description: Branch naming rules, commit message standards, push standards, and review standards for Northstar AI. Load this skill for all git operations.
---

# Git Governance Skill

## Branch naming rules

### Format

```
type/ticket-description
```

Where `type` is one of:

| Type | When to use |
|---|---|
| `feature` | New functionality |
| `bugfix` | Fix a bug on `develop` |
| `hotfix` | Fix a critical bug on `main` directly |
| `docs` | Documentation-only changes |

### Ticket format

- With a ticket number: `NS-<number>` (e.g. `NS-42`)
- Without a ticket number: use a short descriptive label (e.g. `add-streaming-retry`)

### Examples

```
feature/NS-42-streaming-retry
feature/NS-101-model-selector
bugfix/NS-17-auth-token-refresh
bugfix/NS-55-memory-search-null-vector
hotfix/NS-99-production-503
hotfix/NS-100-neon-ssl-error
docs/NS-5-api-reference
docs/update-pgvector-guide
```

### Invalid branch names

```
main            ← protected
master          ← protected
develop         ← protected
fix-thing       ← missing type prefix
feature-login   ← missing slash separator
Feature/NS-1    ← wrong case
```

## Conventional Commits reference

### Format

```
type(scope): description
```

Subject line limit: **72 characters total** (type + scope + description).

### Types

| Type | Use for |
|---|---|
| `feat` | New feature or visible capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring with no behaviour change |
| `test` | Test files only |
| `docs` | Documentation only |
| `chore` | Build, tooling, dependency updates, project config |
| `ci` | CI/CD workflows and configuration |
| `build` | Build system changes |
| `perf` | Performance improvements |
| `style` | Formatting, whitespace (no logic change) |
| `revert` | Reverting a prior commit |

### Scopes (common)

| Scope | What it covers |
|---|---|
| `chat` | Chat API, streaming, conversation handling |
| `auth` | Authentication, session management |
| `memory` | Memory service, memory API |
| `rag` | RAG service, document retrieval |
| `upload` | Document upload and indexing |
| `ai` | AI provider abstraction layer |
| `db` | Schema, migrations, database utilities |
| `config` | Environment configuration |
| `ui` | UI components, styling |
| `deps` | Dependency updates |
| `ci` | CI/CD workflows |

### Good commit examples

```
feat(memory): add hybrid vector and keyword search scoring
fix(chat): prevent orphaned user messages when stream fails
test(rag): add edge cases for null embedding_vec and empty query
refactor(db): replace NODE_ENV TLS check with url-based resolveSsl
docs(api): update chat route with conversationId ownership note
chore(deps): upgrade drizzle-orm to 0.46.0
ci(workflow): add coverage upload step to verify job
```

### Bad commit examples

```
fixed stuff                        ← no type, no scope, too vague
feat: add some features            ← no scope
feat(memory): Fixed the bug.       ← past tense, trailing period
WIP                                ← not a real commit
update files                       ← no type, too vague
```

### Body (optional)

If the commit needs more context, add a body after a blank line:

```
fix(chat): prevent orphaned user messages when stream fails

When a streaming response produced zero text (e.g. rate limit hit
after the request was accepted), the user message was persisted but
no assistant reply was created. Added a rollback: the user message
is deleted if the reply is empty before returning 500.
```

## Commit validation checklist

Before committing:

- [ ] Branch name matches `feature|bugfix|hotfix|docs/<identifier>-<description>`.
- [ ] `git status` reviewed — no unrelated files staged.
- [ ] No `.env`, `.env.local`, secrets, or credentials staged.
- [ ] No `node_modules/`, `.next/`, `coverage/`, `dist/` staged.
- [ ] All quality gates passed (typecheck, lint, tests, build).
- [ ] Commit message follows Conventional Commits format.
- [ ] Subject line ≤ 72 characters.
- [ ] Imperative mood.
- [ ] No Co-Authored-By trailer.

## Atomic commit guidelines

One commit = one logical change.

**Too large (split it):**
- A commit that adds a feature AND fixes an unrelated bug.
- A commit that changes the schema AND updates three different services.

**Correct granularity:**
- `feat(memory): add hybrid search` — adds the feature.
- `test(memory): add edge cases for hybrid search` — adds tests for the feature.
- `docs(api): update memory endpoint docs` — updates the docs.

These three commits could be one PR but are three atomic commits.

## Push standards

1. Only push after all quality gates pass and the Validator Agent says PASS.
2. Display the commit range and destination before pushing.
3. Wait for explicit human confirmation.
4. Only push to the feature/bugfix/hotfix branch — never directly to `develop`
   or `main`.
5. Never force-push to shared branches.

## Protected branch rules

| Branch | Direct commit | Direct push | Merge via |
|---|---|---|---|
| `main` | NEVER | NEVER | PR from `develop` only, after human approval |
| `develop` | NEVER | NEVER | PR from feature/* branches, after human approval |
| `feature/*` | OK | OK (own branch) | — |
| `bugfix/*` | OK | OK (own branch) | — |
| `hotfix/*` | OK | OK (own branch) | — |

## Git log conventions

After each commit, run:

```bash
git log --oneline -5
```

Confirm:
- Commit appears at the top.
- Message is correct.
- SHA is correct.
- No extra commits were made unintentionally.

## Tagging

Release tags are created on `main` after merge, using semantic versioning:

```bash
git tag v0.3.0
git push origin v0.3.0
```

Tag format: `v<major>.<minor>.<patch>`

Tags are never force-updated unless the release commit was wrong and the
tag was created in error within the same session.
