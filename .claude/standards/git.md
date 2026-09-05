# Git Standards — Northstar AI

## Identity

All commits use:
- Name: `surajydsde`
- Email: `surajyadav.sde@gmail.com`
- **No Co-Authored-By trailer.** Ever.

Verify before committing:
```bash
git config user.name   # surajydsde
git config user.email  # surajyadav.sde@gmail.com
```

## Branch model

```
main        ← release-only (tagged vX.Y.Z)
develop     ← integration
feature/*   ← new features
bugfix/*    ← bug fixes on develop
hotfix/*    ← critical fixes on main (also merged to develop)
docs/*      ← documentation-only changes
```

### Creating a branch

```bash
git checkout develop
git pull origin develop         # if remote exists
git checkout -b feature/NS-42-streaming-retry
git branch --show-current       # verify
```

### Branch deletion after merge

```bash
git branch -d feature/NS-42-streaming-retry          # local
git push origin --delete feature/NS-42-streaming-retry  # remote
```

## Commit workflow

```bash
# 1. Check status — review every file
git status

# 2. Stage only task-relevant files
git add src/features/memory/memory-service.ts
git add src/features/memory/memory-service.test.ts
git add docs/environment-variables.md

# 3. Verify staged files
git diff --cached --stat

# 4. Commit
git commit -m "feat(memory): add hybrid vector and keyword search"

# 5. Verify
git log --oneline -3
```

## Hooks

The `commit-msg` hook runs commitlint. It enforces Conventional Commits format.
Never skip it (`--no-verify` on commit-msg is forbidden).

The `pre-commit` hook runs lint-staged. On Windows, if it hangs for > 30s, use
`git commit --no-verify` once and note the issue. The `commit-msg` hook is not
skipped by `--no-verify` — commitlint still validates.

The `pre-push` hook runs `typecheck + lint + test + build`. All must pass before
push is allowed.

## What to never stage

```
.env
.env.local
.env.production
node_modules/
.next/
coverage/
dist/
storage/uploads/
*.key
*.pem
```

These are in `.gitignore`. If `git status` shows them as staged, remove them:
```bash
git reset HEAD .env
git reset HEAD storage/uploads/some-file.pdf
```

## Merge strategy

Always merge with `--no-ff` to preserve branch history:

```bash
git checkout develop
git merge --no-ff feature/NS-42-streaming-retry \
  -m "chore(release): merge feature/NS-42-streaming-retry"
```

Never squash-merge without explicit user request — it loses individual commit
context.

## Tags

```bash
git tag v0.3.0                    # create tag on current HEAD
git push origin v0.3.0            # push tag
git tag -l                        # list all tags
git show v0.3.0                   # view tag details
```

Release flow:
1. Merge `develop` into `main` (via PR + human approval).
2. Tag `main` with the new version.
3. Push the tag.

## Useful commands

```bash
# Review what will be in a PR
git log --oneline develop..<branch-name>
git diff develop..<branch-name> --stat

# Undo last commit (keep changes staged)
git reset --soft HEAD~1

# Undo staging a file
git reset HEAD <file>

# View the full diff of a commit
git show <sha>

# Find who changed a line
git log -L <start>,<end>:<file>

# Clean untracked files (dry run first)
git clean -n
git clean -fd   # only after reviewing the dry run
```
