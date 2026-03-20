import { chromium } from 'playwright';

const BASE = 'http://localhost:3007';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// Login
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', 'admin@hogansmith.com');
await page.fill('input[name="password"]', 'TestAdmin123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 10000 });
console.log('Login OK');

// Take screenshots of a few pages
const pages = ['/dashboard', '/admin/stages', '/cases', '/calendar'];
for (const path of pages) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);
  const name = path.replace(/\//g, '_');
  await page.screenshot({ path: `/Users/ace/hogansmith/playwright-audit/sidebar${name}.png` });

  // Measure sidebar and content positioning
  const sidebarBox = await page.locator('[data-sidebar="sidebar"]').first().boundingBox().catch(() => null);
  const mainBox = await page.locator('main').first().boundingBox().catch(() => null);
  console.log(`${path}: sidebar=${JSON.stringify(sidebarBox ? {x: sidebarBox.x, w: sidebarBox.width} : null)} main=${JSON.stringify(mainBox ? {x: mainBox.x, w: mainBox.width} : null)}`);
}

await browser.close();
