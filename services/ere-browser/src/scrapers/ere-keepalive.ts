import type { Page } from "playwright";
import { classifyPage, humanDelay, type PageType } from "../browser/page-classifier.js";

export interface KeepaliveResult {
  success: boolean;
  sessionActive: boolean;
  pageType: PageType;
  error?: string;
}

export async function performKeepalive(page: Page): Promise<KeepaliveResult> {
  try {
    console.log("Performing session keepalive...");

    // Navigate to ERE home
    await page.goto("https://secure.ssa.gov/apps9/ERE/home.do", { waitUntil: "networkidle" });
    await humanDelay(page);

    let pageType = await classifyPage(page);
    console.log(`Keepalive page classified as: ${pageType}`);

    // Handle timeout warning — click continue to keep session alive
    if (pageType === "ere_timeout_warning") {
      console.log("Timeout warning detected, dismissing...");
      try {
        const continueButton = page.getByRole("button", { name: /continue|ok|yes|i'm still here/i })
          .or(page.locator('button:has-text("Continue")'))
          .or(page.locator('input[value*="Continue"]'));

        await continueButton.click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);

        pageType = await classifyPage(page);
        console.log(`After dismissing timeout: ${pageType}`);
      } catch (error) {
        console.error("Failed to dismiss timeout warning:", error);
        return {
          success: false,
          sessionActive: false,
          pageType,
          error: "Failed to dismiss timeout warning",
        };
      }
    }

    // Check final state
    if (pageType === "ere_home") {
      console.log("Session is active");
      return { success: true, sessionActive: true, pageType };
    }

    if (pageType === "ere_session_expired") {
      console.log("Session has expired");
      return { success: true, sessionActive: false, pageType };
    }

    if (pageType === "login_gov_email" || pageType === "login_gov_password") {
      console.log("Session expired — redirected to login");
      return { success: true, sessionActive: false, pageType };
    }

    if (pageType === "ere_maintenance") {
      return {
        success: false,
        sessionActive: false,
        pageType,
        error: "ERE is in maintenance mode",
      };
    }

    // Any ERE page means we're still authenticated
    if (pageType.startsWith("ere_")) {
      console.log(`Session is active (on ${pageType})`);
      return { success: true, sessionActive: true, pageType };
    }

    return {
      success: true,
      sessionActive: false,
      pageType,
      error: `Unexpected page state: ${pageType}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Keepalive error:", message);
    return {
      success: false,
      sessionActive: false,
      pageType: "unknown",
      error: `Keepalive failed: ${message}`,
    };
  }
}
