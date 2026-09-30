// Parcours 4 (LOCAL) — une idée de 12 000 caractères relayée depuis l'accueil : que soumet /projects/new ?
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const WEB = process.env.WEB || 'http://127.0.0.1:5183';
const fx = JSON.parse(fs.readFileSync(new URL('./.fixture.json', import.meta.url)));
const texte = ('QA-LONG ' + 'Une application de gestion de stock avec rôles, historique et exports. ').repeat(200).slice(0, 11992) + ' FIN-QA';
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
await c.addCookies([{ name: 'vc_session', value: fx.token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const p = await c.newPage();
await p.goto(WEB + '/dashboard');
await p.evaluate(t => { sessionStorage.setItem('pendingAppDescription', t); sessionStorage.setItem('composerBuildIntent', '1'); }, texte);
let soumis = null;
p.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/projects/new')) soumis = r.postData(); });
await p.goto(WEB + '/projects/new'); await p.waitForTimeout(10000);
const d = soumis ? new URLSearchParams(soumis).get('prompt') ?? (() => { try { return JSON.parse(soumis).prompt; } catch { return null; } })() : null;
const avertissement = await p.evaluate(() => /tronqu|truncat|8[\s ,.]?000/i.test(document.body.innerText));
console.log(JSON.stringify({ longueurRelayee: texte.length, longueurSoumise: d?.length ?? null, finConservee: d?.includes('FIN-QA') ?? null, urlFinale: p.url(), avertissementVisible: avertissement }));
await b.close();
