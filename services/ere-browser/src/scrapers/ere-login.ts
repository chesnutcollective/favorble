import type { Page } from "playwright";
import { classifyPage, humanDelay, type PageType } from "../browser/page-classifier.js";

const ERE_LOGIN_URL = "https://secure.ssa.gov/acu/iresear/login?URL=/apps9/ERE/home.do";

export interface LoginCredentials {
  email: string;
  password: string;
  totpSecret?: string;
}

export interface LoginResult {
  success: boolean;
  pageType?: PageType;
  error?: string;
}

export async function loginToERE(page: Page, credentials: LoginCredentials): Promise<LoginResult> {
  try {
    console.log("Starting ERE login flow...");

    // Navigate to ERE login — this redirects through Login.gov
    await page.goto(ERE_LOGIN_URL, { waitUntil: "networkidle" });
    await humanDelay(page);

    let pageType = await classifyPage(page);
    console.log(`Initial page classified as: ${pageType}`);

    // Handle unexpected states early
    if (pageType === "ere_maintenance") {
      return { success: false, pageType, error: "ERE is currently in maintenance mode" };
    }
    if (pageType === "ere_access_denied") {
      return { success: false, pageType, error: "Access denied to ERE" };
    }

    // If we're already on ERE home (session restored), we're done
    if (pageType === "ere_home") {
      console.log("Already authenticated — session restored from cookies");
      return { success: true, pageType };
    }

    // Step 1: Email entry
    if (pageType === "login_gov_email") {
      console.log("Entering email address...");
      try {
        await page.getByLabel("Email address").fill(credentials.email);
        await humanDelay(page, 500, 1500);
        await page.getByRole("button", { name: /sign in|submit|continue/i }).click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);
      } catch (error) {
        return { success: false, pageType, error: `Failed at email step: ${error instanceof Error ? error.message : "unknown"}` };
      }

      pageType = await classifyPage(page);
      console.log(`After email, page classified as: ${pageType}`);
    }

    // Step 2: Password entry
    if (pageType === "login_gov_password") {
      console.log("Entering password...");
      try {
        await page.getByLabel("Password").fill(credentials.password);
        await humanDelay(page, 500, 1500);
        await page.getByRole("button", { name: /sign in|submit|continue/i }).click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);
      } catch (error) {
        return { success: false, pageType, error: `Failed at password step: ${error instanceof Error ? error.message : "unknown"}` };
      }

      pageType = await classifyPage(page);
      console.log(`After password, page classified as: ${pageType}`);
    }

    // Step 3: MFA / TOTP
    if (pageType === "login_gov_mfa") {
      if (!credentials.totpSecret) {
        return { success: false, pageType, error: "MFA required but no TOTP secret provided" };
      }

      console.log("Generating and entering TOTP code...");
      try {
        const totpCode = generateTOTP(credentials.totpSecret);

        // Look for the OTP input field
        const otpInput = page.getByLabel(/one-time code|security code|authentication code/i)
          .or(page.locator('input[name="code"]'))
          .or(page.locator('input[type="tel"]'));

        await otpInput.fill(totpCode);
        await humanDelay(page, 500, 1500);

        // Check "Remember this browser" if available
        try {
          const rememberCheckbox = page.getByLabel(/remember/i);
          if (await rememberCheckbox.isVisible({ timeout: 2000 })) {
            await rememberCheckbox.check();
          }
        } catch {
          // Checkbox not present, continue
        }

        await page.getByRole("button", { name: /submit|continue|verify/i }).click();
        await page.waitForLoadState("networkidle");
        await humanDelay(page);
      } catch (error) {
        return { success: false, pageType, error: `Failed at MFA step: ${error instanceof Error ? error.message : "unknown"}` };
      }

      pageType = await classifyPage(page);
      console.log(`After MFA, page classified as: ${pageType}`);
    }

    // Step 4: Verify we landed on ERE home
    if (pageType === "ere_home") {
      console.log("Login successful — landed on ERE home");
      return { success: true, pageType };
    }

    // If we ended up somewhere unexpected, wait a bit and re-check
    // (SSA can be slow with redirects)
    console.log(`Unexpected page after login flow: ${pageType}. Waiting for possible redirect...`);
    try {
      await page.waitForURL(/ERE|ere/i, { timeout: 15_000 });
      pageType = await classifyPage(page);
      if (pageType === "ere_home") {
        console.log("Login successful after redirect wait");
        return { success: true, pageType };
      }
    } catch {
      // Timeout waiting for ERE redirect
    }

    return {
      success: false,
      pageType,
      error: `Login flow completed but ended on unexpected page: ${pageType} (URL: ${page.url()})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Login flow error:", message);
    return { success: false, error: `Login flow failed: ${message}` };
  }
}

/**
 * Generate a TOTP code from a base32 secret.
 * Implements RFC 6238 TOTP with SHA-1, 6 digits, 30-second step.
 */
function generateTOTP(secret: string): string {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30);

  // Decode base32 secret
  const key = base32Decode(secret);

  // HMAC-SHA1
  const crypto = require("node:crypto");
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac("sha1", key);
  hmac.update(timeBuffer);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = code % 1_000_000;
  return otp.toString().padStart(6, "0");
}

/**
 * Decode a base32-encoded string into a Buffer.
 */
function base32Decode(encoded: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = encoded.replace(/[=\s]/g, "").toUpperCase();

  let bits = "";
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) throw new Error(`Invalid base32 character: ${char}`);
    bits += val.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}
