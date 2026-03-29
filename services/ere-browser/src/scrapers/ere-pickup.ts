import type { Page } from "playwright";
import { classifyPage, humanDelay } from "../browser/page-classifier.js";

export interface PickupFile {
  fileName: string;
  ssnLast4: string;
  status: string;
  dateReady?: string;
  filePath?: string;
}

export interface PickupResult {
  success: boolean;
  files?: PickupFile[];
  downloadedPaths?: string[];
  error?: string;
}

export async function checkPickupFiles(page: Page, ssnLast4?: string): Promise<PickupResult> {
  try {
    console.log("Checking Pick Up Files...");

    // Navigate to ERE home first
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

    // Navigate to Pick Up Files
    console.log("Navigating to Pick Up Files...");
    try {
      const pickupLink = page.getByRole("link", { name: /pick up files|pickup/i })
        .or(page.locator('a[href*="PickUp"]'))
        .or(page.locator('a[href*="pickup"]'));
      await pickupLink.click();
      await page.waitForLoadState("networkidle");
      await humanDelay(page);
    } catch (error) {
      return { success: false, error: `Failed to navigate to Pick Up Files: ${error instanceof Error ? error.message : "unknown"}` };
    }

    // Handle timeout warning
    const afterNav = await classifyPage(page);
    if (afterNav === "ere_timeout_warning") {
      try {
        await page.getByRole("button", { name: /continue|ok|yes/i }).click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);
      } catch {
        return { success: false, error: "Session timeout warning appeared and could not be dismissed" };
      }
    }

    // Extract the list of available files
    console.log("Extracting pickup file list...");
    const allFiles = await extractPickupFiles(page);
    console.log(`Found ${allFiles.length} files in Pick Up Files`);

    // Filter by SSN last 4 if provided
    const files = ssnLast4
      ? allFiles.filter((f) => f.ssnLast4 === ssnLast4)
      : allFiles;

    if (ssnLast4) {
      console.log(`Filtered to ${files.length} files matching SSN ending in ${ssnLast4}`);
    }

    // Download ready files
    const downloadedPaths: string[] = [];
    const readyFiles = files.filter((f) => f.status.toLowerCase().includes("ready") || f.status.toLowerCase().includes("complete"));

    for (const file of readyFiles) {
      try {
        console.log(`Downloading: ${file.fileName}...`);
        const downloadPath = await downloadPickupFile(page, file);
        if (downloadPath) {
          downloadedPaths.push(downloadPath);
          file.filePath = downloadPath;
        }
        await humanDelay(page, 1000, 2000);
      } catch (error) {
        console.error(`Failed to download ${file.fileName}:`, error);
      }
    }

    return {
      success: true,
      files,
      downloadedPaths,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Pickup error:", message);
    return { success: false, error: `Pickup flow failed: ${message}` };
  }
}

async function extractPickupFiles(page: Page): Promise<PickupFile[]> {
  try {
    const files = await page.evaluate(() => {
      const result: Array<{
        fileName: string;
        ssnLast4: string;
        status: string;
        dateReady?: string;
      }> = [];

      const rows = document.querySelectorAll("table tr, .pickup-row, [class*='file-row']");
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 2) {
          const text = row.textContent || "";

          // Try to extract SSN last 4 from the row
          const ssnMatch = text.match(/(\d{4})\s*$/m) || text.match(/\*{3}-\*{2}-(\d{4})/);
          const ssnLast4 = ssnMatch ? ssnMatch[1] : "";

          result.push({
            fileName: cells[0]?.textContent?.trim() || "",
            ssnLast4,
            status: cells[1]?.textContent?.trim() || cells[cells.length - 1]?.textContent?.trim() || "",
            dateReady: cells.length >= 3 ? cells[2]?.textContent?.trim() : undefined,
          });
        }
      }

      return result;
    });

    // Filter out header rows
    return files.filter((f) => f.fileName && !f.fileName.toLowerCase().includes("file name") && !f.fileName.toLowerCase().includes("filename"));
  } catch (error) {
    console.error("Failed to extract pickup files:", error);
    return [];
  }
}

async function downloadPickupFile(page: Page, file: PickupFile): Promise<string | null> {
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });

    // Find the download link/button for this specific file
    const downloadLink = page.getByRole("link", { name: new RegExp(escapeRegex(file.fileName), "i") })
      .or(page.locator(`a:has-text("${file.fileName}")`))
      .or(page.locator(`tr:has-text("${file.fileName}") a`));

    await downloadLink.click();
    await humanDelay(page, 500, 1000);

    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename() || file.fileName;
    const savePath = `/app/data/${suggestedName}`;

    await download.saveAs(savePath);
    console.log(`Downloaded: ${savePath}`);

    return savePath;
  } catch (error) {
    console.error(`Download failed for ${file.fileName}:`, error);
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
