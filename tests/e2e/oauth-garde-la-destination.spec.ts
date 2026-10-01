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
 * `/register` seulement : `/login` n'affiche un fournisseur que s'il est configuré côté API, ce qui n'est le
 * cas ni en local ni en CI (mesuré : `ready:false` pour les deux) — un test sur `/login` ne mesurerait rien.
 * `/login` passe la même destination au même composant (`AuthOauthButton`).
 */
for (const page of ['/register']) {
  test(`${page} : les boutons des fournisseurs gardent la destination du visiteur`, async ({ page: onglet }) => {
    await onglet.goto(`${page}?returnTo=%2Fprojects%2Fnew`);

    const liens = onglet.locator('a[href^="/auth/oauth/"]');

    // Témoin : la page affiche bien au moins un fournisseur (sinon ce test ne mesurerait rien).
    await expect(liens.first()).toBeVisible({ timeout: 30_000 });

    for (const href of await liens.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')))) {
      expect(href, 'chaque bouton porte la destination').toMatch(/^\/auth\/oauth\/[a-z]+\?returnTo=%2Fprojects%2Fnew$/);
    }
  });

  test(`${page} sans destination : les boutons restent nus`, async ({ page: onglet }) => {
    await onglet.goto(page);

    const liens = onglet.locator('a[href^="/auth/oauth/"]');

    await expect(liens.first()).toBeVisible({ timeout: 30_000 });

    for (const href of await liens.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')))) {
      expect(href).toMatch(/^\/auth\/oauth\/[a-z]+$/);
    }
  });
}
