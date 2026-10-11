import { expect, test } from '@playwright/test';

/*
 * BUG-QA0928-PROMPT-TRONQUE — une idée de plus de 8 000 caractères saisie sur
 * l'accueil était acceptée sans avertissement, puis `/projects/new` la coupait à
 * 8 000 et la SOUMETTAIT : la fin du cahier des charges — souvent les exigences
 * les plus précises — disparaissait en silence.
 *
 * Mesuré le 2026-09-28 : production — l'accueil accepte et relaie 11 999
 * caractères, aucun avertissement ; local — `/projects/new` soumet 8 000
 * caractères, « FIN-QA » perdu, projet créé.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const LIMITE = 8_000;
const TROP_LONG = `${'Une application de gestion de stock avec rôles, historique et exports. '.repeat(130).slice(0, 9_000 - 7)} FIN-QA`;

test('accueil : une idée trop longue est signalée, pas envoyée à moitié', async ({ page }) => {
  test.setTimeout(120_000);
  expect(TROP_LONG.length).toBeGreaterThan(LIMITE);

  await page.goto('/');

  const champ = page.getByPlaceholder(/Describe your app idea|Décrivez votre idée/i).first();

  await expect(champ).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('load');
  await expect(async () => {
    await champ.fill(TROP_LONG);
    await expect(champ).toHaveValue(TROP_LONG, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  await page
    .getByRole('button', { name: /^(Build now|Créer maintenant)$/i })
    .first()
    .click();

  await expect(page.getByText(/too long|trop longue/i).first(), 'un message dit que c’est trop long').toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/8[,  .]?000/).first(), 'le message donne la limite').toBeVisible();
  await expect(page.getByRole('dialog'), 'le choix de construction ne s’ouvre pas').toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('pendingAppDescription'))).toBeNull();
});

test('nouveau projet : une idée relayée trop longue n’est ni coupée ni soumise', async ({ page, request }) => {
  test.setTimeout(120_000);

  const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `prompt-long-${suffixe}@local.test`,
      password: 'Password123!',
      name: 'Prompt long',
      organizationName: `Prompt long ${suffixe}`,
    },
  });

  expect(inscription.ok(), await inscription.text()).toBe(true);

  const { token } = (await inscription.json()) as { token: string };

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

  await page.goto('/dashboard');
  await page.evaluate((idee) => {
    sessionStorage.setItem('pendingAppDescription', idee);
    sessionStorage.setItem('composerBuildIntent', '1');
    sessionStorage.setItem('pendingAppDescriptionAt', String(Date.now()));
  }, TROP_LONG);

  const creations: string[] = [];

  page.on('request', (requete) => {
    if (requete.method() === 'POST' && new URL(requete.url()).pathname.startsWith('/projects/new')) {
      creations.push(requete.postData() ?? '');
    }
  });

  await page.goto('/projects/new');
  await page.waitForLoadState('load');
  await page.waitForTimeout(8_000);

  expect(creations, 'aucune création à partir d’une idée coupée').toEqual([]);

  const composeur = page.locator('textarea').first();

  await expect(composeur).toHaveValue(TROP_LONG, { timeout: 10_000 });
  await expect(page.locator('#vc-new-project-prompt-status')).toHaveAttribute('data-state', 'error');
});
