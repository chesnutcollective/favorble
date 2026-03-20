import { chromium } from 'playwright';

const BASE = 'http://localhost:3007';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', 'admin@hogansmith.com');
await page.fill('input[name="password"]', 'TestAdmin123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const sidebarOuter = document.querySelector('[data-state]');
  const spacer = sidebarOuter?.querySelector(':scope > div:first-child');

  // Get all CSS rules matching the spacer
  const rules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        const text = rule.cssText || '';
        if (text.includes('sidebar-width') && text.includes('width')) {
          rules.push(text.substring(0, 300));
        }
      }
    } catch (e) {}
  }

  // Check actual classes on spacer
  return {
    spacerClasses: spacer?.className,
    spacerInlineStyle: spacer?.style.cssText,
    matchingRules: rules.slice(0, 20),
    // Also check if the class has been purged
    allClassesWithSidebar: Array.from(document.querySelectorAll('[class*="sidebar-width"]')).map(
      el => ({ tag: el.tagName, classes: el.className.substring(0, 200) })
    ),
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
