// Proposed regression check; run only against a build containing the reviewed patch.
const { chromium, expect } = require('/workspace/vibecore-ui-next/node_modules/@playwright/test');
const fs = require('node:fs');
const base = process.env.UI_BASE_URL;
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Explicit local URL required');
const out = { cases: [], errors: [], mutations: [] };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    for (const route of ['privacy', 'terms']) for (const lang of ['fr', 'en']) for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'ecode_theme', value: theme, url: base }]);
      await context.route('**/*', r => {
        if (r.request().method() !== 'GET') { out.mutations.push(r.request().url()); return r.abort(); }
        return new URL(r.request().url()).origin === base ? r.continue() : r.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', e => out.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && /hydrat/i.test(m.text())) out.errors.push(m.text()); });
      const id = `${route}-contact`;
      const response = await page.goto(`${base}/${route}?lang=${lang}#${id}`, { waitUntil: 'networkidle' });
      const html = await response.text();
      expect(html).toMatch(new RegExp(`<h2[^>]*id="${id}"`));
      expect(html).toMatch(/<h1/);
      const target = page.locator('#' + id);
      const measure = () => target.evaluate(e => ({ top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom, headerBottom: document.querySelector('header').getBoundingClientRect().bottom, viewport: innerHeight }));
      await expect.poll(async () => { const r = await measure(); return r.top >= r.headerBottom && r.bottom <= r.viewport; }).toBe(true);
      const cold = await measure();
      await page.evaluate(() => { location.hash = ''; });
      await page.evaluate(id => { location.hash = id; }, id);
      await expect.poll(async () => { const r = await measure(); return r.top >= r.headerBottom && r.bottom <= r.viewport; }).toBe(true);
      await page.locator('header a[href="/"]').first().click();
      await page.waitForURL(u => u.pathname === '/');
      await page.goBack({ waitUntil: 'networkidle' });
      await expect.poll(async () => { const r = await measure(); return r.top >= r.headerBottom && r.bottom <= r.viewport; }).toBe(true);
      out.cases.push({ route, lang, theme, width, cold, afterBack: await measure() });
      await context.close();
    }
    expect(out.errors).toEqual([]);
    expect(out.mutations).toEqual([]);
  } finally {
    await browser.close();
    fs.writeFileSync('/tmp/ui-audit-next-legal/acceptance-after-build.json', JSON.stringify(out, null, 2));
  }
})().catch(e => { console.error(e); process.exit(1); });
