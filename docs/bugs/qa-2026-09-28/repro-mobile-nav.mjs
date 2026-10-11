// Navigation mobile publique, WebKit iPhone 13 : menu, CTA tarification, bascule thème.
import { webkit, devices } from '@playwright/test';
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const b = await webkit.launch(); const c = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' }); const p = await c.newPage();
await p.goto('https://app.e-code.ai/'); await p.waitForTimeout(6000);
const menuBtn = p.getByRole('button', { name: /menu/i }).first();
const mb = await menuBtn.boundingBox();
await menuBtn.tap(); await p.waitForTimeout(1200);
await p.screenshot({ path: OUT + 'mobile-menu-open.png' });
const menu = await p.evaluate(() => {
  const vis = [...document.querySelectorAll('nav a, [role=dialog] a, [role=menu] a')].filter(a => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  return { count: vis.length, small: vis.filter(a => a.getBoundingClientRect().height < 44).map(a => a.innerText.trim().slice(0, 30) + ':' + Math.round(a.getBoundingClientRect().height)).slice(0, 12), offscreen: vis.filter(a => a.getBoundingClientRect().bottom > innerHeight).length, bodyScrollLocked: getComputedStyle(document.body).overflow };
});
// thème
await p.keyboard.press('Escape').catch(() => {});
await p.goto('https://app.e-code.ai/pricing'); await p.waitForTimeout(5000);
const ctas = await p.evaluate(() => [...document.querySelectorAll('a,button')].filter(e => /commencer|start|essai|trial|choisir|choose|get started|contact/i.test(e.innerText)).map(e => e.innerText.trim().slice(0, 30) + ' -> ' + (e.getAttribute('href') || e.tagName)).slice(0, 12));
console.log(JSON.stringify({ menuButton: mb, menu, ctas }, null, 1));
await b.close();
