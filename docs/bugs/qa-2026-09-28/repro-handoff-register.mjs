// Repro BUG-QA0928-IDEE-PERDUE-INSCRIPTION — LOCAL uniquement (compte de test sur 127.0.0.1).
// Parcours d'un inconnu : accueil → idée → « Créer l'application complète » → page de connexion
// → « Inscrivez-vous gratuitement » → inscription → où atterrit-il, son idée est-elle construite ?
import { webkit, chromium, devices } from '@playwright/test';
const WEB = process.env.WEB || 'http://127.0.0.1:5183';
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(WEB)) throw new Error('local uniquement');
const OUT = new URL('./artefacts/', import.meta.url).pathname;
const IDEE = 'QA-IDEE-5521 un carnet de recettes avec recherche';
const b = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch(); const c = await b.newContext(process.env.ENGINE === 'webkit' ? { ...devices['iPhone 13'], locale: 'fr-FR' } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR' }); const p = await c.newPage();
await p.goto(WEB + '/'); 
const champ = p.getByPlaceholder(/Décrivez votre idée|Describe your app idea/i).first();
await champ.waitFor(); await p.waitForTimeout(3000);
await champ.fill(IDEE);
await p.getByRole('button', { name: /Créer maintenant|Build now/i }).first().click();
await p.getByRole('dialog').getByRole('button', { name: /Créer l.application complète|Build the full app/i }).click();
await p.waitForURL(/\/login/, { timeout: 20000 });
const etape1 = p.url();
await p.getByRole('link', { name: /Inscrivez-vous|Sign up/i }).first().click();
await p.waitForURL(/\/register|\/signup/, { timeout: 20000 });
const etape2 = p.url();
const tag = Date.now().toString(36);
await p.getByLabel(/Nom complet|Full name/i).fill('QA Local');
await p.getByLabel(/e-mail/i).fill(`qa-handoff-${tag}@example.test`);
for (const f of await p.locator('input[type=password]').all()) await f.fill(`Qa-${tag}-Local!9x`);
for (const cb of await p.getByRole('checkbox').all()) await cb.check().catch(() => {});
await p.screenshot({ path: OUT + 'handoff-local-register-rempli.png', fullPage: true });
await p.getByRole('button', { name: /Créer le compte|Create account/i }).first().click();
await p.waitForURL(u => !/\/register|\/signup/.test(u.toString()), { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(6000);
const etape3 = p.url();
const ss = await p.evaluate(() => ({ idee: sessionStorage.getItem('pendingAppDescription'), intent: sessionStorage.getItem('composerBuildIntent') }));
const ideeAffichee = await p.evaluate(t => document.body.innerText.includes(t) || [...document.querySelectorAll('textarea,input')].some(i => i.value.includes(t)), 'QA-IDEE-5521');
await p.screenshot({ path: OUT + 'handoff-local-apres-inscription.png' });
// Suite : l'utilisateur, plus tard, clique « Nouveau projet » — l'idée ressurgit-elle et part-elle toute seule ?
await p.goto(WEB + '/projects/new'); await p.waitForTimeout(8000);
const etape4 = p.url();
console.log(JSON.stringify({ etape1_apresClic: etape1, etape2_lienInscription: etape2, etape3_apresInscription: etape3, ideeEncoreEnSessionStorage: ss, ideeAfficheeApresInscription: ideeAffichee, etape4_nouveauProjetPlusTard: etape4 }, null, 1));
await b.close();
