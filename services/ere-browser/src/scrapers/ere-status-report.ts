import type { Page } from "playwright";
import { classifyPage, humanDelay } from "../browser/page-classifier.js";

export interface StatusReportResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
}

export async function downloadStatusReport(page: Page): Promise<StatusReportResult> {
  try {
    console.log("Starting status report download...");

    // Verify we're authenticated — navigate to ERE home first
    await page.goto("https://secure.ssa.gov/apps9/ERE/home.do", { waitUntil: "networkidle" });
    await humanDelay(page);

    const pageType = await classifyPage(page);

    if (pageType === "ere_session_expired" || pageType === "login_gov_email" || pageType === "login_gov_password") {
      return { success: false, error: "Session expired — re-authentication required" };
    }
    if (pageType === "ere_maintenance") {
      return { success: false, error: "ERE is in maintenance mode" };
    }
    if (pageType !== "ere_home") {
      return { success: false, error: `Unexpected page state: ${pageType} (URL: ${page.url()})` };
    }

    // Navigate to Status Reports section
    console.log("Navigating to Status Reports...");
    try {
      const statusLink = page.getByRole("link", { name: /status report/i })
        .or(page.locator('a[href*="Status"]'))
        .or(page.locator('a[href*="status"]'));
      await statusLink.click();
      await page.waitForLoadState("networkidle");
      await humanDelay(page);
    } catch (error) {
      return { success: false, error: `Failed to navigate to Status Reports: ${error instanceof Error ? error.message : "unknown"}` };
    }

    const afterNav = await classifyPage(page);
    if (afterNav === "ere_timeout_warning") {
      // Handle timeout warning
      try {
        await page.getByRole("button", { name: /continue|ok|yes/i }).click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);
      } catch {
        return { success: false, error: "Session timeout warning appeared and could not be dismissed" };
      }
    }

    // Click "Download Spreadsheet" and capture the download
    console.log("Initiating spreadsheet download...");
    try {
      const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });

      const downloadButton = page.getByRole("button", { name: /download spreadsheet/i })
        .or(page.getByRole("link", { name: /download spreadsheet/i }))
        .or(page.locator('a[href*="download"]'))
        .or(page.locator('input[value*="Download"]'));

      await downloadButton.click();
      await humanDelay(page, 500, 1000);

      const download = await downloadPromise;
      const suggestedName = download.suggestedFilename();
      const savePath = `/app/data/${suggestedName}`;

      await download.saveAs(savePath);
      console.log(`Status report downloaded: ${savePath}`);

      return {
        success: true,
        filePath: savePath,
        fileName: suggestedName,
      };
    } catch (error) {
      return { success: false, error: `Download failed: ${error instanceof Error ? error.message : "unknown"}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Status report error:", message);
    return { success: false, error: `Status report flow failed: ${message}` };
  }
}
