import { expect, test } from '@playwright/test';

/*
 * BUG-QA0930-OAUTH-OUBLIE-LA-DESTINATION — relevé le 2026-09-30 en production :
 * sur `/register?returnTo=…` et `/login?returnTo=…`, les boutons Google et GitHub
 * pointaient vers `/auth/oauth/<fournisseur>` sans destination ; le visiteur qui
 * s'inscrivait par eux arrivait toujours au tableau de bord, son idée perdue.
 *
 * Ce test tient le BRANCHEMENT des pages ; l'aller-retour chez le fournisseur est
 * tenu par `app/routes/oauth-garde-la-destination.spec.ts` (vraies routes contre
 * un vrai serveur HTTP). Aucun cookie ici : il tourne aussi sur WebKit.
 */

/*
 * La disponibilité vient de la même API que le loader. Une liste vide n'est
 * pas une preuve : les deux fournisseurs doivent être explicitement mesurés.
 * Le rendu des fournisseurs prêts, y compris leur destination, est aussi tenu
 * par signup.oauth-availability.spec.tsx avec le vrai loader et le vrai écran.
 */
const apiBaseUrl =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function availableProviders(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get(`${apiBaseUrl}/auth/oauth/providers`);
  expect(response.ok()).toBe(true);

  const { providers } = (await response.json()) as { providers: Array<{ provider: string; ready: boolean }> };
  expect(providers.map(({ provider }) => provider).sort()).toEqual(['github', 'google']);

  for (const provider of providers) {
    expect(typeof provider.ready).toBe('boolean');
  }

  return providers.filter(({ ready }) => ready).map(({ provider }) => provider);
}

for (const page of ['/register']) {
  test(`${page} : les boutons des fournisseurs gardent la destination du visiteur`, async ({
    page: onglet,
    request,
  }) => {
    const providers = await availableProviders(request);
    await onglet.goto(`${page}?returnTo=%2Fprojects%2Fnew`);

    const liens = onglet.locator('a[href^="/auth/oauth/"]');

    await expect(onglet.locator('button[type="submit"]')).toBeVisible();
    await expect(liens).toHaveCount(providers.length);

    for (const provider of providers) {
      await expect(onglet.locator(`a[href^="/auth/oauth/${provider}"]`)).toBeVisible();
    }

    for (const href of await liens.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')))) {
      expect(href, 'chaque bouton porte la destination').toMatch(/^\/auth\/oauth\/[a-z]+\?returnTo=%2Fprojects%2Fnew$/);
    }
  });

  test(`${page} sans destination : les boutons restent nus`, async ({ page: onglet, request }) => {
    const providers = await availableProviders(request);
    await onglet.goto(page);

    const liens = onglet.locator('a[href^="/auth/oauth/"]');

    await expect(onglet.locator('button[type="submit"]')).toBeVisible();
    await expect(liens).toHaveCount(providers.length);

    for (const provider of providers) {
      await expect(onglet.locator(`a[href^="/auth/oauth/${provider}"]`)).toBeVisible();
    }

    for (const href of await liens.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')))) {
      expect(href).toMatch(/^\/auth\/oauth\/[a-z]+$/);
    }
  });
}
