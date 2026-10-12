import { expect, test } from '@playwright/test';

/*
 * BUG-QA1001-CONNECTE-REVOIT-LA-CONNEXION — mesuré le 2026-10-01 en local : un
 * client dont la session est valide (son tableau de bord s'ouvre) ouvre /login
 * — là où mène « Se connecter » sur e-code.ai à chaque deuxième visite — et la
 * page lui redemande son mot de passe. Sur /register, il pouvait ouvrir un second
 * compte par erreur.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

for (const chemin of ['/login', '/register']) {
  test(`deuxième visite : un client déjà connecté qui ouvre ${chemin} arrive dans son espace`, async ({
    page,
    request,
  }) => {
    const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `retour-${suffixe}@local.test`,
        password: 'Password123!',
        name: 'Retour',
        organizationName: `Retour ${suffixe}`,
      },
    });

    expect(inscription.ok(), await inscription.text()).toBe(true);

    const { token } = (await inscription.json()) as { token: string };

    await page
      .context()
      .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

    await page.goto(chemin);

    // Mesuré AVANT correctif : l'adresse restait sur la page, avec son champ de mot de passe.
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/, { timeout: 20_000 });
    await expect(page.locator('input[type=password]')).toHaveCount(0);
  });
}

test('TÉMOIN — sans session, /login montre bien le formulaire', async ({ page }) => {
  await page.goto('/login');

  await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
  await expect(page.locator('input[type=password]').first()).toBeVisible({ timeout: 20_000 });
});
