# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Git Operations

**ALWAYS ask for explicit user confirmation before running any git commands that modify history or remote state**, including:
- `git commit`
- `git push`
- `git merge`
- `git rebase`
- `git reset`

## Commands

### Development
- `pnpm dev` - Start the development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server

### Code Quality
- `pnpm lint` - Run ESLint checks
- `pnpm format` - Run Biome formatter
- `pnpm typecheck` - Run TypeScript type checking

### Testing
- `pnpm test` - Run all tests
- `pnpm test:watch` - Watch mode
- `pnpm test:coverage` - Coverage report

### Database
- `pnpm db:generate` - Generate migrations from schema
- `pnpm db:migrate` - Apply migrations
- `pnpm db:push` - Push schema to database
- `pnpm db:studio` - Open Drizzle Studio

## Architecture

### Project Overview
hogansmith is a standalone Next.js application.

### Standalone Structure
```
hogansmith/
├── app/                         # Pages, layouts, route handlers
├── components/                  # UI components and providers
├── lib/                         # Shared utilities, logging, analytics
├── db/                          # Drizzle schema and clients (if DB enabled)
├── __tests__/                   # Vitest test suites and helpers
├── .claude/                     # Claude Code settings and skills
├── .cursor/                     # Cursor settings and rules
└── HALOO_RECOMMENDATIONS.md     # Human-friendly AI usage guide
```

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **UI**: React 19, shadcn/ui, Tailwind CSS v4
- **Database**: PostgreSQL (Railway), Drizzle ORM
- **Auth**: Clerk
- **Testing**: Vitest
- **Linting**: ESLint
- **Formatting**: Biome
- **Analytics**: PostHog (optional)

## Key Conventions

- **Path aliases**: Use `@/*` for project-root imports.
- **Logging**: Use `@/lib/logger/server` or `@/lib/logger/client` instead of `console.log`.
- **Services Layer**: Keep database access in service modules instead of route handlers or UI components.
- **Formatting**: Use Biome formatting; do not mix with Prettier.

## Deployment

### Environments
| Environment | URL | Git Branch | Database |
|---|---|---|---|
| **Production** | https://favorble.vercel.app | `main` | Railway production (`mainline.proxy.rlwy.net:43373`) |
| **Staging** | https://staging-favorble.vercel.app | `staging` | Railway staging (`switchback.proxy.rlwy.net:19378`) |

- **Vercel** hosts the Next.js frontend (team: `chestnutcollective`)
- **Railway** hosts PostgreSQL (with pgvector), Redis, and background services
- **Clerk** handles authentication
- Push to `main` → auto-deploys to production
- Push to `staging` → auto-deploys to staging
- Push to any other branch → preview deploy using staging database

### Infrastructure
- **Railway project**: `favorble` (account: `systems@chesnutcollective.com`)
- **GitHub repo**: `chesnutcollective/favorble`
- **Vercel team**: `chestnutcollective`

## Environment Variables

Required (stored in `.env.local`):
- `DATABASE_URL` - Railway PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- `CLERK_SECRET_KEY` - Clerk secret key
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` - Sign-in route (`/login`)
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` - Post-login redirect (`/dashboard`)
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog analytics (optional)

## Pull Request Workflow

Recommended flow:
1. Create a feature branch before making changes.
2. Use commits as small, meaningful save points.
3. Open a PR with a clear summary and test plan.

Commit prefixes:
- `feat:` New feature
- `fix:` Bug fix
- `chore:` Maintenance/refactor
- `docs:` Documentation update

## Recommended AI Setup

See `HALOO_RECOMMENDATIONS.md` for a plain-language guide on:
- How skills work
- How to ask the AI for common tasks
- Git and PR basics
- Browser testing workflow
- Optional MCP integrations
