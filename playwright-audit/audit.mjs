import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const SCREENSHOTS_DIR = '/Users/ace/hogansmith/playwright-audit/screenshots';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const BASE_URL = 'https://hogansmith.vercel.app';
const LOGIN_EMAIL = 'admin@hogansmith.com';
const LOGIN_PASSWORD = 'TestAdmin123';

const results = [];

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // Collect console errors per page
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Track failed network requests
  const networkErrors = [];
  page.on('response', (response) => {
    if (response.status() >= 400) {
      networkErrors.push({ url: response.url(), status: response.status() });
    }
  });

  // ===== Step 1: Login =====
  console.log('Navigating to login page...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: join(SCREENSHOTS_DIR, '00_login_page.png'), fullPage: true });
  console.log('Login page loaded. Filling credentials...');

  // Fill login form
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', LOGIN_EMAIL);
  await page.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', LOGIN_PASSWORD);

  // Click submit
  await page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")');

  // Wait for navigation after login
  await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {
    console.log('Did not reach /dashboard, current URL:', page.url());
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000); // extra settle time

  console.log('After login, current URL:', page.url());
  await page.screenshot({ path: join(SCREENSHOTS_DIR, '01_after_login_dashboard.png'), fullPage: true });

  // ===== Step 2: Discover all sidebar nav links =====
  console.log('\nDiscovering sidebar navigation links...');

  // Try multiple selectors for sidebar nav
  const sidebarSelectors = [
    'nav a',
    'aside a',
    '[class*="sidebar" i] a',
    '[class*="side-bar" i] a',
    '[class*="nav" i] a',
    '[role="navigation"] a',
  ];

  let navLinks = [];
  for (const selector of sidebarSelectors) {
    const links = await page.$$eval(selector, (els) =>
      els.map((el) => ({
        href: el.href,
        text: (el.textContent || '').trim(),
        ariaLabel: el.getAttribute('aria-label') || '',
      }))
    ).catch(() => []);
    if (links.length > 0) {
      console.log(`  Found ${links.length} links with selector: ${selector}`);
      navLinks.push(...links);
    }
  }

  // Deduplicate by href
  const seen = new Set();
  navLinks = navLinks.filter((link) => {
    if (!link.href || seen.has(link.href)) return false;
    // Filter out external links, anchors, javascript:void, etc
    if (!link.href.startsWith(BASE_URL)) return false;
    seen.add(link.href);
    return true;
  });

  console.log(`\nFound ${navLinks.length} unique internal nav links:`);
  navLinks.forEach((l, i) => console.log(`  ${i + 1}. [${l.text}] -> ${l.href}`));

  // ===== Step 3: Visit each link and audit =====
  for (let i = 0; i < navLinks.length; i++) {
    const link = navLinks[i];
    const pathname = new URL(link.href).pathname;
    const label = link.text || link.ariaLabel || pathname;
    const filename = sanitizeFilename(pathname || label);

    console.log(`\n--- [${i + 1}/${navLinks.length}] Visiting: ${label} (${link.href}) ---`);

    // Clear error trackers for this page
    consoleErrors.length = 0;
    networkErrors.length = 0;

    const pageResult = {
      index: i + 1,
      label,
      url: link.href,
      pathname,
      consoleErrors: [],
      networkErrors: [],
      visibleErrors: [],
      screenshotFile: '',
      layoutIssues: [],
    };

    try {
      await page.goto(link.href, { waitUntil: 'networkidle', timeout: 20000 });
    } catch (navErr) {
      console.log(`  Navigation error: ${navErr.message}`);
      pageResult.visibleErrors.push(`Navigation error: ${navErr.message}`);
    }

    // Extra wait for client-side rendering
    await page.waitForTimeout(2000);

    // Screenshot
    const screenshotName = `${String(i + 2).padStart(2, '0')}_${filename}.png`;
    const screenshotPath = join(SCREENSHOTS_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    pageResult.screenshotFile = screenshotName;
    console.log(`  Screenshot: ${screenshotName}`);

    // Collect console errors
    pageResult.consoleErrors = [...consoleErrors];
    if (consoleErrors.length > 0) {
      console.log(`  Console errors: ${consoleErrors.length}`);
      consoleErrors.forEach((e) => console.log(`    - ${e.substring(0, 200)}`));
    }

    // Collect network errors
    pageResult.networkErrors = networkErrors
      .filter(e => !e.url.includes('_next/static') && !e.url.includes('favicon'))
      .map(e => `${e.status} ${e.url}`);
    if (pageResult.networkErrors.length > 0) {
      console.log(`  Network errors: ${pageResult.networkErrors.length}`);
      pageResult.networkErrors.forEach((e) => console.log(`    - ${e}`));
    }

    // Check for visible error text on page
    const errorTexts = await page.evaluate(() => {
      const body = document.body?.innerText || '';
      const errors = [];
      const patterns = [
        /something went wrong/i,
        /internal server error/i,
        /500\s*(error|internal)/i,
        /404\s*(not found|error)/i,
        /unhandled/i,
        /application error/i,
        /error occurred/i,
        /failed to (load|fetch|connect)/i,
        /unexpected error/i,
      ];
      for (const p of patterns) {
        const match = body.match(p);
        if (match) {
          errors.push(match[0]);
        }
      }
      return errors;
    });
    pageResult.visibleErrors.push(...errorTexts);
    if (errorTexts.length > 0) {
      console.log(`  Visible errors on page: ${errorTexts.join(', ')}`);
    }

    // Check for layout overlap issues (sidebar overlapping main content)
    const layoutCheck = await page.evaluate(() => {
      const issues = [];

      // Find sidebar-like element
      const sidebar = document.querySelector('aside, [class*="sidebar" i], nav[class*="side" i]');
      // Find main content area
      const main = document.querySelector('main, [class*="main-content" i], [class*="content" i], [role="main"]');

      if (sidebar && main) {
        const sidebarRect = sidebar.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();

        // Check if they overlap horizontally
        if (sidebarRect.right > mainRect.left && sidebarRect.left < mainRect.left) {
          issues.push(
            `Sidebar overlaps main content: sidebar right edge (${Math.round(sidebarRect.right)}px) > main left edge (${Math.round(mainRect.left)}px). Overlap: ${Math.round(sidebarRect.right - mainRect.left)}px`
          );
        }

        // Check if main content starts at x=0 (sidebar not pushing it over)
        if (mainRect.left < 10) {
          issues.push(
            `Main content starts at x=${Math.round(mainRect.left)}px — sidebar may be overlaying rather than pushing content`
          );
        }

        issues.push(
          `[INFO] Sidebar: left=${Math.round(sidebarRect.left)}, right=${Math.round(sidebarRect.right)}, width=${Math.round(sidebarRect.width)}. Main: left=${Math.round(mainRect.left)}, right=${Math.round(mainRect.right)}, width=${Math.round(mainRect.width)}`
        );
      } else {
        issues.push(`[INFO] sidebar found: ${!!sidebar}, main found: ${!!main}`);
      }

      return issues;
    });
    pageResult.layoutIssues = layoutCheck;
    layoutCheck.forEach((issue) => {
      if (!issue.startsWith('[INFO]')) {
        console.log(`  LAYOUT ISSUE: ${issue}`);
      } else {
        console.log(`  ${issue}`);
      }
    });

    results.push(pageResult);
  }

  await browser.close();

  // ===== Summary =====
  console.log('\n\n' + '='.repeat(80));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total pages audited: ${results.length}`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);

  const pagesWithErrors = results.filter(
    (r) => r.consoleErrors.length > 0 || r.networkErrors.length > 0 || r.visibleErrors.length > 0
  );
  const pagesWithLayoutIssues = results.filter(
    (r) => r.layoutIssues.some((issue) => !issue.startsWith('[INFO]'))
  );

  console.log(`\nPages with errors: ${pagesWithErrors.length}`);
  if (pagesWithErrors.length > 0) {
    pagesWithErrors.forEach((r) => {
      console.log(`\n  ${r.index}. ${r.label} (${r.pathname})`);
      if (r.consoleErrors.length > 0) {
        console.log(`     Console errors (${r.consoleErrors.length}):`);
        r.consoleErrors.forEach((e) => console.log(`       - ${e.substring(0, 150)}`));
      }
      if (r.networkErrors.length > 0) {
        console.log(`     Network errors (${r.networkErrors.length}):`);
        r.networkErrors.forEach((e) => console.log(`       - ${e}`));
      }
      if (r.visibleErrors.length > 0) {
        console.log(`     Visible errors: ${r.visibleErrors.join(', ')}`);
      }
    });
  }

  console.log(`\nPages with layout issues (sidebar overlap): ${pagesWithLayoutIssues.length}`);
  if (pagesWithLayoutIssues.length > 0) {
    pagesWithLayoutIssues.forEach((r) => {
      console.log(`  ${r.index}. ${r.label} (${r.pathname})`);
      r.layoutIssues
        .filter((issue) => !issue.startsWith('[INFO]'))
        .forEach((issue) => console.log(`     - ${issue}`));
    });
  }

  // Also list all layout info
  console.log('\nLayout info for all pages:');
  results.forEach((r) => {
    const info = r.layoutIssues.find((i) => i.startsWith('[INFO]'));
    if (info) {
      console.log(`  ${r.index}. ${r.label}: ${info}`);
    }
  });

  console.log('\nAll pages visited:');
  results.forEach((r) => {
    const hasErrors = r.consoleErrors.length > 0 || r.networkErrors.length > 0 || r.visibleErrors.length > 0;
    const hasLayout = r.layoutIssues.some((i) => !i.startsWith('[INFO]'));
    const status = hasErrors ? 'ERRORS' : 'OK';
    const layout = hasLayout ? ' | LAYOUT ISSUE' : '';
    console.log(`  ${status}${layout} - ${r.label} (${r.pathname}) -> ${r.screenshotFile}`);
  });

  // Save JSON report
  const reportPath = join(SCREENSHOTS_DIR, 'audit_report.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nFull report saved to: ${reportPath}`);
})();
