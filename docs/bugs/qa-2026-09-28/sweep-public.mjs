// Repro exécutable : balayage des pages publiques de prod, sans compte.
// Usage : node docs/bugs/qa-2026-09-28/sweep-public.mjs [base]
// Sortie : artefacts/public-<moteur>-<largeur>-<slug>.png + public-report.json
import { chromium, webkit, devices } from '@playwright/test';
import fs from 'node:fs';
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const BASES = { app: 'https://app.e-code.ai', www: 'https://e-code.ai' };
const PATHS = (process.env.PATHS || '/,/pricing,/login,/signup,/register,/auth/login,/auth/signup,/gallery,/templates,/enterprise,/docs,/blog,/terms,/privacy,/forgot-password,/projects,/dashboard,/n-existe-pas-qa').split(',');
const CONFIGS = [
  { name: 'webkit-390', engine: webkit, ctx: { ...devices['iPhone 13'] } },
  { name: 'chromium-390', engine: chromium, ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: 'chromium-768', engine: chromium, ctx: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
  { name: 'chromium-1440', engine: chromium, ctx: { viewport: { width: 1440, height: 900 } } },
];
const report = [];
for (const cfg of CONFIGS.filter(c => !process.env.ONLY || process.env.ONLY.split(',').includes(c.name))) {
  const browser = await cfg.engine.launch();
  for (const [bk, base] of Object.entries(BASES)) for (const p of PATHS) {
    const ctx = await browser.newContext(cfg.ctx);
    const page = await ctx.newPage();
    const errs = [], bad = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
    page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`); });
    page.on('requestfailed', r => bad.push(`FAILED ${r.failure()?.errorText} ${r.url().slice(0, 160)}`));
    let status = null, finalUrl = null, err = null;
    try {
      const resp = await page.goto(base + p, { waitUntil: 'load', timeout: 45000 });
      status = resp?.status();
      await page.waitForTimeout(3500);
      finalUrl = page.url();
    } catch (e) { err = e.message.slice(0, 200); }
    const m = await page.evaluate(() => ({
      title: document.title,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      textLen: document.body?.innerText?.trim().length ?? 0,
      h1: [...document.querySelectorAll('h1')].map(h => h.innerText.trim()).slice(0, 2),
      lang: document.documentElement.lang,
      wide: [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 2 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 5).map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className).slice(0, 50) + ' right=' + Math.round(el.getBoundingClientRect().right)),
    })).catch(e => ({ evalErr: e.message.slice(0, 100) }));
    const slug = bk + (p.replace(/\W+/g, '_') || '_root');
    await page.screenshot({ path: `${OUT}public-${cfg.name}-${slug}.png`, fullPage: false }).catch(() => {});
    report.push({ cfg: cfg.name, url: base + p, status, finalUrl, err, ...m, errs: errs.slice(0, 8), bad: bad.slice(0, 10) });
    await ctx.close();
  }
  await browser.close();
}
fs.writeFileSync(OUT + `public-report${process.env.ONLY ? '-' + process.env.ONLY : ''}.json`, JSON.stringify(report, null, 1));
console.log('VERDICT pages=' + report.length);
