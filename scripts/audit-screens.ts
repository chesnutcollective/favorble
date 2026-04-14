/**
 * Visual audit harness — drives Chrome via puppeteer-core across every
 * persona × key route, dumps a screenshot per combo to /tmp/ai-audit/,
 * and writes a manifest.json that describes the shots.
 *
 * Requires an already-running Chrome on the default user profile so the
 * Clerk session is reused. Launch once, keep reusing the profile.
 *
 * Usage:
 *   pnpm tsx scripts/audit-screens.ts                # run the audit
 *   pnpm tsx scripts/audit-screens.ts --login        # open headful so
 *                                                    # you can sign in
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
const LOGIN_MODE = process.argv.includes("--login");

type PersonaId =
  | "admin"
  | "attorney"
  | "case_manager"
  | "filing_agent"
  | "intake_agent"
  | "mail_clerk"
  | "medical_records"
  | "phi_sheet_writer"
  | "reviewer"
  | "fee_collection"
  | "appeals_council"
  | "post_hearing"
  | "pre_hearing_prep";

type RoutePlan = {
  path: string;
  label: string;
  /** Personas this route is relevant to. Default = every persona. */
  personas?: PersonaId[];
};

// A tight but representative audit set — ~5 routes per persona, ~65 shots total.
const ROUTES: RoutePlan[] = [
  { path: "/dashboard", label: "dashboard" },
  { path: "/cases", label: "cases-list" },
  {
    path: "/admin/ai-review",
    label: "ai-review-focus",
    personas: ["admin"],
  },
  {
    path: "/admin/ai-review?mode=table",
    label: "ai-review-table",
    personas: ["admin"],
  },
  {
    path: "/admin/ai-review?mode=canvas",
    label: "ai-review-canvas",
    personas: ["admin"],
  },
  {
    path: "/admin/integrations",
    label: "admin-integrations",
    personas: ["admin"],
  },
  { path: "/changelog", label: "changelog", personas: ["admin"] },
  {
    path: "/filing",
    label: "filing",
    personas: ["admin", "filing_agent"],
  },
  {
    path: "/mail",
    label: "mail",
    personas: ["admin", "mail_clerk"],
  },
  {
    path: "/medical-records",
    label: "medical-records",
    personas: ["admin", "medical_records", "pre_hearing_prep"],
  },
  {
    path: "/phi-writer",
    label: "phi-writer",
    personas: ["admin", "phi_sheet_writer", "pre_hearing_prep"],
  },
  {
    path: "/hearings",
    label: "hearings",
    personas: [
      "admin",
      "attorney",
      "appeals_council",
      "post_hearing",
      "pre_hearing_prep",
    ],
  },
  {
    path: "/billing",
    label: "billing",
    personas: ["admin", "fee_collection"],
  },
  {
    path: "/leads",
    label: "leads",
    personas: ["admin", "intake_agent"],
  },
  { path: "/calendar", label: "calendar" },
  { path: "/tasks", label: "tasks" },
  { path: "/messages", label: "messages" },
  { path: "/team-chat", label: "team-chat" },
];

const PERSONAS: PersonaId[] = [
  "admin",
  "attorney",
  "case_manager",
  "filing_agent",
  "intake_agent",
  "mail_clerk",
  "medical_records",
  "phi_sheet_writer",
  "reviewer",
  "fee_collection",
  "appeals_council",
  "post_hearing",
  "pre_hearing_prep",
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: !LOGIN_MODE,
    userDataDir: USER_DATA_DIR,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const [page] = await browser.pages();

  if (LOGIN_MODE) {
    await page.goto(`${BASE_URL}/login`);
    console.log(
      "\n[login mode] Sign in in the window that just opened.\n" +
        "Once you see the dashboard, close this script (Ctrl-C) and re-run " +
        "without --login to actually capture screenshots.\n",
    );
    // Park until the user kills us.
    await new Promise(() => {});
    return;
  }

  // Quick auth sanity check.
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  const onLogin = page.url().includes("/login");
  if (onLogin) {
    console.error(
      "\nBrowser is on /login — the audit profile isn't signed in yet.\n" +
        "Run once with --login to authenticate, then re-run.\n",
    );
    await browser.close();
    process.exit(1);
  }

  const manifest: Array<{
    persona: PersonaId;
    route: string;
    path: string;
    file: string;
    status: "ok" | "error";
    error?: string;
  }> = [];

  const plan: Array<{ persona: PersonaId; route: RoutePlan }> = [];
  for (const persona of PERSONAS) {
    for (const route of ROUTES) {
      if (route.personas && !route.personas.includes(persona)) continue;
      plan.push({ persona, route });
    }
  }

  console.log(`Capturing ${plan.length} screenshots…\n`);

  for (const { persona, route } of plan) {
    // Set the view-as cookie for admins; for non-admin personas we still
    // set it because the admin login + cookie = super-admin view-as.
    await page.setCookie({
      name: "favorble_view_as_persona",
      value: persona,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    });

    const fullUrl = `${BASE_URL}${route.path}`;
    const filename = `${persona}__${route.label}.png`;
    const outPath = path.join(OUT_DIR, filename);

    try {
      await page.goto(fullUrl, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });
      // Give client-side transitions a beat to settle.
      await delay(400);
      await page.screenshot({ path: outPath, fullPage: false });
      manifest.push({
        persona,
        route: route.label,
        path: route.path,
        file: filename,
        status: "ok",
      });
      console.log(`  [ok]    ${persona.padEnd(20)} → ${route.label}`);
    } catch (err) {
      manifest.push({
        persona,
        route: route.label,
        path: route.path,
        file: filename,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      console.log(
        `  [err]   ${persona.padEnd(20)} → ${route.label}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`\nManifest: ${path.join(OUT_DIR, "manifest.json")}`);
  console.log(`Captured ${manifest.filter((m) => m.status === "ok").length} / ${manifest.length}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
