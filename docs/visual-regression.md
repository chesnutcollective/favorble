# Visual Regression Harness

Playwright-powered pixel-diff tests that catch unintended UI drift across the app's most-visited surfaces. The suite lives in `tests/visual/` and is configured by `playwright.config.ts` at the repo root.

## What gets covered

Each run screenshots 9 key routes at 3 viewports (iPhone SE / tablet / desktop 1440x900), for a total of 27 snapshots per run. The route list is at the top of `tests/visual/routes.spec.ts`; edit that array to add or remove coverage.

Dynamic regions (live tickers, `<time>` elements with relative timestamps, and anything tagged `data-dynamic="true"` or `data-visual-mask="true"`) are masked out of the diff. Animations are disabled at snapshot time via an injected stylesheet, and Playwright's own `animations: "disabled"` flag.

## Running locally

```bash
# Installs the chromium binary the first time (idempotent).
pnpm exec playwright install chromium

# Run the suite. Starts `pnpm dev` on :3007 in demo mode automatically.
pnpm exec playwright test

# Run a single viewport for faster iteration:
pnpm exec playwright test --project=desktop

# Open the HTML report from the last run:
pnpm exec playwright show-report
```

A failed run leaves `*-actual.png` and `*-diff.png` artifacts in `test-results/` next to the expected baseline so you can eyeball the drift.

## Updating baselines after an intentional UI change

When you've made a deliberate visual change (new component, spacing tweak, color update, etc.), regenerate the snapshots:

```bash
pnpm exec playwright test --update-snapshots
```

Review the updated PNGs under `tests/visual/routes.spec.ts-snapshots/` in your diff before committing. Only commit updates that match the change you intended — if a route you didn't touch also shifted, that's the signal the harness is there to catch.

## Demo mode / auth

The Playwright `webServer` block starts the dev server with `ENABLE_CLERK_AUTH=false`, which `middleware.ts` interprets as "skip Clerk and auto-inject the admin demo user." No credentials, sign-in flow, or impersonation cookie work is needed from the tests — they just `page.goto(route)` and expect to land on the real UI.

If a route ever starts redirecting to `/login` unexpectedly during a run, double-check the env var is still being plumbed through in `playwright.config.ts` -> `webServer.command`.

## CI integration (follow-up)

There is no GitHub Actions workflow committed for this suite yet. A minimal addition would be a job that runs:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm exec playwright install --with-deps chromium
- run: pnpm exec playwright test
- if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

Because baselines are committed to the repo, the job doesn't need any Vercel preview URL gymnastics — it just builds the app locally in the runner and diffs against checked-in PNGs. A visual diff above the configured threshold (`threshold: 0.2`, `maxDiffPixelRatio: 0.01`) fails the job with a non-zero exit code, blocking the PR until the developer either fixes the regression or updates baselines intentionally.
