---
name: code-review
description: Review code changes for correctness, security, performance, style, and test coverage. Use when the user asks for a review or PR feedback.
allowed-tools: Bash(git:*), Read, Grep
---

# Code Review Checklist

Review in this order:

1. Correctness and regressions
2. Security risks (auth, data leaks, injections, secrets)
3. Performance issues (N+1 queries, unnecessary rerenders, expensive loops)
4. Style and consistency (ESLint + project conventions)
5. Test coverage and missing test cases

## Feedback Format

- **Critical**: Must fix before merge
- **Suggestion**: Strong improvement recommendation
- **Nit**: Optional polish

Always include concrete file-level references in the feedback.
