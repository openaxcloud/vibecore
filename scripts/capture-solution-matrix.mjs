import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

const BASE = process.env.MATRIX_BASE_URL ?? 'http://127.0.0.1:5187';
const SLUG = process.env.MATRIX_SLUG ?? 'app-builder';
const OUT = resolve(process.cwd(), process.env.MATRIX_OUT ?? `scratch-matrix/${SLUG}`);
const WIDTHS = [390, 768, 1024, 1440];
const THEMES = ['light', 'dark'];
const LANGS = (process.env.MATRIX_LANGS ?? 'en,fr').split(',');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const lang of LANGS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: theme,
      });
      await context.addCookies([
        { name: 'ecode_theme', value: theme, url: BASE },
      ]);
      const page = await context.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));

      const url = `${BASE}/solutions/${SLUG}?lang=${lang}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      // Force theme deterministically
      await page.evaluate((t) => {
        const r = document.documentElement;
        r.setAttribute('data-theme', t);
        r.classList.toggle('dark', t === 'dark');
        r.classList.toggle('light', t === 'light');
        r.style.colorScheme = t;
      }, theme);
      // Trigger lazy images: scroll to bottom then back
      await page.evaluate(async () => {
        await new Promise((res) => {
          let y = 0;
          const step = () => {
            window.scrollTo(0, y);
            y += 600;
            if (y < document.body.scrollHeight) setTimeout(step, 40);
            else { window.scrollTo(0, 0); setTimeout(res, 300); }
          };
          step();
        });
      });
      await page.waitForLoadState('networkidle').catch(() => {});
      // Detect horizontal overflow (responsive failure)
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return { scrollW: de.scrollWidth, clientW: de.clientWidth, over: de.scrollWidth - de.clientWidth };
      });
      const file = resolve(OUT, `${lang}-${theme}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      results.push({ lang, theme, width, overflowPx: overflow.over, errors: errors.length, file: `${lang}-${theme}-${width}.png` });
      await context.close();
    }
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.overflowPx > 1 || r.errors > 0);
console.log(bad.length ? `\nISSUES: ${bad.length}` : '\nNO OVERFLOW / NO CONSOLE ERRORS across matrix');
