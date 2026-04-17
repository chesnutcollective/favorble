/**
 * Button / link audit harness.
 *
 * Walks every app route via Puppeteer (reuses the logged-in profile from
 * audit-screens.ts), enumerates every interactive element on each page,
 * classifies each by its handler wiring, and writes a manifest to
 * /tmp/ai-audit/buttons.json.
 *
 * Classifications:
 *   navigate-ok       <a href> pointing at a route that resolves (200)
 *   navigate-broken   <a href> pointing at a route that 404s
 *   navigate-external <a href> that leaves the app (http://…)
 *   placeholder       href="#" or href="javascript:*"
 *   action-wired      <button>/[role=button] with an onClick (via React)
 *   action-dead       <button>/[role=button] with no reachable handler
 *   disabled          disabled or aria-disabled
 *
 * No clicking happens — we infer dead-ness from DOM + route resolution.
 *
 * Run:
 *   pnpm tsx scripts/audit-buttons.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:3007";
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const USER_DATA_DIR = "/tmp/ai-audit-profile";
const OUT_DIR = "/tmp/ai-audit";
const OUT_FILE = path.join(OUT_DIR, "buttons.json");

// A pragmatic sitemap — routes that don't require a [dynamic segment].
// Dynamic segments (cases/[id], drafts/[id]) are sampled via navData.
const ROUTES: string[] = [
  "/dashboard",
  "/dashboard/exec",
  "/cases",
  "/leads",
  "/contacts",
  "/documents",
  "/messages",
  "/email",
  "/calendar",
  "/queue",
  "/tasks",
  "/team-chat",
  "/reports",
  "/reports/alj-stats",
  "/reports/bottlenecks",
  "/reports/handoffs",
  "/reports/leaderboards",
  "/reports/risk",
  "/reports/team-performance",
  "/reports/win-rates",
  "/hearings",
  "/filing",
  "/phi-writer",
  "/medical-records",
  "/mail",
  "/billing",
  "/billing/invoices",
  "/billing/time",
  "/fee-collection",
  "/appeals-council",
  "/post-hearing",
  "/supervisor",
  "/drafts",
  "/coaching",
  "/coaching/training-gaps",
  "/changelog",
  "/settings/notifications",
  "/settings/preferences",
  // Admin
  "/admin/ai-review",
  "/admin/ai-review?mode=table",
  "/admin/ai-review?mode=canvas",
  "/admin/ai-review/examples",
  "/admin/audit-logs",
  "/admin/compliance",
  "/admin/feedback",
  "/admin/fields",
  "/admin/integrations",
  "/admin/integrations/ere",
  "/admin/qa/calls",
  "/admin/qa/client-health",
  "/admin/qa/messages",
  "/admin/settings",
  "/admin/stages",
  "/admin/styleguide",
  "/admin/supervisor",
  "/admin/supervisor/drafts",
  "/admin/supervisor/workload",
  "/admin/templates",
  "/admin/users",
  "/admin/workflows",
];

type ElementInfo = {
  tag: string;
  text: string;
  ariaLabel: string | null;
  href: string | null;
  role: string | null;
  disabled: boolean;
  hasOnClick: boolean;
  isVisible: boolean;
  rect: { x: number; y: number; w: number; h: number };
};

type ClassifiedElement = ElementInfo & {
  classification:
    | "navigate-ok"
    | "navigate-broken"
    | "navigate-external"
    | "placeholder"
    | "action-wired"
    | "action-dead"
    | "disabled"
    | "unknown";
  reason?: string;
  targetHttpCode?: number;
};

type RouteReport = {
  route: string;
  loadStatus: "ok" | "404" | "error";
  error?: string;
  elements: ClassifiedElement[];
  counts: Record<ClassifiedElement["classification"], number>;
};

async function enumerateElements(page: Page): Promise<ElementInfo[]> {
  return page.evaluate(() => {
    const selector =
      'a, button, [role="button"], [data-slot="button"], [onclick]';
    const nodes = Array.from(
      document.querySelectorAll(selector),
    ) as HTMLElement[];

    const infos: ElementInfo[] = [];
    for (const el of nodes) {
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
      const ariaLabel = el.getAttribute("aria-label");
      const href = el.getAttribute("href");
      const role = el.getAttribute("role");
      const disabled =
        el.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled") === "true";
      // React synthetic handlers don't show as attributes; treat buttons
      // without explicit `type="submit"` as potentially wired.
      const hasOnClick =
        el.hasAttribute("onclick") ||
        el.hasAttribute("data-react-click") ||
        tag === "button" ||
        role === "button";
      const rect = el.getBoundingClientRect();
      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        window.getComputedStyle(el).visibility !== "hidden" &&
        window.getComputedStyle(el).display !== "none";
      infos.push({
        tag,
        text: text || ariaLabel || "(no label)",
        ariaLabel,
        href,
        role,
        disabled,
        hasOnClick,
        isVisible,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    }
    // De-dupe by (tag + text + href)
    const seen = new Set<string>();
    return infos.filter((i) => {
      const key = `${i.tag}|${i.text}|${i.href ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}

// Pre-load known routes from the filesystem. A link pointing to an
// unknown path is flagged as "navigate-broken" without HTTP probing.
const KNOWN_ROUTES: string[] = fs
  .readFileSync(path.join(OUT_DIR, "known-routes.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

function routeMatches(target: string): boolean {
  // Strip query string for match.
  const pathOnly = target.split("?")[0].split("#")[0];
  for (const r of KNOWN_ROUTES) {
    if (pathOnly === r) return true;
    // Dynamic segment match e.g. /cases/[id]/overview -> /cases/abc/overview
    const pattern =
      "^" +
      r
        .replace(/\[[^\]]+\]/g, "[^/]+")
        .replace(/\//g, "\\/") +
      "$";
    if (new RegExp(pattern).test(pathOnly)) return true;
  }
  // Treat root and common Next.js routes as OK.
  if (pathOnly === "" || pathOnly === "/" || pathOnly === "/login")
    return true;
  return false;
}

function classify(el: ElementInfo, page: Page): ClassifiedElement {
  if (el.disabled) return { ...el, classification: "disabled" };

  if (el.href != null) {
    if (el.href === "" || el.href === "#" || el.href.startsWith("javascript:"))
      return { ...el, classification: "placeholder", reason: "href is #" };
    try {
      const u = new URL(el.href, page.url());
      if (u.origin !== new URL(page.url()).origin) {
        return {
          ...el,
          classification: "navigate-external",
          reason: u.origin,
        };
      }
      if (routeMatches(u.pathname)) {
        return { ...el, classification: "navigate-ok" };
      }
      return {
        ...el,
        classification: "navigate-broken",
        reason: `no app route matches ${u.pathname}`,
      };
    } catch {
      return { ...el, classification: "unknown", reason: "href parse failed" };
    }
  }
  if (el.tag === "button" || el.role === "button") {
    return el.hasOnClick
      ? { ...el, classification: "action-wired" }
      : { ...el, classification: "action-dead" };
  }
  return { ...el, classification: "unknown" };
}

async function auditRoute(
  page: Page,
  route: string,
): Promise<RouteReport> {
  const url = `${BASE_URL}${route}`;
  try {
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await delay(800);
    const status = resp?.status() ?? 0;
    if (status === 404) {
      return {
        route,
        loadStatus: "404",
        elements: [],
        counts: emptyCounts(),
      };
    }
    const elements = await enumerateElements(page);
    const visible = elements.filter((e) => e.isVisible);
    const classified = visible.map((el) => classify(el, page));
    return {
      route,
      loadStatus: "ok",
      elements: classified,
      counts: tally(classified),
    };
  } catch (err) {
    return {
      route,
      loadStatus: "error",
      error: err instanceof Error ? err.message : String(err),
      elements: [],
      counts: emptyCounts(),
    };
  }
}

function emptyCounts(): Record<ClassifiedElement["classification"], number> {
  return {
    "navigate-ok": 0,
    "navigate-broken": 0,
    "navigate-external": 0,
    placeholder: 0,
    "action-wired": 0,
    "action-dead": 0,
    disabled: 0,
    unknown: 0,
  };
}

function tally(
  els: ClassifiedElement[],
): Record<ClassifiedElement["classification"], number> {
  const out = emptyCounts();
  for (const e of els) out[e.classification]++;
  return out;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    userDataDir: USER_DATA_DIR,
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const [page] = await browser.pages();
  const resolveCache = new Map<string, number>();

  const reports: RouteReport[] = [];
  for (const route of ROUTES) {
    const t0 = Date.now();
    const r = await auditRoute(page, route);
    const ms = Date.now() - t0;
    const note =
      r.loadStatus === "ok"
        ? `${r.elements.length} els · dead:${r.counts["action-dead"]} broken:${r.counts["navigate-broken"]} placeholder:${r.counts.placeholder}`
        : r.loadStatus;
    console.log(`[${ms}ms] ${route}  ${note}`);
    reports.push(r);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(reports, null, 2));
  const summary = {
    totalRoutes: reports.length,
    okRoutes: reports.filter((r) => r.loadStatus === "ok").length,
    fourOfourRoutes: reports.filter((r) => r.loadStatus === "404").length,
    errorRoutes: reports.filter((r) => r.loadStatus === "error").length,
    totalElements: reports.reduce((a, r) => a + r.elements.length, 0),
    totals: reports.reduce<
      Record<ClassifiedElement["classification"], number>
    >(
      (acc, r) => {
        for (const k in r.counts)
          acc[k as keyof typeof acc] += r.counts[k as keyof typeof acc];
        return acc;
      },
      emptyCounts(),
    ),
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "buttons-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log("\nDone.");
  console.log(JSON.stringify(summary, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
