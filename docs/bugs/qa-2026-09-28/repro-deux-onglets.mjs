// Parcours 4 (LOCAL) — deux onglets sur le même projet, même fichier, deux sauvegardes.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const WEB = process.env.WEB || 'http://127.0.0.1:5183';
const fx = JSON.parse(fs.readFileSync(new URL('./.fixture.json', import.meta.url)));
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addCookies([{ name: 'vc_session', value: fx.token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const log = [];
const ouvrir = async nom => { const p = await c.newPage(); p.on('response', r => { const u = new URL(r.url()); if (['PUT', 'POST', 'PATCH'].includes(r.request().method()) && /files|ide-state/.test(u.pathname)) log.push(`${nom} ${r.status()} ${r.request().method()} ${u.pathname.replace(/c[a-z0-9]{24}/g, ':id')}`); }); await p.goto(`${WEB}/projects/${fx.project1}/ide`); await p.waitForTimeout(10000); await p.getByText('README.md', { exact: true }).first().click(); await p.waitForTimeout(3000); return p; };
const A = await ouvrir('A'); const B = await ouvrir('B');
const editer = async (p, texte) => { await p.locator('.monaco-editor .view-lines').first().click(); await p.keyboard.press('ControlOrMeta+End'); await p.keyboard.type('\n' + texte); await p.getByRole('button', { name: /^Save$|^Enregistrer$/ }).first().click(); await p.waitForTimeout(3000); };
await editer(A, 'LIGNE-ONGLET-A');
await B.waitForTimeout(8000);
const bVoitA = await B.evaluate(() => document.querySelector('.monaco-editor .view-lines')?.innerText.includes('LIGNE-ONGLET-A'));
await editer(B, 'LIGNE-ONGLET-B');
await A.waitForTimeout(8000);
const avert = async p => p.evaluate(() => [...document.querySelectorAll('[role=alert],[role=status],.Toastify__toast')].map(e => e.innerText.trim()).filter(t => /conflit|conflict|modifi|changed|autre onglet|another tab|recharg|reload|écras|overwr/i.test(t)).slice(0, 3));
// Relire la vérité côté serveur : export du projet
const r = await fetch(`http://127.0.0.1:3011/projects/${fx.project1}/export/zip`, { headers: { authorization: `Bearer ${fx.token}` } });
const t = await r.text();
let serveur = null; try { const { archive } = JSON.parse(t); const { default: JSZip } = await import('jszip'); const z = await JSZip.loadAsync(Buffer.from(archive.base64, 'base64')); const f = Object.keys(z.files).find(n => n.endsWith('README.md')); serveur = await z.files[f].async('string'); } catch (e) { serveur = 'lecture impossible: ' + r.status + ' ' + e.message.slice(0, 80); }
await A.screenshot({ path: OUT + 'deux-onglets-A.png' }); await B.screenshot({ path: OUT + 'deux-onglets-B.png' });
console.log(JSON.stringify({ ecritures: log, ongletB_voitLigneA_avantSaSauvegarde: bVoitA, serveurContientA: serveur?.includes?.('LIGNE-ONGLET-A'), serveurContientB: serveur?.includes?.('LIGNE-ONGLET-B'), avertissementA: await avert(A), avertissementB: await avert(B), readmeServeur: String(serveur).slice(0, 160) }, null, 1));
await b.close();
