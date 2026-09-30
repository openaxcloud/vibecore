// Parcours 5 (LOCAL) — compte neuf sans projet : tableau de bord, liste de projets, déploiements.
import { chromium } from '@playwright/test';
const WEB = process.env.WEB || 'http://127.0.0.1:5183', API = process.env.API || 'http://127.0.0.1:3011';
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const tag = Date.now().toString(36);
const r = await fetch(API + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `qa-vide-${tag}@example.test`, password: `Qa-${tag}-Local!9`, name: 'QA Vide', organizationName: `QA vide ${tag}` }) });
const { token } = await r.json();
const b = await chromium.launch();
const res = {};
for (const [nom, vp] of [['390', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['1440', { width: 1440, height: 900 }]]) {
  const { isMobile, hasTouch, ...viewport } = vp;
  const c = await b.newContext({ viewport, isMobile, hasTouch, locale: 'fr-FR' });
  await c.addCookies([{ name: 'vc_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 150)));
  p.on('response', x => { if (x.status() >= 400) errs.push(x.status() + ' ' + new URL(x.url()).pathname); });
  for (const chemin of ['/dashboard', '/projects', '/deployments']) {
    await p.goto(WEB + chemin); await p.waitForTimeout(6000);
    const m = await p.evaluate(() => ({ url: location.pathname, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: [...document.querySelectorAll('h1,h2,h3')].map(h => h.innerText.trim()).filter(Boolean).slice(0, 6), cta: [...document.querySelectorAll('a,button')].filter(e => /créer|nouveau|new|create|start|commencer/i.test(e.innerText)).map(e => e.innerText.trim().slice(0, 40)).slice(0, 5), nombres: (document.body.innerText.match(/\bNaN\b|undefined|null|\{\{|\[object/g) || []) }));
    await p.screenshot({ path: `${OUT}vide-${nom}${chemin.replace(/\//g, '_')}.png` });
    res[`${nom} ${chemin}`] = { ...m, errs: [...new Set(errs.splice(0))].slice(0, 5) };
  }
  await c.close();
}
console.log(JSON.stringify(res, null, 1));
await b.close();
