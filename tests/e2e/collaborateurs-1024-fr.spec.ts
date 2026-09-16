import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Deux pages de projet à 1024 px, en FRANÇAIS, ne doivent rien amputer.
 *
 * Mesuré le 16/09 par l'audit i18n (shard desktop-1024, 3 tentatives sur 3,
 * clair et sombre) : `/projects/:id/collaborators` rendait `body.scrollWidth`
 * 1034 pour 1024. Cause : un `<select>` a pour largeur minimale son option la
 * plus longue (« Éditeur — modification… », 401 px) et un élément de grille ne
 * descend jamais sous son min-content — la colonne de 380 px débordait à
 * 445 px. En anglais les options sont plus courtes : la page tenait, le défaut
 * n'existait qu'en français, la langue d'Avi.
 *
 * La métrique est `document.body.scrollWidth` : `overflow-x: clip` sur html et
 * body borne `documentElement.scrollWidth` (voir mobile-content-clipping).
 */
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function ouvrirUneSession(request: APIRequestContext) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let dernierCorps = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `collab-1024-${suffixe}-${essai}@local.test`,
        password: 'Password123!',
        name: 'Collab 1024',
        organizationName: `Collab 1024 ${suffixe}-${essai}`,
      },
    });
    dernierCorps = await inscription.text();

    if (inscription.ok()) {
      const auth = JSON.parse(dernierCorps) as { token: string; organization: { id: string } };

      const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Collab 1024' },
      });
      expect(projet.ok(), await projet.text()).toBeTruthy();

      return { token: auth.token, projectId: (await projet.json()).project.id as string };
    }

    if (inscription.status() === 429 && essai < 3) {
      await new Promise((resoudre) => setTimeout(resoudre, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible d'ouvrir une session de test : ${dernierCorps}`);
}

for (const route of ['collaborators', 'env'] as const) {
  test(`/projects/:id/${route} en français à 1024 px n’ampute rien`, async ({ page, request }) => {
    test.setTimeout(120_000);

    const { token, projectId } = await ouvrirUneSession(request);
    await page.context().addCookies([
      { name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
      { name: 'vibecore-lang', value: 'fr', url: appBaseUrl, sameSite: 'Lax' },
    ]);
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.goto(`/projects/${projectId}/${route}?lang=fr`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main form').first()).toBeVisible({ timeout: 45_000 });

    const mesure = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    /* Témoin : la page est bien en français, sinon le test mesure une autre page. */
    expect(mesure.lang, 'la page doit être en français').toBe('fr');
    expect(
      mesure.bodyScrollWidth,
      `${route} : ${mesure.bodyScrollWidth - mesure.clientWidth} px amputés (body.scrollWidth=${mesure.bodyScrollWidth}, viewport=${mesure.clientWidth})`,
    ).toBeLessThanOrEqual(mesure.clientWidth + 1);
  });
}
