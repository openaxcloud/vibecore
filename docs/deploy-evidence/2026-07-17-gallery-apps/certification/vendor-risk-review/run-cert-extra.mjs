/**
 * Supplementary probes: mobile table reachability (the wide table scrolls
 * inside its own card instead of scrolling the page) and a visual check that
 * every remaining column is readable after that scroll.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:44110';
const OUT = path.resolve(import.meta.dirname, process.env.OUT_DIR ?? '.');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

/* Every demo-account button must load its own credentials. */
await page.goto(BASE, { waitUntil: 'networkidle' });
const accountButtons = [];
for (const label of ['Risk analyst', 'Approval manager', 'CISO']) {
  await page.click(`.login__account:has-text("${label}")`);
  accountButtons.push({
    label,
    email: await page.inputValue('input[type="email"]'),
    password: await page.inputValue('input[type="password"]'),
  });
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'analyst@vendorrisk.demo');
await page.fill('input[type="password"]', 'analyst-demo-2026');
await page.click('button[type="submit"]');
await page.waitForSelector('.table tbody tr');

const before = await page.evaluate(() => {
  const wrap = document.querySelector('.table-wrap');
  return { scrollLeft: wrap.scrollLeft, scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth };
});
await page.evaluate(() => {
  const wrap = document.querySelector('.table-wrap');
  wrap.scrollLeft = wrap.scrollWidth;
});
await page.waitForTimeout(250);
const after = await page.evaluate(() => {
  const wrap = document.querySelector('.table-wrap');
  const headers = [...document.querySelectorAll('.table thead th')].map((th) => ({
    label: th.textContent.trim(),
    left: Math.round(th.getBoundingClientRect().left),
    right: Math.round(th.getBoundingClientRect().right),
  }));
  return {
    scrollLeft: Math.round(wrap.scrollLeft),
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    visibleHeaders: headers.filter((h) => h.left >= 0 && h.right <= window.innerWidth).map((h) => h.label),
  };
});
await page.screenshot({ path: path.join(OUT, '41-mobile-390-table-scrolled.png'), fullPage: false });

/* Table rows must also open on keyboard Enter (they carry tabIndex + handler). */
await page.setViewportSize({ width: 1440, height: 950 });
await page.click('.sidebar__nav button:has-text("Portfolio")');
await page.waitForSelector('.table tbody tr');
const firstRowName = (await page.locator('.table tbody tr').first().locator('.table__name').innerText()).trim();
await page.locator('.table tbody tr').first().focus();
await page.keyboard.press('Enter');
await page.waitForSelector('.detail__header h1', { timeout: 10000 });
const keyboardOpened = (await page.locator('.detail__header h1').innerText()).trim();
await page.screenshot({ path: path.join(OUT, '42-keyboard-row-open.png'), fullPage: false });

writeFileSync(
  path.join(OUT, 'results-extra.json'),
  JSON.stringify({ accountButtons, before, after, keyboard: { firstRowName, keyboardOpened }, pageErrors }, null, 2),
);
console.log(JSON.stringify({ accountButtons, before, after, keyboard: { firstRowName, keyboardOpened }, pageErrors }, null, 2));
await browser.close();
