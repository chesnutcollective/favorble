import type { Page } from "playwright";
import { classifyPage, humanDelay } from "../browser/page-classifier.js";

export interface EFolderDocument {
  name: string;
  type: string;
  date: string;
  exhibitNumber: string;
  downloadUrl?: string;
}

export interface EFolderResult {
  success: boolean;
  documents?: EFolderDocument[];
  claimantName?: string;
  ssn?: string;
  error?: string;
}

export async function navigateEFolder(page: Page, ssn: string): Promise<EFolderResult> {
  try {
    console.log(`Navigating to eFolder for SSN ending in ${ssn.slice(-4)}...`);

    // Navigate to ERE home first to verify authentication
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

    // Navigate to eFolder section
    console.log("Navigating to eFolder search...");
    try {
      const efolderLink = page.getByRole("link", { name: /efolder|electronic folder/i })
        .or(page.locator('a[href*="eFol"]'))
        .or(page.locator('a[href*="efol"]'));
      await efolderLink.click();
      await page.waitForLoadState("networkidle");
      await humanDelay(page);
    } catch (error) {
      return { success: false, error: `Failed to navigate to eFolder: ${error instanceof Error ? error.message : "unknown"}` };
    }

    // Handle agreement/disclaimer page if it appears
    try {
      const agreeButton = page.getByRole("button", { name: /agree|accept|i accept|continue/i });
      if (await agreeButton.isVisible({ timeout: 3000 })) {
        console.log("Accepting eFolder agreement...");
        await agreeButton.click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);
      }
    } catch {
      // No agreement page, continue
    }

    // Enter SSN in search field
    console.log("Entering SSN in search...");
    try {
      // SSN fields can be split into 3 parts or a single field
      const singleInput = page.locator('input[name*="ssn"]').or(page.getByLabel(/social security/i));
      const ssnPart1 = page.locator('input[name*="ssn1"]').or(page.locator('input[name*="ssnArea"]'));

      if (await ssnPart1.isVisible({ timeout: 3000 })) {
        // Split SSN fields (XXX-XX-XXXX)
        const cleanSSN = ssn.replace(/\D/g, "");
        const ssnPart2 = page.locator('input[name*="ssn2"]').or(page.locator('input[name*="ssnGroup"]'));
        const ssnPart3 = page.locator('input[name*="ssn3"]').or(page.locator('input[name*="ssnSerial"]'));

        await ssnPart1.fill(cleanSSN.substring(0, 3));
        await humanDelay(page, 200, 500);
        await ssnPart2.fill(cleanSSN.substring(3, 5));
        await humanDelay(page, 200, 500);
        await ssnPart3.fill(cleanSSN.substring(5, 9));
      } else if (await singleInput.isVisible({ timeout: 3000 })) {
        await singleInput.fill(ssn);
      } else {
        return { success: false, error: "Could not find SSN input field on eFolder page" };
      }

      await humanDelay(page, 500, 1500);

      // Submit the search
      const searchButton = page.getByRole("button", { name: /search|submit|go|find/i });
      await searchButton.click();
      await page.waitForLoadState("networkidle");
      await humanDelay(page);
    } catch (error) {
      return { success: false, error: `Failed to search by SSN: ${error instanceof Error ? error.message : "unknown"}` };
    }

    // Check for timeout warning after search
    const afterSearch = await classifyPage(page);
    if (afterSearch === "ere_timeout_warning") {
      try {
        await page.getByRole("button", { name: /continue|ok|yes/i }).click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);
      } catch {
        return { success: false, error: "Session timeout warning appeared and could not be dismissed" };
      }
    }

    // Click "Show All" to expand all sections
    try {
      const showAllButton = page.getByRole("button", { name: /show all/i })
        .or(page.getByRole("link", { name: /show all/i }))
        .or(page.locator('a:has-text("Show All")'));

      if (await showAllButton.isVisible({ timeout: 5000 })) {
        console.log("Expanding all document sections...");
        await showAllButton.click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);
      }
    } catch {
      console.log("No 'Show All' button found, continuing with current view");
    }

    // Extract claimant name if visible
    let claimantName: string | undefined;
    try {
      const nameEl = page.locator(".claimant-name, [class*=claimant], [id*=claimant]").first();
      if (await nameEl.isVisible({ timeout: 2000 })) {
        claimantName = (await nameEl.textContent())?.trim();
      }
    } catch {
      // Could not extract claimant name
    }

    // Extract document list from the DOM
    console.log("Extracting document list...");
    const documents = await extractDocuments(page);

    console.log(`Found ${documents.length} documents in eFolder`);

    return {
      success: true,
      documents,
      claimantName,
      ssn: `***-**-${ssn.replace(/\D/g, "").slice(-4)}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("eFolder error:", message);
    return { success: false, error: `eFolder flow failed: ${message}` };
  }
}

async function extractDocuments(page: Page): Promise<EFolderDocument[]> {
  try {
    // ERE eFolder typically renders documents in a table
    const documents = await page.evaluate(() => {
      const docs: Array<{
        name: string;
        type: string;
        date: string;
        exhibitNumber: string;
        downloadUrl?: string;
      }> = [];

      // Try table rows first
      const rows = document.querySelectorAll("table tr, .document-row, [class*='doc-row']");
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 3) {
          // Try to find a download link in the row
          const link = row.querySelector("a[href]") as HTMLAnchorElement | null;

          docs.push({
            name: cells[0]?.textContent?.trim() || "",
            type: cells[1]?.textContent?.trim() || "",
            date: cells[2]?.textContent?.trim() || "",
            exhibitNumber: cells[3]?.textContent?.trim() || "",
            downloadUrl: link?.href || undefined,
          });
        }
      }

      return docs;
    });

    // Filter out empty/header rows
    return documents.filter((doc) => doc.name && doc.name.length > 0 && !doc.name.toLowerCase().includes("document name"));
  } catch (error) {
    console.error("Failed to extract documents:", error);
    return [];
  }
}
