// Parcours 2 (LOCAL, build prod, runtime distant absent) — chaque panneau de la barre d'activité :
// s'ouvre-t-il, quel texte montre-t-il, quelles erreurs JS / réponses >= 400 déclenche-t-il ?
// NB : sans workspace-manager, les panneaux qui dépendent du pod (fichiers vivants, terminal, aperçu)
// ne peuvent PAS être jugés ici — ils sont signalés « non jugeable ».
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const WEB = process.env.WEB || 'http://127.0.0.1:5183';
const fx = JSON.parse(fs.readFileSync(new URL('./.fixture.json', import.meta.url)));
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const PANNEAUX = ['Git', 'Packages', 'Database', 'Secrets', 'Deployments', 'Monitoring', 'Settings', 'All tools'];
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addCookies([{ name: 'vc_session', value: fx.token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const p = await c.newPage();
let evts = [];
p.on('pageerror', e => evts.push('PAGEERROR ' + e.message.slice(0, 200)));
p.on('response', r => { const u = new URL(r.url()); if (r.status() >= 400 && !u.pathname.startsWith('/api/runtime')) evts.push(`${r.status()} ${r.request().method()} ${u.pathname.replace(/c[a-z0-9]{24}/g, ':id')}`); });
await p.goto(`${WEB}/projects/${fx.project1}/ide`); await p.waitForTimeout(12000);
const res = [];
for (const nom of PANNEAUX) {
  await p.keyboard.press('Escape'); evts = [];
  const btn = p.getByRole('button', { name: new RegExp('^' + nom, 'i') }).first();
  const ok = await btn.click({ timeout: 5000 }).then(() => true).catch(e => e.message.slice(0, 80));
  await p.waitForTimeout(3500);
  const slug = nom.replace(/\W+/g, '_');
  await p.screenshot({ path: `${OUT}panneau-1440-${slug}.png` });
  const texte = await p.evaluate(() => { let el = document.elementFromPoint(780, 300); for (let i = 0; i < 6 && el && el.innerText.length < 60; i++) el = el.parentElement; return (el?.innerText || '').replace(/\s+/g, ' ').slice(0, 260); });
  const erreurAffichee = await p.evaluate(() => [...document.querySelectorAll('[role=alert]')].map(e => e.innerText.trim()).filter(Boolean).slice(0, 3));
  res.push({ nom, clic: ok, texte, erreurAffichee, evts: [...new Set(evts)].slice(0, 6) });
}
fs.writeFileSync(OUT + 'panneaux-1440.json', JSON.stringify(res, null, 1));
for (const r of res) console.log(`\n## ${r.nom} clic=${r.clic}\n  texte: ${r.texte}\n  alertes: ${JSON.stringify(r.erreurAffichee)}\n  évts: ${JSON.stringify(r.evts)}`);
await b.close();
