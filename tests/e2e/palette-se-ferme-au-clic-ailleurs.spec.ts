import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * BUG-QA0928-PALETTE-RESTE-OUVERTE — sur ordinateur, la palette « Search tools,
 * files, and commands… » ouverte depuis la barre d'activité restait par-dessus
 * tous les panneaux ouverts ensuite ; seule la touche Échap la fermait.
 *
 * Mesuré le 2026-09-28 (build de prod local, 1440 px) :
 * {"ouverteParSearch":true,"toujoursVisibleApresClicGit":true,"apresClicDansLaZoneCentrale":true,"apresEchap":false}
 *
 * Cause : au-delà de 1199 px, le calque qui la ferme au clic est en
 * `display: none` (palette voulue non modale), et rien d'autre ne la fermait.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

test.use({ viewport: { width: 1440, height: 900 } });

async function ouvrirUnProjet(request: APIRequestContext) {
  const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `palette-${suffixe}@local.test`,
      password: 'Password123!',
      name: 'Palette',
      organizationName: `Palette ${suffixe}`,
    },
  });

  expect(inscription.ok(), await inscription.text()).toBe(true);

  const auth = (await inscription.json()) as { token: string; organization: { id: string } };

  const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Palette', framework: 'react' },
  });

  const corps = (await projet.json()) as { id?: string; project?: { id: string } };

  return { token: auth.token, projectId: corps.project?.id ?? corps.id! };
}

test('la palette se ferme quand on ouvre un autre panneau ou qu’on clique ailleurs', async ({ page, request }) => {
  test.setTimeout(150_000);

  const { token, projectId } = await ouvrirUnProjet(request);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  // Prêt quand la barre d'activité est là : c'est d'elle que part la palette.
  await expect(page.getByRole('button', { name: /^Search/i }).first()).toBeVisible({ timeout: 120_000 });
  await page.waitForLoadState('load');

  const palette = page.getByTestId('project-command-palette');

  const ouvrir = async () => {
    await page
      .getByRole('button', { name: /^Search/i })
      .first()
      .click();
    await expect(palette, 'témoin : « Search » ouvre bien la palette').toBeVisible({ timeout: 10_000 });
  };

  // 1. Ouvrir un autre panneau depuis la barre d'activité.
  await ouvrir();
  await page.getByRole('button', { name: /^Git/i }).first().click();
  await expect(palette, 'ouvrir « Git » ferme la palette').toBeHidden({ timeout: 5_000 });

  /*
   * 2. Cliquer dans la zone centrale.
   *
   * ⚠️ CE CAS CLIQUAIT UN PIXEL EN DUR : `page.mouse.click(780, 850)`. Mesuré le
   * 2026-10-06 : le projet `chromium` — le seul que joue la suite bloquante —
   * utilise `devices['Desktop Chrome']`, dont la fenêtre fait **1280 × 720**.
   * Le clic tombait donc **130 px SOUS le bord inférieur**, sur rien. Que la
   * palette se ferme ou non dépendait alors de qui écoutait au niveau du
   * document, d'où 6 passages instables sur 15 relevés.
   *
   * Un « clic ailleurs » sans témoin n'est pas un geste reproductible. On clique
   * donc une cible NOMMÉE, et on affirme d'abord qu'elle est bien dans la
   * fenêtre : le jour où la disposition change, le test dit pourquoi au lieu de
   * flotter.
   */
  await ouvrir();

  const ailleurs = page.getByTestId('ide-agent-panel');
  await expect(ailleurs, 'témoin : la cible du « clic ailleurs » existe').toBeVisible({ timeout: 10_000 });

  const cadre = await ailleurs.boundingBox();
  const fenetre = page.viewportSize();

  /*
   * Des `if` explicites plutôt que `expect(...).not.toBeNull()` : TypeScript ne
   * sait pas qu'un `expect` restreint le type, et un `!` non gardé est
   * précisément le genre de raccourci qui rend un échec illisible.
   */
  if (!cadre) {
    throw new Error('la cible du « clic ailleurs » n’a pas de boîte englobante : il n’y a rien à cliquer');
  }

  if (!fenetre) {
    throw new Error('taille de fenêtre inconnue : impossible de vérifier que le clic tombe dedans');
  }

  const x = cadre.x + cadre.width / 2;
  const y = cadre.y + cadre.height / 2;

  expect(
    y,
    `le point visé (${Math.round(x)}, ${Math.round(y)}) tombe hors de la fenêtre ` +
      `${fenetre.width}×${fenetre.height} — c’est exactement le défaut d’origine`,
  ).toBeLessThan(fenetre.height);
  expect(x, 'le point visé sort de la fenêtre en largeur').toBeLessThan(fenetre.width);

  await page.mouse.click(x, y);
  await expect(palette, 'un clic ailleurs ferme la palette').toBeHidden({ timeout: 5_000 });

  // 3. Un clic DANS la palette ne la ferme pas.
  await ouvrir();
  await palette.locator('input').first().click();
  await expect(palette, 'un clic dans la palette la garde ouverte').toBeVisible();

  // 4. Échap, comme avant.
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden({ timeout: 5_000 });
});
