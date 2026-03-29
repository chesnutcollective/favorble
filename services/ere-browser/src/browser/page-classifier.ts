import type { Page } from "playwright";

export type PageType =
  | "login_gov_email"
  | "login_gov_password"
  | "login_gov_mfa"
  | "ere_home"
  | "ere_efolder"
  | "ere_status_reports"
  | "ere_pickup"
  | "ere_timeout_warning"
  | "ere_session_expired"
  | "ere_maintenance"
  | "ere_access_denied"
  | "unknown";

export async function classifyPage(page: Page): Promise<PageType> {
  const url = page.url();

  // Get page content, but with a safety timeout
  let content = "";
  try {
    content = await page.content();
  } catch {
    console.warn("Failed to get page content for classification, using URL only");
  }

  const contentLower = content.toLowerCase();
  const urlLower = url.toLowerCase();

  // Login.gov pages
  if (urlLower.includes("login.gov") || urlLower.includes("identitysandbox.gov")) {
    if (contentLower.includes("one-time-code") || contentLower.includes("authentication code") || contentLower.includes("authenticator app")) {
      return "login_gov_mfa";
    }
    if (contentLower.includes("password")) {
      return "login_gov_password";
    }
    return "login_gov_email";
  }

  // ERE pages - check URL patterns first (faster)
  if (urlLower.includes("ere/home") || urlLower.includes("erehome")) {
    return "ere_home";
  }
  if (urlLower.includes("efol") || urlLower.includes("efolder")) {
    return "ere_efolder";
  }
  if (urlLower.includes("statusreport") || urlLower.includes("status_report") || urlLower.includes("getstatusreport")) {
    return "ere_status_reports";
  }
  if (urlLower.includes("pickup") || urlLower.includes("pick_up") || urlLower.includes("pickupfiles")) {
    return "ere_pickup";
  }
  if (urlLower.includes("timeout")) {
    return "ere_timeout_warning";
  }

  // Content-based detection (slower but catches edge cases)
  if (contentLower.includes("session has expired") || contentLower.includes("session timed out") || contentLower.includes("your session has ended")) {
    return "ere_session_expired";
  }
  if (contentLower.includes("timeout warning") || contentLower.includes("session is about to expire") || contentLower.includes("are you still there")) {
    return "ere_timeout_warning";
  }
  if (contentLower.includes("maintenance") || contentLower.includes("system is currently unavailable") || contentLower.includes("scheduled maintenance")) {
    return "ere_maintenance";
  }
  if (contentLower.includes("access denied") || contentLower.includes("not authorized") || contentLower.includes("unauthorized")) {
    return "ere_access_denied";
  }

  // Check for ERE-specific content markers as fallback
  if (contentLower.includes("electronic records express") || contentLower.includes("ere home")) {
    return "ere_home";
  }
  if (contentLower.includes("efolder") || contentLower.includes("electronic folder")) {
    return "ere_efolder";
  }
  if (contentLower.includes("status report")) {
    return "ere_status_reports";
  }
  if (contentLower.includes("pick up files") || contentLower.includes("pickup files")) {
    return "ere_pickup";
  }

  return "unknown";
}

/**
 * Human-like delay to avoid bot detection.
 * Waits between 1-3 seconds with random jitter.
 */
export async function humanDelay(page: Page, minMs = 1000, maxMs = 3000): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await page.waitForTimeout(delay);
}
