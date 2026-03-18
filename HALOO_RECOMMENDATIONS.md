# HALOO_RECOMMENDATIONS.md

This guide is for people experimenting with building software using AI, even if you are new to coding.

## What Haloo already set up for you

Haloo scaffolded this project with AI helpers so you can describe what you want and let the assistant do most of the technical work.

- `CLAUDE.md` - technical instructions the AI reads automatically
- `.claude/skills/` - task playbooks (tests, commits, PRs, browser checks)
- `.cursor/rules/` - standards to keep changes consistent

You can think of this as pre-installed context for the AI.

## How to use skills (without memorizing anything)

You usually do **not** call skills by name. Just ask naturally:

- "Run the app"
- "Check for errors"
- "Run tests"
- "Commit this"
- "Create a PR"
- "Review these changes"
- "Open the app in the browser and take a screenshot"

The AI matches your request to the right skill automatically.

## Git in plain language

- **Commit**: a save point in your project history
- **Branch**: a safe copy where you make changes
- **Pull Request (PR)**: a request to merge your branch into the main project

Typical flow:
1. Create branch
2. Make changes
3. Commit changes
4. Open PR
5. Review + merge

If you are unsure, ask: "Walk me through branch, commit, and PR for this change."

## Browser testing with AI

Run your app locally with:

```bash
pnpm dev
```

Then ask the AI to:
- open `http://localhost:3000`
- click buttons and fill forms
- verify pages load
- capture screenshots

## Optional AI integrations (MCPs)

MCPs are optional plugins that let AI connect to external tools:

- GitHub MCP: PRs, issues, repo metadata
- Vercel MCP: deployment status and previews
- Supabase MCP: database queries and schema checks
- Context7 MCP: up-to-date docs in context

## Linting and formatting

- **ESLint** catches potential code issues
- **Biome** formats code consistently

You can ask: "Run lint and fix what can be auto-fixed."

## File map

```
CLAUDE.md
HALOO_RECOMMENDATIONS.md
.claude/skills/
.cursor/rules/
app/
db/              # if database was selected
__tests__/
```
