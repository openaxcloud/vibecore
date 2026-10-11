// Vérification EN PRODUCTION (https), moteur de l'iPhone (WebKit), SANS compte — BUG-QA0928-IDEE-PERDUE-INSCRIPTION.
// Le parcours se prouve depuis ses DEUX points d'entrée, jusqu'à la page de connexion de l'application :
//   - départ e-code.ai     : le jeton de relais (cookie HttpOnly, domaine .e-code.ai) doit arriver sur app.e-code.ai ;
//   - départ app.e-code.ai : l'idée doit être dans le sessionStorage de l'application (#611).
// Dans les deux cas, AUCUNE adresse demandée ne doit porter l'idée.
// L'inscription elle-même n'est pas faite en production (pas de compte de test) : la consommation du jeton est
// prouvée en CI sur Chromium par tests/e2e/idee-entre-domaines.spec.ts.
// Usage : node docs/bugs/qa-2026-09-28/verif-live-idee-deux-domaines.mjs
import { webkit, devices } from '@playwright/test';

const temoin = `qa${Date.now().toString(36)}`;
let echecs = 0;

for (const depart of ['https://e-code.ai/', 'https://app.e-code.ai/']) {
  const navigateur = await webkit.launch();
  const contexte = await navigateur.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await contexte.newPage();
  const adressesFautives = [];

  page.on('request', (requete) => {
    if (decodeURIComponent(requete.url()).includes(temoin)) {
      adressesFautives.push(new URL(requete.url()).origin + new URL(requete.url()).pathname);
    }
  });

  await page.goto(depart, { waitUntil: 'domcontentloaded' });

  const champ = page.getByPlaceholder(/Describe your app idea|Décrivez/i).first();

  await champ.waitFor({ timeout: 30_000 });
  await champ.fill(`Herbier ${temoin} — vérification QA sans compte`);
  await page.getByRole('button', { name: /Build now|Créer maintenant/i }).first().click();

  const choix = page
    .getByRole('dialog')
    .getByRole('button', { name: /Build the full app|Créer l.application complète/i })
    .first();

  await choix.waitFor({ timeout: 10_000 });
  await choix.click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });

  const arrivee = new URL(page.url());
  const jeton = (await contexte.cookies()).find((cookie) => cookie.name === 'ecode_relais_idee');
  const ideeEnSession = await page.evaluate(() => !!sessionStorage.getItem('pendingAppDescription'));

  const idee =
    depart.startsWith('https://e-code.ai')
      ? Boolean(jeton && jeton.domain === '.e-code.ai' && /^[A-Za-z0-9_-]{32}$/.test(jeton.value))
      : ideeEnSession;

  const ok = arrivee.origin === 'https://app.e-code.ai' && idee && adressesFautives.length === 0;

  echecs += ok ? 0 : 1;
  console.log(
    `${ok ? 'OK   ' : 'ÉCHEC'} départ ${depart} → ${arrivee.origin}${arrivee.pathname} | idée relayée=${idee}` +
      ` (jeton ${jeton ? `domaine ${jeton.domain}, ${jeton.value.length} car., HttpOnly=${jeton.httpOnly}` : 'absent'}, session=${ideeEnSession})` +
      ` | adresses portant l'idée : ${adressesFautives.length}`,
  );

  await navigateur.close();
}

process.exit(echecs ? 1 : 0);
