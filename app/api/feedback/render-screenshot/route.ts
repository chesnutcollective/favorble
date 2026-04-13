import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger/server";
import { requireSession } from "@/lib/auth/session";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Hosted Chromium binary URL. @sparticuz/chromium-min keeps the binary out
 * of the function bundle and downloads it on cold start. Pin to a specific
 * version that matches the installed @sparticuz/chromium-min major.
 */
const CHROMIUM_BINARY_URL =
  process.env.CHROMIUM_BINARY_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

/**
 * The version of rrweb-snapshot loaded into the server-side Chromium page
 * to rebuild the client's serialized DOM. Pin to match what's in
 * package.json so client and server agree on the snapshot format.
 */
const RRWEB_SNAPSHOT_CDN =
  "https://cdn.jsdelivr.net/npm/rrweb-snapshot@2.0.0-alpha.4/dist/rrweb-snapshot.min.js";

type RenderRequest = {
  snapshot: unknown;
  viewport: { width: number; height: number };
  dpr?: number;
  userAgent?: string;
  isMobile?: boolean;
  scrollY?: number;
};

/**
 * POST /api/feedback/render-screenshot
 *
 * Renders a serialized rrweb DOM snapshot in real headless Chromium and
 * returns a base64 JPEG of the resulting page at the user's reported
 * viewport. Pixel-perfect by construction.
 *
 * Auth: super-admin only (session-gated).
 */
export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as RenderRequest;
    const { snapshot, viewport, dpr, userAgent, isMobile, scrollY } = body;

    if (!snapshot || !viewport?.width || !viewport?.height) {
      return NextResponse.json(
        { error: "Missing snapshot or viewport" },
        { status: 400 },
      );
    }

    // Clamp viewport — Chromium has practical limits.
    const safeViewport = {
      width: Math.min(Math.max(viewport.width, 320), 4096),
      height: Math.min(Math.max(viewport.height, 320), 8192),
    };
    const safeDpr = Math.min(Math.max(dpr ?? 1, 1), 3);

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(CHROMIUM_BINARY_URL),
      headless: true,
      defaultViewport: {
        width: safeViewport.width,
        height: safeViewport.height,
        deviceScaleFactor: safeDpr,
        isMobile: isMobile ?? false,
      },
    });

    try {
      const page = await browser.newPage();

      if (userAgent) {
        await page.setUserAgent(userAgent);
      }

      // Start with a blank page so we can inject rrweb-snapshot's rebuild
      // script and then materialize the client DOM into it.
      await page.setContent(
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>',
        { waitUntil: "domcontentloaded" },
      );

      await page.addScriptTag({ url: RRWEB_SNAPSHOT_CDN });

      // Rebuild the snapshot into the live page DOM.
      await page.evaluate((snap) => {
        const w = window as unknown as {
          rrwebSnapshot: { rebuild: (n: unknown, opts: { doc: Document }) => void };
        };
        // Clear default body/head content
        document.head.innerHTML = '<meta charset="utf-8" />';
        document.body.innerHTML = "";
        w.rrwebSnapshot.rebuild(snap, { doc: document });
      }, snapshot);

      // Wait for fonts + any deferred render to settle.
      await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      });

      // Restore the user's scroll position so the captured viewport matches
      // what they were looking at.
      if (typeof scrollY === "number" && scrollY > 0) {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      }

      const screenshotBuffer = await page.screenshot({
        type: "jpeg",
        quality: 90,
        fullPage: false,
        encoding: "binary",
      });

      const base64 = Buffer.from(screenshotBuffer).toString("base64");

      const elapsed = Date.now() - start;
      logger.info("Screenshot rendered", {
        elapsedMs: elapsed,
        viewport: safeViewport,
        sizeBytes: base64.length,
      });

      return NextResponse.json({
        base64,
        width: safeViewport.width,
        height: safeViewport.height,
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    logger.error("Screenshot render error", { error: err, elapsedMs: elapsed });
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to render screenshot",
      },
      { status: 500 },
    );
  }
}
