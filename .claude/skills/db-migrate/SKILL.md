---
name: db-migrate
description: Handle Drizzle ORM migrations - generate, apply, and resolve merge conflicts. Use when schema changes, migrations fail, or conflicts occur during git merge.
allowed-tools: Bash(pnpm:*), Bash(git:*), Read, Grep
---

# Drizzle Migration Management

## Commands

Generate migration from schema changes:
```bash
pnpm db:generate
```

Apply migrations:
```bash
pnpm db:migrate
```

Open Drizzle Studio:
```bash
pnpm db:studio
```

## Key Files

- `db/schema.ts` - Database schema definitions
- `db/index.ts` - Database client
- `drizzle.config.ts` - Drizzle configuration
- `drizzle/` - Generated migration files

## Workflow

1. Modify schema in `db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review generated SQL in `drizzle/`
4. Apply migration: `pnpm db:migrate`
5. Commit migration files

## Merge Conflict Resolution

When migrations conflict during git merge:

1. **Identify conflicts**: Check for conflicting files in `drizzle/`
2. **Keep both migrations**: Don't merge migration content - keep as separate files
3. **Fix timestamps**: Ensure migration filenames have unique timestamps
4. **Regenerate metadata**: Run `pnpm db:generate` to update snapshot
5. **Test locally**: Apply migrations to dev database before committing

## Rollback Guidance

- Prefer creating a forward-fix migration instead of editing an already-applied migration.
- If a migration fails locally, fix schema and regenerate a new migration.
- Never delete committed migration files that may already exist in shared environments.
