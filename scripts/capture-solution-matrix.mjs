import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

const BASE = process.env.MATRIX_BASE_URL ?? 'http://127.0.0.1:5187';

/**
 * `MATRIX_SLUGS` (comma separated) captures several solution pages in one run;
 * `MATRIX_SLUG` stays supported for the original single-page invocation.
 */
const SLUGS = (process.env.MATRIX_SLUGS ?? process.env.MATRIX_SLUG ?? 'app-builder')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUT_ROOT = resolve(process.cwd(), process.env.MATRIX_OUT ?? 'scratch-matrix');
const WIDTHS = [390, 768, 1024, 1440];
const THEMES = ['light', 'dark'];
const LANGS = (process.env.MATRIX_LANGS ?? 'en,fr').split(',');

/** Minimum touch target, in CSS px, applied to controls (not inline prose links). */
const MIN_TAP = 44;

const browser = await chromium.launch();
const results = [];

for (const slug of SLUGS) {
  const out = resolve(OUT_ROOT, slug);
  await mkdir(out, { recursive: true });

  for (const lang of LANGS) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          colorScheme: theme,
        });
        await context.addCookies([{ name: 'ecode_theme', value: theme, url: BASE }]);

        const page = await context.newPage();
        const errors = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));

        const url = `${BASE}/solutions/${slug}?lang=${lang}`;
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page
          .waitForSelector('[data-testid="app-builder-page"], [data-testid="solution-page"]', { timeout: 30000 })
          .catch(() => {});

        // SSR language is read BEFORE forcing the theme so we observe what the server sent.
        const ssr = await page.evaluate(() => ({
          htmlLang: document.documentElement.getAttribute('lang'),
          title: document.title,
        }));

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

              if (y < document.body.scrollHeight) {
                setTimeout(step, 40);
              } else {
                window.scrollTo(0, 0);
                setTimeout(res, 300);
              }
            };
            step();
          });
        });
        await page.waitForTimeout(500);

        // Detect horizontal overflow (responsive failure)
        const overflow = await page.evaluate(() => {
          const de = document.documentElement;
          return { scrollW: de.scrollWidth, clientW: de.clientWidth, over: de.scrollWidth - de.clientWidth };
        });

        /*
         * Tap targets: only controls are measured. Inline links inside prose
         * legitimately inherit the line-height of their paragraph, so they are
         * excluded rather than reported as false failures.
         */
        const tap = await page.evaluate((min) => {
          const isProseLink = (el) => {
            if (el.tagName !== 'A') {
              return false;
            }

            const parent = el.parentElement;

            return Boolean(parent && /^(P|LI|SPAN|SMALL|EM|STRONG)$/.test(parent.tagName));
          };

          const nodes = [...document.querySelectorAll('a, button, input, select, textarea, [role="button"]')];
          const small = [];

          for (const el of nodes) {
            const rect = el.getBoundingClientRect();

            if (rect.width === 0 || rect.height === 0) {
              continue;
            }

            const style = getComputedStyle(el);

            if (style.visibility === 'hidden' || style.display === 'none') {
              continue;
            }

            if (isProseLink(el)) {
              continue;
            }

            if (rect.height < min || rect.width < min) {
              small.push({
                tag: el.tagName,
                text: (el.textContent ?? '').trim().slice(0, 40),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
              });
            }
          }

          return { checked: nodes.length, small };
        }, MIN_TAP);

        const file = `${lang}-${theme}-${width}.png`;
        await page.screenshot({ path: resolve(out, file), fullPage: true });
        results.push({
          slug,
          lang,
          theme,
          width,
          status: response?.status() ?? 0,
          htmlLang: ssr.htmlLang,
          title: ssr.title,
          overflowPx: overflow.over,
          errors: errors.length,
          errorSample: errors.slice(0, 3),
          tapChecked: tap.checked,
          tapUnder44: tap.small.length,
          tapOffenders: tap.small.slice(0, 5),
          file: `${slug}/${file}`,
        });
        await context.close();
      }
    }
  }

  console.log(`captured ${slug}`);
}

await browser.close();

await writeFile(resolve(OUT_ROOT, 'matrix-report.json'), JSON.stringify(results, null, 2));

const bad = results.filter(
  (r) => r.overflowPx > 1 || r.errors > 0 || r.status !== 200 || r.tapUnder44 > 0 || r.htmlLang !== r.lang,
);

console.table(
  results.map((r) => ({
    slug: r.slug,
    lang: r.lang,
    theme: r.theme,
    width: r.width,
    status: r.status,
    htmlLang: r.htmlLang,
    over: r.overflowPx,
    err: r.errors,
    tap: r.tapUnder44,
  })),
);

if (bad.length) {
  console.log(`\nISSUES: ${bad.length}/${results.length}`);
  console.log(JSON.stringify(bad.slice(0, 12), null, 2));
} else {
  console.log(`\nCLEAN: ${results.length}/${results.length} — 0 overflow, 0 console error, 0 tap<44, lang OK`);
}
