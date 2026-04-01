# CLAUDE.local.md — Machine-Specific Context (Auto-Generated)
# Source: OpenClaw (~/.openclaw/credentials/projects.json + CLAUDE_GLOBAL.md)
# Last synced: 2026-03-20T20:47:21.253Z
# DO NOT EDIT — changes will be overwritten on next sync.

## Project: hogansmith (Internal)
- **Repo**: TangoGroup/hogansmith
- **tmux session**: hogansmith
- **Dev port**: 3007
- **OpenClaw managed**: yes

### Vercel
- **Account**: Jake's Personal
- **Team scope**: --scope Jake's projects
- **Project**: hogansmith
- **Production URL**: https://hogansmith.preview.gloo.us
- **Staging URL**: https://hogansmith-git-staging.preview.gloo.us

### Supabase
- **Project ref (staging)**: huttgbdikpuizjmuqdqa
- **URL (staging)**: https://huttgbdikpuizjmuqdqa.supabase.co
- **Region (staging)**: us-east-1
- **Database URL (staging)**: postgresql://postgres.huttgbdikpuizjmuqdqa:45fxzYRBYd2fynIC0pyT@aws-1-us-east-1.pooler.supabase.com:5432/postgres
- **Anon key (staging)**: `eyJhbGciOiJIUzI1NiIsInR5cCI6Ik…`
- **Service role key (staging)**: `eyJhbGciOiJIUzI1NiIsInR5cCI6Ik…`
- **Project ref (production)**: cmropikduwespyylpmmh
- **URL (production)**: https://cmropikduwespyylpmmh.supabase.co
- **Region (production)**: us-east-1
- **Database URL (production)**: postgresql://postgres.cmropikduwespyylpmmh:a5wkZKEF1gwX7C58lBvu@aws-1-us-east-1.pooler.supabase.com:5432/postgres
- **Anon key (production)**: `eyJhbGciOiJIUzI1NiIsInR5cCI6Ik…`
- **Service role key (production)**: `eyJhbGciOiJIUzI1NiIsInR5cCI6Ik…`

### Github
- **account**: httpsgithubcomjakekklinvex
- **github_org**: jakekklinvex


---

# Global Claude Code Rules (Managed by OpenClaw)
# This file is the source of truth. Changes sync to each project's CLAUDE.local.md.

## Operator

- **Owner**: Jake (jake.k.klinvex@gmail.com)
- **AI Assistant**: Ace (OpenClaw gateway on Mac Mini)
- **OpenClaw Dashboard**: http://127.0.0.1:18789/__openclaw__/canvas/

## Global Rules

### Git & Deployment Safety
- ALWAYS ask for explicit user confirmation before `git push`, `git merge`, or any destructive git operation
- Never force-push to main/staging branches
- Never commit .env files, credentials, or API keys
- Check `git status` before committing to avoid unintended files

### Code Quality
- Use TypeScript strict mode in all TS/TSX projects
- Prefer existing patterns in the codebase over introducing new ones
- Run lint before committing: fix errors, don't suppress them
- Keep PRs focused — one feature or fix per PR

### Testing
- Run existing tests before pushing changes
- Add tests for new features when a test framework exists
- Playwright E2E tests should pass before merging to main

### Communication
- When tasks complete, report results concisely
- If a task will take more than a few minutes, give a brief status update
- Flag blockers immediately rather than spinning

### Security
- Never log or display API keys, tokens, or passwords
- Use environment variables for all secrets
- Validate user input at system boundaries

## Environment

- Node.js: `/opt/homebrew/opt/node@22/bin/node` (not in default PATH for launchd services)
- Package managers: npm, pnpm (project-dependent), uv (Python)
- Go: 1.24
- Python: 3.14
- OpenClaw gateway: port 18789, browser CDP: port 18800

