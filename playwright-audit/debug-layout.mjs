import { chromium } from 'playwright';

const BASE = 'http://localhost:3007';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', 'admin@hogansmith.com');
await page.fill('input[name="password"]', 'TestAdmin123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForTimeout(1000);

// Debug the flex layout
const result = await page.evaluate(() => {
  // SidebarProvider wrapper
  const wrapper = document.querySelector('.group\\/sidebar-wrapper');
  const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;

  // Sidebar outer (peer)
  const sidebarOuter = document.querySelector('[data-state]');
  const sidebarOuterStyle = sidebarOuter ? getComputedStyle(sidebarOuter) : null;

  // Spacer div (the relative div inside sidebar outer)
  const spacer = sidebarOuter?.querySelector(':scope > div:first-child');
  const spacerStyle = spacer ? getComputedStyle(spacer) : null;

  // Main (SidebarInset)
  const main = document.querySelector('main');
  const mainStyle = main ? getComputedStyle(main) : null;

  return {
    wrapper: {
      display: wrapperStyle?.display,
      flexDirection: wrapperStyle?.flexDirection,
      width: wrapperStyle?.width,
      classes: wrapper?.className?.substring(0, 200),
    },
    sidebarOuter: {
      display: sidebarOuterStyle?.display,
      width: sidebarOuterStyle?.width,
      visibility: sidebarOuterStyle?.visibility,
      dataState: sidebarOuter?.getAttribute('data-state'),
      dataCollapsible: sidebarOuter?.getAttribute('data-collapsible'),
      dataVariant: sidebarOuter?.getAttribute('data-variant'),
      classes: sidebarOuter?.className?.substring(0, 200),
    },
    spacer: {
      display: spacerStyle?.display,
      width: spacerStyle?.width,
      sidebarWidthVar: spacer ? getComputedStyle(spacer).getPropertyValue('--sidebar-width') : null,
      box: spacer?.getBoundingClientRect(),
    },
    main: {
      display: mainStyle?.display,
      width: mainStyle?.width,
      flex: mainStyle?.flex,
      marginLeft: mainStyle?.marginLeft,
      paddingLeft: mainStyle?.paddingLeft,
      box: main?.getBoundingClientRect(),
    },
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
