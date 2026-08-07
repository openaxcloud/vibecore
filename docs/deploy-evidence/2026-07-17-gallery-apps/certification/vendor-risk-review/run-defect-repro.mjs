/**
 * Reproduces, on the PRE-FIX sources, the two display defects that this
 * certification found and fixed:
 *   D1 — score breakdown: "NN% weight" and the dimension value overlap.
 *   D2 — mobile 390px: the whole page scrolls sideways instead of the table.
 * Screenshots land as 00-BEFORE-*.png next to the post-fix evidence.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:44110';
const OUT = path.resolve(import.meta.dirname);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'analyst@vendorrisk.demo');
await page.fill('input[type="password"]', 'analyst-demo-2026');
await page.click('button[type="submit"]');
await page.waitForSelector('.table tbody tr');
await page.click('.table tbody tr:has-text("Northwind Payments")');
await page.waitForSelector('.breakdown');

const collisions = await page.evaluate(() =>
  [...document.querySelectorAll('.breakdown__row')].map((row) => {
    const w = row.querySelector('.breakdown__weight').getBoundingClientRect();
    const v = row.querySelector('.breakdown__value').getBoundingClientRect();
    const ox = Math.min(w.right, v.right) - Math.max(w.left, v.left);
    const oy = Math.min(w.bottom, v.bottom) - Math.max(w.top, v.top);
    return {
      weight: row.querySelector('.breakdown__weight').textContent,
      value: row.querySelector('.breakdown__value').textContent,
      overlap: ox > 1 && oy > 1 ? `${Math.round(ox)}x${Math.round(oy)}px` : null,
    };
  }),
);
const box = await page.locator('.breakdown').boundingBox();
await page.screenshot({
  path: path.join(OUT, '00-BEFORE-breakdown-collision.png'),
  clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
});

await page.setViewportSize({ width: 390, height: 844 });
await page.click('.sidebar__nav button:has-text("Portfolio")');
await page.waitForSelector('.table tbody tr');
const overflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));
await page.screenshot({ path: path.join(OUT, '00-BEFORE-mobile-390-overflow.png'), fullPage: false });

writeFileSync(path.join(OUT, 'results-before-fix.json'), JSON.stringify({ collisions, overflow }, null, 2));
console.log(JSON.stringify({ collisions, overflow }, null, 2));
await browser.close();
