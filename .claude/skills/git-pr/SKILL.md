---
name: git-pr
description: Create pull requests by analyzing commits, drafting summaries, and opening PRs with gh. Use when the user asks to create, open, or submit a PR.
allowed-tools: Bash(git:*), Bash(gh:*), Read, Grep
---

# Pull Request Workflow

## Steps

1. Confirm current branch is not `main` or `master`.
2. Inspect branch status and commit range against base branch.
3. Summarize all commits included in the PR.
4. Push branch with `git push -u origin HEAD` if needed.
5. Create PR using `gh pr create` with:
   - A concise title
   - Summary bullets
   - Test plan checklist

## Commands

```bash
git status
git log --oneline main..HEAD
git diff --stat main...HEAD
git push -u origin HEAD
gh pr create --title "..." --body "..."
```
