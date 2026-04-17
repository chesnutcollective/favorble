import { defineConfig } from "@playwright/test";

/**
 * Playwright config for visual regression tests.
 *
 * Runs the suite under `tests/visual/` against a locally running dev server
 * in demo mode (ENABLE_CLERK_AUTH=false), so Clerk auth is bypassed and an
 * admin demo user is auto-injected via `middleware.ts` + `lib/session.ts`.
 *
 * Each route is screenshotted at three viewports (mobile/tablet/desktop) and
 * compared to a committed baseline under `tests/visual/<spec>.ts-snapshots/`.
 */
export default defineConfig({
  testDir: "./tests/visual",
  // Generous per-test timeout because Next.js dev's first compile of a given
  // route can take 10-30s on cold caches.
  timeout: 120_000,
  expect: {
    toHaveScreenshot: {
      // `threshold` = per-pixel color tolerance (0..1). `maxDiffPixelRatio` =
      // allowed fraction of pixels that can differ before the test fails.
      // 0.025 is empirically tight enough to catch real layout/style drift
      // while absorbing minor counter churn (e.g. audit-log stat cards) and
      // anti-aliasing differences.
      threshold: 0.2,
      maxDiffPixelRatio: 0.025,
    },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3007",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      // iPhone SE viewport on chromium (keeps the harness chromium-only so we
      // don't have to bundle webkit / firefox in CI).
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "tablet",
      use: {
        browserName: "chromium",
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: "PORT=3007 ENABLE_CLERK_AUTH=false pnpm dev",
    // Use a TCP port check (not url) so Playwright reuses an already-running
    // dev server even if the first HTTP response is slow to return (Next.js
    // dev sometimes takes 30s+ for the first compile of a cold route).
    port: 3007,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
