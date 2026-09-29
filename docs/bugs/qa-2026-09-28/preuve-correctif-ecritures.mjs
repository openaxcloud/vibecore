// Preuve navigateur (LOCAL, build de prod) du correctif BUG-QA0928-RUNTIME-ID-PROJET.
// Pré-requis : fixture-local.mjs (projet 1 tient le créneau gratuit → démarrage du projet 2 = 429).
// Usage : ENGINE=webkit|chromium node preuve-correctif-ecritures.mjs
import { webkit, chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const WEB = process.env.WEB || 'http://127.0.0.1:5183';
const fx = JSON.parse(fs.readFileSync(new URL('./.fixture.json', import.meta.url)));
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const moteur = process.env.ENGINE === 'chromium' ? 'chromium' : 'webkit';
const b = await (moteur === 'chromium' ? chromium : webkit).launch();
const c = await b.newContext(moteur === 'chromium' ? { viewport: { width: 1440, height: 900 }, locale: 'fr-FR' } : { ...devices['iPhone 13'], locale: 'fr-FR' });
await c.addCookies([{ name: 'vc_session', value: fx.token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const p = await c.newPage();
const mesures = { surIdProjet: 0, tickets: 0, demarrages: [], appelsAgent: 0 };
p.on('request', r => {
  const u = new URL(r.url());
  if (u.pathname.includes(`/workspaces/${fx.project2}`)) mesures.surIdProjet += 1;
  if (u.pathname.endsWith('/runtime-ticket') || u.pathname.endsWith('/runtime-token')) mesures.tickets += 1;
  if (/\/api\/(chat|llmcall|agent\/run)/.test(u.pathname) && r.method() === 'POST') mesures.appelsAgent += 1;
});
p.on('response', r => { const u = new URL(r.url()); if (u.pathname.endsWith('/api/runtime/workspaces') && r.request().method() === 'POST') mesures.demarrages.push(r.status()); });
const avis = p.getByTestId('avis-ecritures-en-attente');

// 1. Avis AVANT tout envoi
await p.goto(`${WEB}/projects/${fx.project2}/ide`);
await avis.waitFor({ timeout: 90000 });
const texteAvant = (await avis.innerText()).replace(/\s+/g, ' ');
await p.screenshot({ path: `${OUT}correctif-${moteur}-1-avis-quota.png` });

// 2. Envoi retenu
const champ = p.getByPlaceholder(/Construire, corriger|Build, fix/i).first();
await champ.fill('Ajoute une page de contact');
await p.keyboard.press('Enter');
await p.waitForTimeout(2500);
const toast = await p.evaluate(() => [...document.querySelectorAll('.Toastify__toast')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' | '));
const saisieGardee = await champ.inputValue();
await p.screenshot({ path: `${OUT}correctif-${moteur}-2-envoi-retenu.png` });

// 3. File persistée : survit au rechargement de « Redémarrer »
await p.evaluate(({ projet }) => localStorage.setItem(`vibecore:ecritures-en-attente:${projet}`, JSON.stringify([
  { chemin: 'src/pages/Contact.tsx', contenu: 'export default function Contact() { return null; }', enregistreeLe: 1 },
  { chemin: 'src/App.tsx', contenu: 'export default function App() { return null; }', enregistreeLe: 2 },
])), { projet: fx.project2 });
await avis.getByRole('button').click();       // « Redémarrer l'espace de travail » = rechargement de page
await p.waitForLoadState('domcontentloaded');
await avis.waitFor({ timeout: 90000 });
await p.waitForFunction(() => /2 fichiers/.test(document.querySelector('[data-testid=avis-ecritures-en-attente]')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
const texteApres = (await avis.innerText()).replace(/\s+/g, ' ');
await p.screenshot({ path: `${OUT}correctif-${moteur}-3-file-apres-rechargement.png` });

console.log(JSON.stringify({ moteur, texteAvant, toast, saisieGardee, texteApres, ...mesures }, null, 1));
await b.close();
