import { expect, test, type Page } from '@playwright/test';

/*
 * BUG-QA0928-IDEE-PERDUE-INSCRIPTION — l'inconnu qui décrit son app sur l'accueil
 * puis s'inscrit arrivait sur un tableau de bord vide ; son idée dormait dans
 * `sessionStorage` et se relançait toute seule au prochain « Nouveau projet ».
 *
 * Mesuré le 2026-09-28 (production pour les étapes 1–3, build de prod local
 * pour la suite) : accueil → « Créer l'application complète » →
 * `/login?returnTo=/projects/new` → « Inscrivez-vous » → `/register` SANS
 * `returnTo` → après inscription `/dashboard`, idée non affichée → plus tard,
 * `/projects/new` crée tout seul `qa-idee-5521-un-carnet-de-recettes`.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function decrireSonIdee(page: Page, idee: string) {
  await page.goto('/');

  const champ = page.getByPlaceholder(/Describe your app idea|Décrivez votre idée/i).first();

  await expect(champ).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('load');

  // Le champ n'accepte la frappe qu'une fois hydraté : on réessaie jusqu'à ce que la valeur tienne.
  await expect(async () => {
    await champ.fill(idee);
    await expect(champ).toHaveValue(idee, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  await page
    .getByRole('button', { name: /^(Build now|Créer maintenant)$/i })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Build the full app|Créer l.application complète/i })
    .click();
}

test('l’idée tapée sur l’accueil survit à l’inscription et devient le premier projet', async ({ page }) => {
  test.setTimeout(180_000);

  const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const idee = `Carnet de recettes ${suffixe} avec recherche par ingrédient`;

  await decrireSonIdee(page, idee);

  // L'inconnu passe par la connexion — le lien d'inscription doit garder la destination.
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fprojects%2Fnew/, { timeout: 30_000 });

  // Ciblé par sa destination, pas par son libellé (traduit, et qui change).
  const lienInscription = page.locator('a[href^="/register"]').first();

  await expect(lienInscription, 'témoin : la page de connexion propose bien l’inscription').toBeVisible();

  await expect(lienInscription, 'le lien d’inscription garde la destination').toHaveAttribute(
    'href',
    /returnTo=%2Fprojects%2Fnew/,
  );
  await lienInscription.click();
  await expect(page).toHaveURL(/\/register\?/, { timeout: 30_000 });

  await page.getByLabel(/Full name|Nom complet/i).fill('Inconnu QA');
  await page
    .getByLabel(/e-?mail/i)
    .first()
    .fill(`idee-${suffixe}@local.test`);

  for (const champ of await page.locator('input[type=password]').all()) {
    await champ.fill(`Idee-${suffixe}-Qa!9`);
  }

  for (const caseACocher of await page.getByRole('checkbox').all()) {
    await caseACocher.check().catch(() => undefined);
  }

  await page.getByRole('button', { name: /^(Create account|Créer le compte)$/i }).click();

  /*
   * Destination attendue : le composeur de nouveau projet, qui consomme l'idée
   * et crée le projet. JAMAIS le tableau de bord vide.
   */
  await expect(page, 'l’inscription ne mène pas au tableau de bord vide').not.toHaveURL(/\/dashboard(\?|$)/, {
    timeout: 5_000,
  });
  await expect(page).toHaveURL(new RegExp(`carnet-de-recettes-${suffixe}`), { timeout: 90_000 });

  const reste = await page.evaluate(() => sessionStorage.getItem('pendingAppDescription'));

  expect(reste, 'l’idée est consommée, elle ne ressurgira pas plus tard').toBeNull();
});

test('une idée restée dans l’onglet sans date récente ne se lance pas toute seule', async ({ page, request }) => {
  test.setTimeout(120_000);

  const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `idee-perimee-${suffixe}@local.test`,
      password: 'Password123!',
      name: 'Idée périmée',
      organizationName: `Idée périmée ${suffixe}`,
    },
  });

  expect(inscription.ok(), await inscription.text()).toBe(true);

  const { token } = (await inscription.json()) as { token: string };

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

  // Une idée d'une visite passée : relayée sans date (ancien format) ou il y a deux heures.
  await page.goto('/dashboard');
  await page.evaluate(() => {
    sessionStorage.setItem('pendingAppDescription', 'IDEE-PERIMEE une ancienne idée abandonnée');
    sessionStorage.setItem('composerBuildIntent', '1');
    sessionStorage.setItem('pendingAppDescriptionAt', String(Date.now() - 2 * 60 * 60 * 1000));
  });

  const creations: string[] = [];

  page.on('request', (requete) => {
    if (requete.method() === 'POST' && new URL(requete.url()).pathname.startsWith('/projects/new')) {
      creations.push(requete.url());
    }
  });

  await page.goto('/projects/new');
  await page.waitForLoadState('load');
  await page.waitForTimeout(8_000);

  expect(creations, 'aucun projet créé à partir d’une idée périmée').toEqual([]);
  await expect(page).toHaveURL(/\/projects\/new/);
});
