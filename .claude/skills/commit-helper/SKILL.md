---
name: commit-helper
description: Draft conventional commit messages from staged changes and guide safe commits. Use when the user asks to commit changes or write a commit message.
allowed-tools: Bash(git:*), Read, Grep
---

# Commit Helper

## Workflow

1. Inspect staged changes:
   - `git status`
   - `git diff --cached`
2. Draft a conventional commit message.
3. Confirm with the user before committing.
4. Commit using the approved message.

## Commit Prefixes

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance/refactor
- `docs:` documentation update

Prefer short, specific commit messages that explain why the change exists.
