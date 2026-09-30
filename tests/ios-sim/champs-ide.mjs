/*
 * Inventaire des champs de saisie de l'IDE, panneau par panneau, avec leur police CALCULÉE.
 *
 * WebKit (profil iPhone, 390 × 844) sur la copie LOCALE de l'app, compte de TEST.
 * Safari iOS zoome sur tout champ focalisé dont la police calculée est < 16 px.
 * Ce script ne mesure pas le zoom (Playwright ne le peut pas) : il dit quels champs
 * existent et quelle police ils portent. Le zoom RÉEL est mesuré ensuite par
 * XCUITest (ClavierSafariTests.test3) sur la liste produite ici.
 *
 * Couvre aussi ce que le plancher global (`_ios-input-zoom.scss`) ne vise pas :
 * `contenteditable` (éditeur) et le `textarea` caché du terminal.
 *
 * Usage : APP=<dépôt> BANC_IDE_BASE=… BANC_COURRIEL=… BANC_SECRET=… BANC_PROJET=… SORTIE=… node champs-ide.mjs
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { APP, BANC_IDE_BASE: base, BANC_COURRIEL, BANC_SECRET, BANC_PROJET, SORTIE } = process.env;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(base ?? '')) {
  throw new Error('identifiants de test : hôte LOCAL uniquement');
}
const { webkit, devices } = createRequire(join(APP, 'package.json'))('@playwright/test');

// app/lib/ide/panel-registry.ts — IDE_ADDRESSABLE_PANELS (relevé le 30/09).
const PANNEAUX = [
  'agent', 'editor', 'preview', 'files', 'search', 'locks', 'overview', 'studio', 'problems', 'database',
  'object-storage', 'packages', 'skills', 'monitoring', 'ports', 'extensions', 'integrations', 'workflows',
  'debugger', 'deployments', 'security', 'env', 'secrets', 'git', 'activity', 'terminal', 'logs',
  'collaborators', 'domains', 'snapshots', 'settings',
];

const navigateur = await webkit.launch();
const contexte = await navigateur.newContext({ ...devices['iPhone 14'], locale: 'fr-FR' });
const page = await contexte.newPage();

await page.goto(`${base}/login`, { timeout: 180_000 });
await page.getByLabel('Adresse e-mail').fill(BANC_COURRIEL);
await page.getByPlaceholder('Saisissez votre mot de passe').fill(BANC_SECRET);
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });

const tous = [];
for (const panneau of PANNEAUX) {
  const url = `${base}/projects/${BANC_PROJET}/ide?panel=${panneau}`;
  for (let essai = 0; essai < 3; essai++) {
    await page.goto(url, { timeout: 180_000 });
    await page.waitForTimeout(essai === 0 && panneau === 'agent' ? 20_000 : 7_000);
    // Serveur de dev : Vite ré-optimise au premier chargement → « Application Error » (mesuré le 30/09).
    if (!(await page.getByText('Application Error').count())) break;
    console.log(`BANC-MESURE champs panneau=${panneau} rechargement=${essai + 1}`);
  }
  const champs = await page.evaluate(() => {
    const libelleDe = (el) => {
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return l.textContent.trim();
      }
      const englobant = el.closest('label');
      return englobant ? englobant.textContent.trim() : '';
    };
    const exclus = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'submit', 'button', 'reset', 'image']);
    return [...document.querySelectorAll('input, textarea, select, [contenteditable=""], [contenteditable="true"]')]
      .filter((el) => !exclus.has((el.getAttribute('type') || '').toLowerCase()))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const visible =
          r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 &&
          r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
        return {
          balise: el.tagName.toLowerCase() + (el.getAttribute('type') ? `[${el.getAttribute('type')}]` : '') + (el.isContentEditable && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' ? '[contenteditable]' : ''),
          classe: (el.className && typeof el.className === 'string' ? el.className : '').split(/\s+/).slice(0, 2).join('.'),
          libelle: libelleDe(el).slice(0, 80),
          indice: (el.getAttribute('placeholder') || '').slice(0, 80),
          police: parseFloat(cs.fontSize),
          visible,
          haut: Math.round(r.top),
        };
      });
  });
  for (const ch of champs) tous.push({ panneau, ...ch });
  const sous16 = champs.filter((c) => c.police < 16);
  console.log(`BANC-MESURE champs panneau=${panneau} total=${champs.length} visibles=${champs.filter((c) => c.visible).length} sous16=${sous16.length}`);
}
/*
 * L'ÉDITEUR avec un fichier ouvert : `?panel=editor` sans fichier n'a aucun champ.
 * On ouvre README.md depuis le panneau Fichiers — c'est le geste d'Avi.
 * `contenteditable` n'est PAS couvert par le plancher global de 16 px.
 */
await page.goto(`${base}/projects/${BANC_PROJET}/ide?panel=files`, { timeout: 180_000 });
await page.waitForTimeout(7_000);
const fichier = page.getByText('README.md', { exact: true }).first();
if (await fichier.count()) {
  await fichier.click();
  await page.waitForTimeout(6_000);
  const editeur = await page.evaluate(() =>
    [...document.querySelectorAll('[contenteditable=""], [contenteditable="true"], textarea')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        balise: el.tagName.toLowerCase() + (el.isContentEditable ? '[contenteditable]' : ''),
        classe: (typeof el.className === 'string' ? el.className : '').split(/\s+/).slice(0, 2).join('.'),
        libelle: el.getAttribute('aria-label') || '',
        indice: el.getAttribute('placeholder') || '',
        police: parseFloat(getComputedStyle(el).fontSize),
        visible: r.width > 4 && r.height > 4 && r.top < innerHeight && r.bottom > 0,
        haut: Math.round(r.top),
      };
    }),
  );
  for (const ch of editeur) tous.push({ panneau: 'files>README.md', ...ch });
  console.log(`BANC-MESURE champs panneau=files>README.md total=${editeur.length} visibles=${editeur.filter((c) => c.visible).length} sous16=${editeur.filter((c) => c.police < 16).length} polices=${[...new Set(editeur.map((c) => c.police))].join(',')}`);
} else {
  console.log('BANC-MESURE champs panneau=files>README.md README.md-introuvable');
}
await navigateur.close();

writeFileSync(join(SORTIE, 'champs.json'), JSON.stringify(tous, null, 2));
for (const c of tous.filter((c) => c.police < 16)) {
  console.log(`BANC-MESURE champs SOUS-16 panneau=${c.panneau} ${c.balise} police=${c.police} visible=${c.visible} libelle="${c.libelle}" indice="${c.indice}" classe=${c.classe}`);
}
// Liste pour XCUITest : champs VISIBLES qu'on peut désigner (libellé ou indice), dédoublonnés par panneau.
const vus = new Set();
const cible = tous
  .map((c) => (c.panneau.includes('>') && c.balise.includes('[contenteditable]') && !c.libelle ? { ...c, libelle: '@textview' } : c))
  .filter((c) => c.visible && (c.libelle || c.indice))
  .filter((c) => !vus.has(`${c.panneau}|${c.libelle}|${c.indice}`) && vus.add(`${c.panneau}|${c.libelle}|${c.indice}`))
  .map((c) => [c.panneau, `${c.police}px`, c.libelle.replaceAll('|', ' ').replaceAll(';;', ' '), c.indice.replaceAll('|', ' ').replaceAll(';;', ' ')].join('|'));
writeFileSync(join(SORTIE, 'champs.liste'), cible.join(';;'));
console.log(`BANC-MESURE champs bilan total=${tous.length} sous16=${tous.filter((c) => c.police < 16).length} cibles-xcuitest=${cible.length}`);
