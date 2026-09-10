import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

/**
 * LIBELLE-9PX-001 — `label`, `legend` et `th` rendaient 9px sur mobile.
 *
 * La règle de micro-libellé vise des étiquettes DÉCORATIVES en capitales, mais
 * son sélecteur liste aussi les éléments SÉMANTIQUES :
 *
 *   body :where(.uppercase, [class*=uppercase], label, legend, th, …) {
 *     font-size: var(--vc-type-label-size) !important;   // 9px sous 1024px
 *   }
 *
 * Mesuré à 390px, base rem 14px : 96 `<th>` portent du texte DIRECT (en-têtes
 * de tableaux du journal d'accès, des tickets d'assistance…), tous rendus à
 * 9px ; et `!important` BAT la taille écrite par l'auteur, si bien qu'un
 * `<label className="text-[12px]">` rend 9px et non 12.
 *
 * Sur 105 `<label>` porteurs d'une classe, 2 seulement demandent `uppercase` :
 * les 103 autres subissent un traitement décoratif qu'ils n'ont pas choisi.
 */

const CSS = compile(join(__dirname, 'index.scss'), { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Jetons actifs à une largeur donnée (base + `@media` applicables). */
function jetons(largeur: number): Map<string, string> {
  const out = new Map<string, string>();

  const absorber = (src: string) => {
    for (const m of src.matchAll(/(--[\w-]+):\s*([^;]+)/g)) {
      out.set(m[1], m[2].trim());
    }
  };

  absorber(CSS.replace(/@media[^{]+\{[\s\S]*?\n\}/g, ''));

  for (const m of CSS.matchAll(/@media([^{]+)\{([\s\S]*?)\n\}/g)) {
    const trop = [...m[1].matchAll(/\(max-width:\s*(\d+)px\)/g)].some((x) => largeur > Number(x[1]));
    const pasAssez = [...m[1].matchAll(/\(min-width:\s*(\d+)px\)/g)].some((x) => largeur < Number(x[1]));

    if (!trop && !pasAssez) {
      absorber(m[2]);
    }
  }

  return out;
}

const pixels = (valeur: string | undefined) => (valeur ? Number.parseFloat(valeur) : Number.NaN);

describe('LIBELLE-9PX-001 — plancher de lisibilité des libellés sémantiques', () => {
  it('la sonde lit bien la feuille compilée', () => {
    expect(CSS.length, 'feuille lue').toBeGreaterThan(100000);
    expect(jetons(390).size, 'jetons résolus à 390').toBeGreaterThan(50);
  });

  it('le défaut est réel — la règle décorative pose bien 9px à 390', () => {
    /*
     * Sans cette mesure, le plancher pourrait être posé contre un problème qui
     * n'existe pas. On vérifie la valeur, pas l'intention.
     */
    expect(pixels(jetons(390).get('--vc-type-label-size')), 'micro-libellé à 390').toBeLessThanOrEqual(9);
    expect(CSS, 'la règle décorative liste bien les éléments sémantiques').toMatch(
      /body :where\(\.uppercase,[^)]*\blabel\b[^)]*\bth\b[^)]*\)/,
    );
  });

  it('MÉCANISME 1 — un plancher existe pour label/legend/th sous 1024px', () => {
    const bloc = CSS.match(/@media \(max-width: 1024px\)\s*\{\s*body :where\(label, legend, th\)\s*\{([^}]*)\}/);

    expect(bloc, 'le plancher doit exister').toBeTruthy();
    expect(bloc![1], 'exprimé en pixels via un jeton, jamais en rem').toMatch(/font-size:[^;]*!important/);
    expect(bloc![1], 'une valeur en rem serait déformée par la base 12/14px').not.toMatch(/\d\s*rem/);
  });

  it('MÉCANISME 2 — le plancher vient APRÈS la règle décorative, sinon il ne sert à rien', () => {
    /*
     * Les deux règles ont la MÊME spécificité (`body` + `:where(…)` qui ne
     * compte pas) et portent toutes deux `!important` : c'est l'ORDRE SOURCE
     * qui tranche. Posé plus haut dans la feuille, le plancher est écrasé et
     * n'a AUCUN effet — la sonde serait verte pendant que l'écran reste à 9px.
     */
    const decoratif = CSS.lastIndexOf('body :where(.uppercase');
    const plancher = CSS.lastIndexOf('body :where(label, legend, th)');

    expect(decoratif, 'règle décorative trouvée').toBeGreaterThan(-1);
    expect(plancher, 'plancher trouvé').toBeGreaterThan(-1);
    expect(plancher, 'le plancher doit être APRÈS la règle décorative').toBeGreaterThan(decoratif);
  });

  it('la valeur du plancher est lisible, et bien au-dessus du micro-libellé', () => {
    const t = jetons(390);
    const plancher = pixels(t.get('--vc-type-heading-compact-size'));

    expect(plancher, 'plancher à 390').toBeGreaterThanOrEqual(12);
    expect(plancher, 'et strictement au-dessus du micro-libellé').toBeGreaterThan(
      pixels(t.get('--vc-type-label-size')),
    );
  });

  it('le BUREAU n’est pas touché — la densité assumée reste', () => {
    /*
     * Contre-garde : élargir le plancher hors media query changerait le bureau,
     * où le micro-libellé en capitales est un parti pris.
     */
    const horsMedia = CSS.replace(/@media[^{]+\{[\s\S]*?\n\}/g, '');

    expect(horsMedia, 'aucun plancher global').not.toContain('body :where(label, legend, th)');
  });
});
