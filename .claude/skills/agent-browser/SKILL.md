---
name: agent-browser
description: Automate browser interactions for local app testing, form filling, screenshots, and UI verification. Use when the user asks to test flows in a browser.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## Common Commands

```bash
agent-browser open http://localhost:3000
agent-browser snapshot -i
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser wait --load networkidle
agent-browser screenshot ./artifacts/home.png
agent-browser close
```

## Workflow

1. Start app locally (`pnpm dev`) before browser steps.
2. Open app URL in agent-browser.
3. Take an interactive snapshot and use element refs (`@e1`, `@e2`) for actions.
4. Re-snapshot after navigation or major UI updates.
5. Save screenshots when validating UI or reporting issues.

## Useful Requests

- "Open the app and verify the homepage renders."
- "Fill login form and submit."
- "Take screenshots of the onboarding flow."
