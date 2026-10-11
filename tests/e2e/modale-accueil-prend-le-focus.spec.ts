import { expect, test } from '@playwright/test';

/*
 * BUG-QA0928-MODALE-SANS-FOCUS — la modale « Comment souhaitez-vous continuer ? »
 * de l'accueil ne prenait pas le focus : clavier et lecteur d'écran restaient
 * dans la page masquée derrière le voile.
 *
 * Mesuré en production le 2026-09-28 : WebKit (iPhone 13) — focus sur un élément
 * de la page (« Plateforme de développement d'entreprise… ») ; Chromium 1440 —
 * focus resté sur « Build now », derrière le voile.
 */

const dansLaModale = () => Boolean(document.activeElement?.closest('[data-testid="build-mode-selector-dialog"]'));

test('la modale de l’accueil prend le focus, le garde, et le rend en se fermant', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/');

  const champ = page.getByPlaceholder(/Describe your app idea|Décrivez votre idée/i).first();

  await expect(champ).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('load');
  await expect(async () => {
    await champ.fill('Un carnet de recettes');
    await expect(champ).toHaveValue('Un carnet de recettes', { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  const bouton = page.getByRole('button', { name: /^(Build now|Créer maintenant)$/i }).first();

  /*
   * L'élément qui a le focus au moment où la modale s'ouvre : le bouton sur
   * Chromium ; sur WebKit, un clic ne donne PAS le focus à un bouton, il reste
   * dans le champ. C'est à lui que le focus doit revenir — le contrat du piège,
   * quel que soit le moteur. Marqué en phase de CAPTURE du clic, donc avant le
   * rendu de la modale : exactement ce que le piège mémorise.
   */
  await page.evaluate(() => {
    document.addEventListener('click', () => document.activeElement?.setAttribute('data-avant-modale', ''), {
      capture: true,
      once: true,
    });
  });
  await bouton.click();
  await expect(page.getByTestId('build-mode-selector-dialog')).toBeVisible();

  await expect.poll(() => page.evaluate(dansLaModale), { message: 'le focus entre dans la modale' }).toBe(true);

  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(dansLaModale), `Tab n°${i + 1} : le focus reste dans la modale`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('build-mode-selector-dialog')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-avant-modale') ?? false), {
      message: 'le focus revient à l’élément qui l’avait avant l’ouverture',
    })
    .toBe(true);
});
