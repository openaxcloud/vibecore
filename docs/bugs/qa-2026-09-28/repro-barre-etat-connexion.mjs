// Repro BUG-QA0928-COSMETIQUES point 3 : la barre d'état disait « Connected » à côté de « Workspace Error ».
// Pré-requis : fixture-local.mjs (quota gratuit plein), API locale, web local en VITE_RUNTIME_MODE=remote-kubernetes.
// Usage : WEB=http://127.0.0.1:5184 node repro-barre-etat-connexion.mjs
// Avant correctif : « [Workspace connection healthy] Connected » + « Workspace Error ». Après : « Unavailable ».
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(new URL('./.fixture.json', import.meta.url)));
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'vc_session', value: fx.token, domain: new URL(process.env.WEB || 'http://127.0.0.1:5184').hostname, path: '/', httpOnly: true }]);
const p = await ctx.newPage();
await p.goto(`${process.env.WEB || 'http://127.0.0.1:5184'}/projects/${fx[process.env.PROJ || 'project2']}/ide`, { waitUntil: 'domcontentloaded' });
for (const s of [8, 20, 40]) {
  await p.waitForTimeout(s === 8 ? 8000 : s === 20 ? 12000 : 20000);
  const bar = await p.evaluate(() => { const f = document.querySelector('.bolt-project-statusbar'); if (!f) return 'ABSENTE';
    return [...f.querySelectorAll('.bolt-project-statusbar-pill')].slice(0,6).map(e => `[${e.getAttribute('title') ?? ''}] ${e.innerText.replace(/\s+/g,' ').trim()}`).join(' | '); });
  console.log(`t≈${s}s ${p.url().includes('/login') ? 'LOGIN' : 'ide'}: ${bar}`);
}
await p.screenshot({ path: new URL('./artefacts/barre-etat-connexion-' + (process.env.NOM || 'apres') + '.png', import.meta.url).pathname });
await b.close();
