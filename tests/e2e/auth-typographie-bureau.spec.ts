import { expect, test } from '@playwright/test';

/**
 * AUTH-TYPO-001 — l'échelle typographique des pages d'authentification, sur BUREAU.
 *
 * Mesuré le 2026-09-30 sur la production, /signup et /login en 1440×900, clair
 * et sombre : TOUT le texte de la page rendu à 12 px. Le titre « Créez votre
 * compte » (écrit `text-[clamp(2rem,9vw,2.75rem)]`) à 14 px, le titre du panneau
 * de droite (`text-[clamp(2.25rem,4vw,3.25rem)]`) à 14 px, les chiffres « 21 » et
 * « 29+ » (`text-3xl`) à 12 px, le bouton « Créer le compte » (`text-[13px]`) à
 * 12 px.
 *
 * Cause : les règles globales de densité de l'IDE (`body :where(h1…h6)` en
 * `!important`, `body :where(div, span, p…)`) aplatissent toute classe de taille.
 * L'accueil et la zone utilisateur restaurent leur échelle par un bloc dédié ;
 * les pages d'authentification n'en avaient pas.
 *
 * Mesure sur le RENDU (`getComputedStyle`), jamais sur les classes : les classes
 * étaient déjà les bonnes.
 *
 * Bureau seulement : l'affichage mobile est gelé sur la référence d'Avi, ce
 * correctif ne s'applique qu'à partir de 1024 px.
 */

const VIEWPORTS = [
  { label: 'bureau 1440', width: 1440, height: 900 },
  { label: 'bureau 1280', width: 1280, height: 800 },
] as const;

const THEMES = ['light', 'dark'] as const;
const ROUTES = ['/signup', '/login'] as const;

type Mesure = { titre: number; heroTitre: number; chiffre: number; soumission: number; description: number };

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const route of ROUTES) {
      test(`${route} — ${viewport.label} — ${theme} : l'échelle typographique est rendue`, async ({
        page,
        context,
      }) => {
        const host = new URL(test.info().project.use.baseURL ?? 'http://localhost:5173').hostname;
        await context.addCookies([{ name: 'ecode_theme', value: theme, domain: host, path: '/' }]);
        await page.addInitScript((t) => {
          try {
            localStorage.setItem('bolt_theme', t);
          } catch {}
        }, theme);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route, { waitUntil: 'domcontentloaded' });

        const titre = page.locator('h1.vc-auth-title');
        await expect(titre).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const m: Mesure = await page.evaluate(() => {
          const px = (el: Element | null) => (el ? Number.parseFloat(getComputedStyle(el).fontSize) : Number.NaN);
          const hero = document.querySelector('.vc-auth-page h2');

          return {
            titre: px(document.querySelector('h1.vc-auth-title')),
            heroTitre: px(hero),
            chiffre: px(document.querySelector('.vc-auth-page .text-3xl')),
            soumission: px(document.querySelector('.vc-auth-submit')),
            description: px(document.querySelector('.vc-auth-description')),
          };
        });

        // Le titre de la page domine clairement le texte courant.
        expect(m.titre, 'titre « Créez votre compte » / « Bon retour »').toBeGreaterThanOrEqual(32);

        // Le titre du panneau de droite aussi.
        expect(m.heroTitre, 'titre du panneau de droite').toBeGreaterThanOrEqual(30);

        // Les chiffres mis en avant (`text-3xl`).
        expect(m.chiffre, 'chiffres « 21 » / « 29+ »').toBeGreaterThanOrEqual(28);

        // Le bouton d'action principal n'est pas plus petit que ce que le balisage demande.
        expect(m.soumission, 'bouton de soumission').toBeGreaterThanOrEqual(13);
        expect(m.description, 'description sous le titre').toBeGreaterThanOrEqual(14);

        // Et la hiérarchie tient : titre au moins deux fois le texte courant.
        expect(m.titre).toBeGreaterThanOrEqual(m.description * 2);
      });
    }
  }
}
