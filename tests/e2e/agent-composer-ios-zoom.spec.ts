import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * IOS-ZOOM — la zone de saisie de l'agent, sur toute la plage tactile.
 *
 * C'est LE champ qu'Avi signale, et il n'était couvert par aucun test : le
 * garde-fou existant ne visitait que `/login`, `/signup`, `/register` et
 * `/forgot-password` — des pages qui posent déjà une taille explicite et qui
 * n'ont donc jamais eu le défaut. Un test vert sur une surface saine.
 *
 * Mesuré sur le code de `main`, la zone de saisie de l'agent rend **14 px à
 * toutes les largeurs de 390 à 1024** — pas seulement en mobile. Deux causes
 * cumulées :
 *
 *   1. la borne. Le bloc dédié (`_ios-input-zoom.scss`) s'arrêtait à 639.98 px :
 *      entre 640 et 1023 px, plus aucun plancher ne s'appliquait ;
 *   2. la spécificité. Dans la liste `input:not(…)…, textarea, select`, la
 *      spécificité se calcule PAR SÉLECTEUR : la branche `input` porte cinq
 *      `:not([type=…])` — (0,5,1), elle gagne — mais `textarea` et `select`
 *      pèsent (0,0,1) et perdent contre la moindre règle de classe. La zone de
 *      saisie de l'agent est un `<textarea>`.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const SEUIL_IOS = 16;

/** Les bornes de la plage où Safari iOS zoome, pas deux points au hasard. */
const LARGEURS = [390, 640, 768, 900, 1023] as const;

async function creerProjet(request: APIRequestContext) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let corps = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `zoom-agent-${suffixe}-${essai}@local.test`,
        password: 'Password123!',
        name: 'Zoom agent',
        organizationName: `Zoom agent ${suffixe}-${essai}`,
      },
    });

    corps = await inscription.text();

    if (inscription.ok()) {
      const auth = JSON.parse(corps) as { token: string; organization: { id: string } };

      const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Zoom agent' },
      });
      expect(projet.ok(), await projet.text()).toBeTruthy();

      return { token: auth.token, projectId: (await projet.json()).project.id as string };
    }

    // /auth/register est limité par IP ; on patiente plutôt que de rougir la suite.
    if (inscription.status() === 429 && essai < 3) {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible de préparer un projet de test : ${corps}`);
}

test('la zone de saisie de l’agent tient 16px sur TOUTE la plage tactile', async ({ page, request }) => {
  test.setTimeout(300_000);

  const { token, projectId } = await creerProjet(request);
  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

  const fautifs: string[] = [];

  let mesures = 0;

  for (const largeur of LARGEURS) {
    await page.setViewportSize({ width: largeur, height: 900 });
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const champ = page.locator('.bolt-project-chatbox textarea');
    await expect(champ, `la zone de saisie n’est pas apparue en ${largeur}px`).toBeVisible({ timeout: 120_000 });

    /*
     * La mesure RE-RÉSOUT le sélecteur à chaque essai : le composer se re-rend
     * entre la résolution du locator et l'évaluation, et `getComputedStyle` sur
     * un nœud DÉTACHÉ rend la chaîne vide, donc `parseFloat` rend NaN. Le
     * sondage ne relâche rien — il s'arrête au premier relevé exploitable,
     * quelle que soit sa valeur.
     */
    let police = Number.NaN;

    await expect
      .poll(
        async () => {
          police = await page
            .locator('.bolt-project-chatbox textarea')
            .evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
            .catch(() => Number.NaN);

          return Number.isFinite(police);
        },
        { message: `police non mesurée en ${largeur}px`, timeout: 30_000 },
      )
      .toBe(true);

    mesures += 1;

    if (police < SEUIL_IOS) {
      fautifs.push(`${largeur}px → ${police}px`);
    }
  }

  /*
   * Témoin positif : sans lui, un sélecteur périmé donnerait « aucun champ
   * fautif » sur une plage où rien n'a été mesuré.
   */
  expect(mesures, 'aucune largeur n’a été mesurée').toBe(LARGEURS.length);

  expect(fautifs, `la zone de saisie passe sous ${SEUIL_IOS}px : ${fautifs.join(', ')}`).toEqual([]);
});
