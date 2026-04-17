import { expect, test } from "@playwright/test";

/**
 * Visual regression coverage for the most-visited surfaces.
 *
 * Each route is screenshotted at the three viewports configured in
 * `playwright.config.ts` (mobile / tablet / desktop) and compared against a
 * committed baseline. Dynamic UI (live tickers, relative timestamps,
 * shimmer/pulse skeletons, decorative backgrounds) is masked so the diff
 * stays focused on real structural / styling drift.
 *
 * To refresh baselines intentionally:
 *     pnpm exec playwright test --update-snapshots
 */

const routes = [
  "/login",
  "/dashboard",
  "/cases",
  "/queue",
  "/admin/integrations",
  "/admin/audit-logs",
  "/portal/welcome",
  "/portal/messages",
  "/intake/hogan-smith",
];

// CSS selectors for regions we explicitly don't want to fail on.
// Keep this list tight — masking too much defeats the point of the harness.
const dynamicRegionSelectors = [
  ".dash-ticker",
  "[data-dynamic='true']",
  "[data-visual-mask='true']",
  "time", // relative timestamps
  "[data-feedback-widget='true']", // feedback FAB position can vary
  "nextjs-portal", // Next.js dev-mode "N / Issues" indicator
];

test.describe("visual regression", () => {
  // Give the dev server some breathing room on cold routes (first compile
  // inside Next.js dev can be slow).
  test.slow();

  test.beforeEach(async ({ context }) => {
    // Force a deterministic sidebar state so the rail width doesn't flicker
    // between runs. The `two-tier-nav` component SSR-seeds from this cookie.
    await context.addCookies([
      {
        name: "ttn-rail-collapsed",
        value: "0",
        url: "http://localhost:3007",
      },
    ]);
  });

  for (const route of routes) {
    test(`visual: ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });

      // Wait for the network to settle so dynamic content (e.g. lists fetched
      // via server actions / RSC streaming) has a chance to paint.
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {
          // Some Next.js dev routes keep long-polling sockets open; fall
          // through to a fixed wait so we still get a stable paint.
        });

      // Ensure React has committed any post-hydration effects (e.g. the
      // sidebar width CSS var that's set inside useEffect) before we snap.
      await page.waitForFunction(
        () => {
          const w = getComputedStyle(document.documentElement).getPropertyValue(
            "--sidebar-w",
          );
          // Either the rail is hidden (intake / auth routes) or a concrete
          // pixel width has been committed by the client-side effect.
          return w === "" || /\d+px/.test(w.trim());
        },
        { timeout: 5_000 },
      ).catch(() => undefined);

      // Small settle pause for streaming RSC content.
      await page.waitForTimeout(500);

      // Stabilise animations: disable transitions so any in-flight animation
      // doesn't flake the snapshot.
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            transition-duration: 0s !important;
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            scroll-behavior: auto !important;
          }
        `,
      });

      const masks = dynamicRegionSelectors.map((selector) =>
        page.locator(selector),
      );

      await expect(page).toHaveScreenshot({
        fullPage: true,
        mask: masks,
        animations: "disabled",
        caret: "hide",
      });
    });
  }
});
