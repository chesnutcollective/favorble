import { chromium } from 'playwright';

const BASE = 'http://localhost:3008';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('console', msg => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text().substring(0, 300));
});
page.on('pageerror', err => console.log('PAGE ERROR:', err.message.substring(0, 300)));

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', 'admin@hogansmith.com');
await page.fill('input[name="password"]', 'TestAdmin123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 15000 });
console.log('Logged in to localhost:3008 with prod DB');

const testPages = [
  '/dashboard', '/queue', '/cases', '/leads', '/calendar', '/messages',
  '/documents', '/reports', '/contacts', '/admin/stages', '/admin/users',
  '/admin/settings', '/admin/integrations', '/admin/workflows',
  '/admin/fields', '/admin/templates'
];

for (const path of testPages) {
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    const status = resp?.status();
    const bodyText = await page.textContent('body');
    const has500 = bodyText?.includes("couldn't load") || bodyText?.includes('server error') || status === 500;
    console.log(`${path}: ${status} ${has500 ? 'BROKEN' : 'OK'}`);
  } catch (e) {
    console.log(`${path}: TIMEOUT - ${e.message.substring(0, 100)}`);
  }
}

await browser.close();
