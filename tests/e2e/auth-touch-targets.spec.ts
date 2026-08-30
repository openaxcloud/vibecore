import { expect, test } from '@playwright/test';

/**
 * TACTILE-003 — le plancher tactile, mesuré sur le RENDU.
 *
 * Un test qui lit les classes CSS n'aurait rien vu : le balisage demandait
 * déjà `h-12` et `min-h-11`, c'est-à-dire 48 et 44px. C'est la base rem,
 * redéfinie à 12px en desktop et 14px sous 1024px, qui les dégonflait à 36 et
 * 33 / 42 et 38,5. Seule la géométrie réelle du navigateur révèle l'écart.
 *
 * Ce test interroge donc `getBoundingClientRect()` sur les contrôles tels
 * qu'ils sont peints, aux trois formats et dans les deux thèmes.
 */

const TOUCH_FLOOR = 44;

/** Formats à couvrir. La tablette se traite comme le mobile (décision d'Avi). */
const VIEWPORTS = [
  { label: 'mobile 390', width: 390, height: 844 },
  { label: 'tablette 768', width: 768, height: 1024 },
  { label: 'desktop 1280', width: 1280, height: 800 },
] as const;

const ROUTES = ['/login', '/signup', '/forgot-password'] as const;

/**
 * Contrôles AUTONOMES soumis au plancher.
 *
 * Les liens en ligne dans une phrase en sont exclus : WCAG 2.2 (2.5.8) les
 * exempte explicitement, et les agrandir casserait le paragraphe qui les porte.
 * L'exclusion est exprimée par un sélecteur, pas par une liste de libellés, pour
 * qu'une traduction ne la contourne pas.
 */
const SELECTOR = [
  '.vc-auth-input',
  '.vc-auth-submit',
  '.vc-auth-secondary-action',
  '.vc-auth-back-link',
  '.vc-auth-input-action',
  '.vc-auth-link.inline-flex',
  '.vc-auth-checkbox-label',
].join(', ');

type Measured = { selecteur: string; libelle: string; largeur: number; hauteur: number };

async function measure(page: import('@playwright/test').Page): Promise<Measured[]> {
  return page.evaluate((selector) => {
    const identify = (el: Element) => {
      const classes = (el.className || '')
        .toString()
        .split(/\s+/)
        .filter((c) => c.startsWith('vc-auth-'));
      return classes[0] ?? el.tagName.toLowerCase();
    };

    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();

        // Un contrôle masqué ou replié n'a pas de cible à mesurer.
        return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
      })
      .map((el) => {
        const box = el.getBoundingClientRect();

        return {
          selecteur: identify(el),
          libelle: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
            .trim()
            .slice(0, 32),
          largeur: Math.round(box.width * 100) / 100,
          hauteur: Math.round(box.height * 100) / 100,
        };
      });
  }, SELECTOR);
}

for (const viewport of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`cibles tactiles ≥ ${TOUCH_FLOOR}px — ${viewport.label}, thème ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme: theme });

      const tooSmall: Array<Measured & { route: string }> = [];

      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.vc-auth-submit', { timeout: 20_000 });

        const controls = await measure(page);

        /*
         * Une page d'authentification sans aucun contrôle mesurable signifie que
         * le test s'est trompé de page : mieux vaut échouer que passer à vide.
         */
        expect(controls.length, `aucun contrôle trouvé sur ${route}`).toBeGreaterThan(0);

        for (const control of controls) {
          // Tolérance d'un demi-pixel : le navigateur arrondit la géométrie.
          if (control.hauteur < TOUCH_FLOOR - 0.5) {
            tooSmall.push({ ...control, route });
          }
        }
      }

      expect(
        tooSmall,
        tooSmall.map((c) => `${c.route} — ${c.selecteur} « ${c.libelle} » : ${c.hauteur}px`).join('\n'),
      ).toEqual([]);
    });
  }
}

/*
 * Le contre-test : il prouve que la mesure DÉTECTE réellement un dégonflement,
 * au lieu de passer parce qu'elle ne regarde rien. Sans lui, une erreur de
 * sélecteur rendrait toute la suite verte à vide.
 */
test('la mesure détecte un plancher réécrit en rem', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.vc-auth-submit', { timeout: 20_000 });

  const avant = await measure(page);
  const soumissionAvant = avant.find((c) => c.selecteur === 'vc-auth-submit');
  expect(soumissionAvant?.hauteur).toBeGreaterThanOrEqual(TOUCH_FLOOR - 0.5);

  // On réintroduit le défaut : un plancher en rem, que la base dégonfle.
  await page.addStyleTag({
    content: `.vc-auth-submit { min-height: 2.75rem !important; height: 2.75rem !important; }`,
  });

  const apres = await measure(page);
  const soumissionApres = apres.find((c) => c.selecteur === 'vc-auth-submit');

  expect(soumissionApres?.hauteur).toBeLessThan(TOUCH_FLOOR - 0.5);
});
