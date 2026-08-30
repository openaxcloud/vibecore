import { expect, test } from '@playwright/test';

/**
 * IOS-ZOOM-001 — aucun champ ne doit descendre sous 16 px de police RENDUE.
 *
 * Safari iOS zoome sur tout champ dont la police calculée est inférieure à
 * 16 px, et ne dézoome jamais tout seul. Avi le constate sur la zone de saisie
 * de l'agent : l'écran saute dès qu'il touche le champ.
 *
 * Un test qui lirait les classes ne verrait rien : le balisage écrit `text-base`
 * — donc 1rem, la bonne valeur. C'est la base rem, redéfinie à 14 px sous
 * 1024 px, qui la dégonfle. Seule la police CALCULÉE par le navigateur révèle
 * l'écart, exactement comme pour les cibles tactiles.
 */

const IOS_MIN_FONT_PX = 16;

/** Formats où Safari iOS zoome. Le desktop ne zoome pas au focus. */
const VIEWPORTS = [
  { label: 'mobile 390', width: 390, height: 844 },
  { label: 'tablette 768', width: 768, height: 1024 },
] as const;

const ROUTES = ['/login', '/signup', '/register', '/forgot-password'] as const;

type Field = { libelle: string; balise: string; police: number; type: string };

async function measureFields(page: import('@playwright/test').Page): Promise<Field[]> {
  return page.evaluate(() => {
    const NON_TEXTUEL = ['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'submit', 'button', 'image', 'reset'];

    return Array.from(document.querySelectorAll('input, textarea, select'))
      .filter((el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const type = (el as HTMLInputElement).type ?? '';

        return (
          box.width > 0 &&
          box.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          !NON_TEXTUEL.includes(type)
        );
      })
      .map((el) => ({
        libelle: (
          el.getAttribute('placeholder') ||
          el.getAttribute('aria-label') ||
          el.getAttribute('name') ||
          ''
        ).slice(0, 40),
        balise: el.tagName.toLowerCase(),
        type: (el as HTMLInputElement).type ?? '',
        police: parseFloat(getComputedStyle(el).fontSize),
      }));
  });
}

for (const viewport of VIEWPORTS) {
  test(`aucun champ sous ${IOS_MIN_FONT_PX}px — ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const fautifs: Array<Field & { route: string }> = [];

    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('input, textarea', { timeout: 20_000 });

      const champs = await measureFields(page);

      /*
       * Sans ce garde-fou, une erreur de sélecteur ou une page qui n'a pas fini
       * de rendre donnerait « aucun champ fautif » sur une page jamais regardée.
       * Le compteur transforme un faux négatif silencieux en échec bruyant.
       */
      expect(champs.length, `aucun champ mesuré sur ${route}`).toBeGreaterThan(0);

      for (const champ of champs) {
        if (champ.police < IOS_MIN_FONT_PX) {
          fautifs.push({ ...champ, route });
        }
      }
    }

    expect(
      fautifs,
      fautifs.map((c) => `${c.route} — ${c.balise}[${c.type}] « ${c.libelle} » : ${c.police}px`).join('\n'),
    ).toEqual([]);
  });
}

test('la mesure détecte réellement un champ trop petit', async ({ page }) => {
  /*
   * Le contre-test. Sans lui, une suite verte pourrait simplement signifier que
   * la mesure ne regarde rien — c'est le piège rencontré trois fois aujourd'hui.
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input', { timeout: 20_000 });

  expect((await measureFields(page)).every((c) => c.police >= IOS_MIN_FONT_PX)).toBe(true);

  await page.addStyleTag({ content: `input { font-size: 0.875rem !important; }` });

  expect((await measureFields(page)).some((c) => c.police < IOS_MIN_FONT_PX)).toBe(true);
});

test('la balise viewport n’interdit pas le zoom volontaire', async ({ page }) => {
  /*
   * La solution de facilité pour ce bug est `maximum-scale=1` /
   * `user-scalable=no`. Elle empêche l'utilisateur de zoomer lui-même — un vrai
   * défaut d'accessibilité — et ne corrige pas la cause. Ce cas interdit de la
   * réintroduire par commodité.
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  const contenu = await page.getAttribute('meta[name="viewport"]', 'content');

  expect(contenu).toBeTruthy();
  expect(contenu).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/);
  expect(contenu).not.toMatch(/user-scalable\s*=\s*(no|0)/);
});
