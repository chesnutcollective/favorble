import { Hono } from "hono";
import { browserPool } from "../browser/pool.js";
import { loginToERE, type LoginCredentials } from "../scrapers/ere-login.js";
import { downloadStatusReport } from "../scrapers/ere-status-report.js";
import { navigateEFolder } from "../scrapers/ere-efolder.js";
import { checkPickupFiles } from "../scrapers/ere-pickup.js";
import { performKeepalive } from "../scrapers/ere-keepalive.js";

export const scrapeRoutes = new Hono();

/**
 * POST /api/scrape/login
 * Authenticate to ERE via Login.gov with credentials + TOTP secret.
 */
scrapeRoutes.post("/login", async (c) => {
  try {
    const body = await c.req.json<LoginCredentials & { credentialId: string }>();

    if (!body.email || !body.password || !body.credentialId) {
      return c.json({ success: false, error: "Missing required fields: email, password, credentialId" }, 400);
    }

    const context = await browserPool.getContext(body.credentialId);
    const page = await context.newPage();

    try {
      const result = await loginToERE(page, {
        email: body.email,
        password: body.password,
        totpSecret: body.totpSecret,
      });

      if (result.success) {
        await browserPool.saveSessionState(body.credentialId);
      }

      return c.json(result);
    } finally {
      await page.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Login error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/scrape/status-report
 * Download bulk status report spreadsheet from ERE.
 */
scrapeRoutes.post("/status-report", async (c) => {
  try {
    const body = await c.req.json<{ credentialId: string }>();

    if (!body.credentialId) {
      return c.json({ success: false, error: "Missing required field: credentialId" }, 400);
    }

    const context = await browserPool.getContext(body.credentialId);
    const page = await context.newPage();

    try {
      const result = await downloadStatusReport(page);
      return c.json(result);
    } finally {
      await page.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Status report error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/scrape/efolder
 * Access a specific claimant's eFolder by SSN.
 */
scrapeRoutes.post("/efolder", async (c) => {
  try {
    const body = await c.req.json<{ credentialId: string; ssn: string }>();

    if (!body.credentialId || !body.ssn) {
      return c.json({ success: false, error: "Missing required fields: credentialId, ssn" }, 400);
    }

    const context = await browserPool.getContext(body.credentialId);
    const page = await context.newPage();

    try {
      const result = await navigateEFolder(page, body.ssn);
      return c.json(result);
    } finally {
      await page.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("eFolder error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/scrape/pickup
 * Check "Pick Up Files" for ready downloads.
 */
scrapeRoutes.post("/pickup", async (c) => {
  try {
    const body = await c.req.json<{ credentialId: string; ssnLast4?: string }>();

    if (!body.credentialId) {
      return c.json({ success: false, error: "Missing required field: credentialId" }, 400);
    }

    const context = await browserPool.getContext(body.credentialId);
    const page = await context.newPage();

    try {
      const result = await checkPickupFiles(page, body.ssnLast4);
      return c.json(result);
    } finally {
      await page.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Pickup error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/scrape/keepalive
 * Perform session keepalive navigation.
 */
scrapeRoutes.post("/keepalive", async (c) => {
  try {
    const body = await c.req.json<{ credentialId: string }>();

    if (!body.credentialId) {
      return c.json({ success: false, error: "Missing required field: credentialId" }, 400);
    }

    const context = await browserPool.getContext(body.credentialId);
    const page = await context.newPage();

    try {
      const result = await performKeepalive(page);
      return c.json(result);
    } finally {
      await page.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Keepalive error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});
