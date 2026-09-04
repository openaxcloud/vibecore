import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * SCR-010 — « l'espace ENTRE les titres / colonnes du menu en pied de page est
 * encore trop grand » (Avi).
 *
 * À NE PAS confondre avec SCR-009, qui portait sur la chasse À L'INTÉRIEUR des
 * titres (`tracking`). Ici c'est la grille du `<nav>` du pied de page qui creuse
 * le vide ENTRE les groupes de liens.
 *
 * Mesuré live le 20/08 sur prod `web:73c4edc166`, 3 formats × 2 thèmes :
 * `column-gap: 40px` / `row-gap: 20px` partout — l'espacement ne dépend pas du
 * thème, seule la grille décide.
 *
 * Ce test lit la SOURCE plutôt que de monter le composant : le rendu réel dépend
 * d'UnoCSS, absent de l'environnement de test, donc `getComputedStyle` y
 * renverrait des valeurs vides et le test serait vert quoi qu'il arrive — le faux
 * vert exact que SCR-009 a déjà produit une fois.
 */
const SOURCE = readFileSync(new URL('./EcodeExactShell.tsx', import.meta.url), 'utf8');

function classesDuNavPiedDePage() {
  const m = /<nav aria-label=\{copy\.a11y\.footerNavigation\} className="([^"]+)"/.exec(SOURCE);

  return m?.[1] ?? null;
}

describe('SCR-010 — espacement entre les colonnes du pied de page', () => {
  it('trouve bien la nav du pied de page (sinon le reste ne prouve rien)', () => {
    expect(classesDuNavPiedDePage()).not.toBeNull();
  });

  it('resserre la gouttière entre colonnes : plus de gap-x-10 (40px)', () => {
    const classes = classesDuNavPiedDePage() ?? '';

    expect(classes).not.toMatch(/\bgap-x-10\b/);
    expect(classes).toMatch(/\bgap-x-6\b/);
  });

  it('resserre l’écart vertical entre groupes empilés : plus de gap-y-5 (20px)', () => {
    const classes = classesDuNavPiedDePage() ?? '';

    expect(classes).not.toMatch(/\bgap-y-5\b/);
    expect(classes).toMatch(/\bgap-y-3\b/);
  });

  it('garde 2 colonnes dès le plus petit écran et 4 au bureau', () => {
    const classes = classesDuNavPiedDePage() ?? '';

    expect(classes).toMatch(/\bgrid-cols-2\b/);
    expect(classes).toMatch(/\blg:grid-cols-4\b/);
  });

  /*
   * AV-UX point 11 (25/08) — Avi : « titres encore trop espacés » malgré
   * SCR-009/010. Le pas d'une ligne de lien était 52px (44px + space-y-2).
   * Désormais : 44px en tactile (space-y-0), 32px au bureau (lg:min-h-8,
   * au-dessus du minimum WCAG 2.2 de 24px).
   */
  it('garde les cibles tactiles de 44px en mobile/tablette, resserre à 32px au bureau', () => {
    expect(SOURCE).toMatch(/min-h-11 min-w-11 lg:min-h-8 items-center/);
  });

  it('supprime la marge décorative entre lignes de liens (la rangée espace déjà)', () => {
    expect(SOURCE).toMatch(/<ul role="list" className="mt-2 space-y-0 text-\[13px\]">/);
    expect(SOURCE).not.toMatch(/space-y-2 text-\[13px\]/);
  });
});
