import { chromium } from 'playwright';

const BASE = 'https://hogansmith.preview.gloo.us';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// Login
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', 'admin@hogansmith.com');
await page.fill('input[name="password"]', 'TestAdmin123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 15000 });
console.log('Login OK');

// Test all pages via client-side navigation (clicking sidebar links)
const testPages = [
  '/dashboard', '/queue', '/cases', '/leads', '/calendar', '/messages',
  '/documents', '/reports', '/admin/workflows', '/admin/users',
  '/admin/integrations', '/admin/settings', '/contacts', '/admin/stages',
  '/admin/fields', '/admin/templates'
];

const errors = [];
page.on('pageerror', err => errors.push(err.message));

for (const path of testPages) {
  errors.length = 0;
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    const status = resp?.status();
    const bodyText = await page.textContent('body');
    const has500 = bodyText?.includes("couldn't load") || bodyText?.includes('server error') || false;
    const errSummary = errors.length ? ` | errors: ${errors[0].substring(0, 100)}` : '';
    console.log(`${path}: ${status} ${has500 ? 'BROKEN' : 'OK'}${errSummary}`);
  } catch (e) {
    console.log(`${path}: TIMEOUT - ${e.message.substring(0, 100)}`);
  }
}

// Take screenshots of key pages
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '/Users/ace/hogansmith/playwright-audit/prod_dashboard.png' });

await page.goto(`${BASE}/admin/stages`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '/Users/ace/hogansmith/playwright-audit/prod_stages.png' });

// Check sidebar positioning
const sidebarBox = await page.locator('[data-sidebar="sidebar"]').first().boundingBox().catch(() => null);
const mainBox = await page.locator('main').first().boundingBox().catch(() => null);
console.log(`\nSidebar: x=${sidebarBox?.x} w=${sidebarBox?.width}`);
console.log(`Main: x=${mainBox?.x} w=${mainBox?.width}`);

await browser.close();
