---
name: typecheck
description: Run TypeScript type checking for this project. Use when checking for type errors, validating TypeScript code, or before committing changes.
allowed-tools: Bash(pnpm:*), Read, Grep
---

# TypeScript Type Checking

## Commands

Check current project:
```bash
pnpm typecheck
```

Optional monorepo command (if this project uses workspaces):
```bash
pnpm --filter <workspace-name> typecheck
```

## Instructions

1. Run `pnpm typecheck` first
2. If errors occur, show full error output with file locations
3. Group errors by file for clarity
4. Report total error count at the end

## Common Type Patterns

### Drizzle ORM Types
- Use `typeof schema.tableName.$inferSelect` for select types
- Use `typeof schema.tableName.$inferInsert` for insert types

### Next.js App Router
- Server Components are async by default
- Client Components must have `"use client"` directive

### Workspace Packages
- In monorepos, internal packages may use `@workspace/*` imports
- Path aliases: `@/*` usually maps to the app root
