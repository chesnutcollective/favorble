import { chromium } from 'playwright';

const BASE = 'http://localhost:3007';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGE_ERROR: ' + err.message));

// Login
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', 'admin@hogansmith.com');
await page.fill('input[name="password"]', 'TestAdmin123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 10000 });
console.log('Login OK');

// Test each page with page.goto (full server-side render)
const testPages = [
  '/dashboard', '/queue', '/cases', '/leads', '/calendar', '/messages',
  '/documents', '/reports', '/admin/workflows', '/admin/users',
  '/admin/integrations', '/admin/settings', '/contacts', '/admin/stages',
  '/admin/fields', '/admin/templates'
];

for (const path of testPages) {
  errors.length = 0;
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    const status = resp?.status();
    const bodyText = await page.textContent('body');
    const has500 = bodyText?.includes("couldn't load") || bodyText?.includes('server error') || false;
    const errSummary = errors.length ? ` | console: ${errors.slice(0,2).join('; ')}` : '';
    console.log(`${path}: ${status} ${has500 ? 'BROKEN' : 'OK'}${errSummary}`);
    if (has500) {
      // Take screenshot
      await page.screenshot({ path: `/Users/ace/hogansmith/playwright-audit/local_${path.replace(/\//g, '_')}.png` });
    }
  } catch (e) {
    console.log(`${path}: ERROR - ${e.message}`);
  }
}

await browser.close();
