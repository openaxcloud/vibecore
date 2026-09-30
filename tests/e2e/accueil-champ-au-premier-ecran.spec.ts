import { expect, test } from '@playwright/test';

/*
 * BUG-QA0928-COSMETIQUES, point 2 — sur iPhone, en français, le champ « Décrivez
 * votre idée » commençait SOUS le premier écran : haut à 689 px pour 664 px de
 * hauteur utile (iPhone 13), mesuré le 28/09 en production puis le 30/09 en
 * local, à l'identique. L'appel à l'action de la page n'était pas visible sans
 * défiler.
 *
 * Cause : 80 px de marge au-dessus du badge, sous un en-tête de 65 px, et un
 * titre à 44 px (échelle voulue, `ecode-homepage-hero.spec.ts`) qui passe à six
 * lignes en français sur WebKit contre trois en anglais. La typographie ne
 * bouge pas ; c'est l'espacement mobile qui se resserre.
 *
 * Le critère est le champ ENTIER, pas son bord : un bord de 2 px qui dépasse
 * n'invite personne à taper. Tourne sur `webkit-iphone` — le moteur où le
 * titre prend le plus de lignes.
 */

for (const locale of ['fr-FR', 'en-US'] as const) {
  test.describe(`accueil, ${locale}`, () => {
    test.use({ locale });

    test('le champ d’idée tient entièrement dans le premier écran', async ({ page, viewport }) => {
      /*
       * Périmètre : les largeurs mobiles, où le défaut a été mesuré. Au-delà de
       * 640 px l'échelle du titre change (`sm:text-6xl` et plus) ; le bureau
       * 1280 × 720 déborde aussi, mais c'est un autre arbitrage — consigné à
       * part dans BUG-QA0928-COSMETIQUES, pas tranché ici.
       */
      test.skip((viewport?.width ?? 0) >= 640, 'hors périmètre mobile');

      await page.goto('/');

      const champ = page.getByPlaceholder(/Describe your app idea|Décrivez/i).first();
      await expect(champ).toBeVisible();

      const langue = await page.evaluate(() => document.documentElement.lang);
      expect(langue, 'la locale du contexte a bien été appliquée').toBe(locale.slice(0, 2));

      const boite = await champ.boundingBox();
      const hauteurUtile = await page.evaluate(() => window.innerHeight);

      expect(boite, 'le champ a une boîte').not.toBeNull();
      expect(
        boite!.y + boite!.height,
        `bas du champ (${Math.round(boite!.y + boite!.height)} px) dans les ${hauteurUtile} px du premier écran`,
      ).toBeLessThanOrEqual(hauteurUtile);
    });
  });
}
