// Repro BUG-QA0928-RUNTIME-PROJECTID : le runtime est adressé avec l'id du PROJET.
// Pré-requis : fixture-local.mjs (quota gratuit plein), web local sur WEB (build prod), API locale.
// Mesure pendant DUREE ms : appels /api/runtime/workspaces/<projectId>/…, statuts, tickets frappés, texte montré.
import { webkit, chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const WEB = process.env.WEB || 'http://127.0.0.1:5183';
const DUREE = Number(process.env.DUREE || 60000);
const fx = JSON.parse(fs.readFileSync(new URL('./.fixture.json', import.meta.url)));
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const engine = process.env.ENGINE === 'chromium' ? chromium : webkit;
const b = await engine.launch();
const ctx = await b.newContext(process.env.ENGINE === 'chromium' ? { viewport: { width: 1440, height: 900 } } : devices['iPhone 13']);
const host = new URL(WEB).hostname;
await ctx.addCookies([{ name: 'vc_session', value: fx.token, domain: host, path: '/', httpOnly: true }]);
const p = await ctx.newPage();
const stats = { runtimeOnProjectId: {}, runtimeOnWsId: {}, tickets: {}, startWorkspace: [] };
const bump = (o, k) => (o[k] = (o[k] || 0) + 1);
p.on('response', async r => {
  const u = new URL(r.url()); const s = r.status(); const m = r.request().method();
  if (m === 'OPTIONS') return;
  const w = u.pathname.match(/\/api\/runtime\/workspaces\/([^/]+)(\/.*)?$/);
  if (u.pathname.endsWith('/runtime-ticket') || u.pathname.endsWith('/runtime-token')) bump(stats.tickets, s);
  else if (u.pathname.endsWith('/api/runtime/workspaces') && m === 'POST') stats.startWorkspace.push(s);
  else if (w && w[1] === fx.project2) bump(stats.runtimeOnProjectId, `${s} ${m} ${w[2] || '/'}`);
  else if (w) bump(stats.runtimeOnWsId, `${s} ${m} ${w[2] || '/'}`);
});
const t0 = Date.now();
await p.goto(`${WEB}/projects/${fx.project2}/ide`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(DUREE);
const visible = await p.evaluate(() => [...document.querySelectorAll('[role=alert],[role=status],[data-testid*=quota],[data-testid*=error]')].map(e => e.innerText.trim()).filter(Boolean).slice(0, 6));
const body = await p.evaluate(() => document.body.innerText);
await p.screenshot({ path: `${OUT}quota-storm-${process.env.ENGINE || 'webkit'}.png` });
const total = o => Object.values(o).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ dureeMs: Date.now() - t0, projectId: fx.project2, startWorkspace: stats.startWorkspace, ticketsFrappes: stats.tickets, appelsSurIdProjet: total(stats.runtimeOnProjectId), detail: stats.runtimeOnProjectId, appelsSurWsId: stats.runtimeOnWsId, messagesVisibles: visible, mentionQuota: /quota|limite|limit|upgrade|mettre à niveau|forfait/i.test(body) }, null, 1));
await b.close();
