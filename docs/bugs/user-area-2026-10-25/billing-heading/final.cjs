const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const base = process.env.UI_BASE_URL;
if (!base || new URL(base).hostname !== '127.0.0.1') throw Error('Explicit local URL required');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const receipt = { base, synthetic: true, observations: [] };
  try {
    for (const lang of ['fr', 'en']) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext();
      await context.addCookies([
        { name: 'vc_session', value: 'synthetic-ui-fixture', url: base },
        { name: 'ecode_theme', value: theme, url: base },
      ]);
      await context.addInitScript(() => localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'dismissed', step: 0 })));
      await context.route('**/*', route => new URL(route.request().url()).origin === base && route.request().method() === 'GET' ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(`${base}/billing?lang=${lang}`, { waitUntil: 'domcontentloaded' });
      await page.locator('input[name=budgetCapDollars]').waitFor();
      for (const width of [320, 360, 390, 640, 768, 820, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const geometry = await page.locator('[data-vc-tour-target=page-header]').evaluate(hero => {
          const heading = hero.querySelector('h1');
          const rect = heading.getBoundingClientRect();
          return {
            titleWidth: rect.width, titleHeight: rect.height,
            lines: rect.height / parseFloat(getComputedStyle(heading).lineHeight),
            heroHeight: hero.getBoundingClientRect().height,
            scrollWidth: document.documentElement.scrollWidth,
            links: [...hero.querySelectorAll('a')].map(link => {
              const box = link.getBoundingClientRect();
              return { href: link.getAttribute('href'), left: box.left, right: box.right, height: box.height };
            }),
          };
        });
        expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
        expect(geometry.links.map(link => link.href)).toEqual(['/upgrade', '/payment-method']);
        for (const link of geometry.links) {
          expect(link.left).toBeGreaterThanOrEqual(0);
          expect(link.right).toBeLessThanOrEqual(width + 1);
          expect(link.height).toBeGreaterThanOrEqual(44);
        }
        if (width === 640 && lang === 'fr') expect(geometry.lines).toBeLessThanOrEqual(2.05);
        receipt.observations.push({ lang, theme, width, geometry });
        if (width === 640 && lang === 'fr' && theme === 'light') await page.screenshot({ path: '/tmp/account-next/billing-heading/final-640.png' });
      }
      await context.close();
    }
  } finally {
    fs.writeFileSync('/tmp/account-next/billing-heading/final.json', JSON.stringify(receipt, null, 2));
    await browser.close();
  }
  console.log(receipt.observations.length, 'compiled header observations passed');
})().catch(error => { console.error(error); process.exit(1); });
