import { chromium, Browser, BrowserContext } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SESSION_DIR = "/app/data/sessions";

class BrowserPool {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();

  async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      console.log("Launching new browser instance...");
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--metrics-recording-only",
          "--no-first-run",
        ],
      });

      this.browser.on("disconnected", () => {
        console.warn("Browser disconnected unexpectedly");
        this.browser = null;
        this.contexts.clear();
      });

      console.log("Browser launched successfully");
    }
    return this.browser;
  }

  async getContext(credentialId: string): Promise<BrowserContext> {
    const existing = this.contexts.get(credentialId);
    if (existing) {
      return existing;
    }

    const browser = await this.getBrowser();

    // Try to load saved session state from disk
    const statePath = path.join(SESSION_DIR, credentialId, "state.json");
    let storageState: string | undefined;

    try {
      await fs.access(statePath);
      storageState = statePath;
      console.log(`Restoring session state for ${credentialId}`);
    } catch {
      // No saved state, start fresh
      console.log(`Creating fresh context for ${credentialId}`);
    }

    const context = await browser.newContext({
      storageState: storageState,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/New_York",
    });

    // Set default navigation timeout
    context.setDefaultNavigationTimeout(60_000);
    context.setDefaultTimeout(30_000);

    this.contexts.set(credentialId, context);

    context.on("close", () => {
      this.contexts.delete(credentialId);
    });

    return context;
  }

  async saveSessionState(credentialId: string): Promise<void> {
    const context = this.contexts.get(credentialId);
    if (!context) {
      console.warn(`No context found for ${credentialId}, cannot save state`);
      return;
    }

    const sessionDir = path.join(SESSION_DIR, credentialId);
    await fs.mkdir(sessionDir, { recursive: true });

    const statePath = path.join(sessionDir, "state.json");
    await context.storageState({ path: statePath });
    console.log(`Session state saved for ${credentialId}`);
  }

  async destroyContext(credentialId: string): Promise<void> {
    const context = this.contexts.get(credentialId);
    if (context) {
      await context.close();
      this.contexts.delete(credentialId);
      console.log(`Context destroyed for ${credentialId}`);
    }
  }

  async closeAll(): Promise<void> {
    console.log("Closing all browser contexts and browser...");

    for (const [id, context] of this.contexts) {
      try {
        await context.close();
        console.log(`Closed context: ${id}`);
      } catch (error) {
        console.error(`Error closing context ${id}:`, error);
      }
    }
    this.contexts.clear();

    if (this.browser) {
      try {
        await this.browser.close();
        console.log("Browser closed");
      } catch (error) {
        console.error("Error closing browser:", error);
      }
      this.browser = null;
    }
  }

  getStats() {
    return {
      browserConnected: this.browser?.isConnected() ?? false,
      activeContexts: this.contexts.size,
      contextIds: Array.from(this.contexts.keys()),
      memoryUsage: process.memoryUsage(),
    };
  }
}

export const browserPool = new BrowserPool();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down browser pool...");
  await browserPool.closeAll();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down browser pool...");
  await browserPool.closeAll();
  process.exit(0);
});
