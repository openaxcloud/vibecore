import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { createGenerator, presetUno } from 'unocss';
import { describe, expect, it } from 'vitest';

/**
 * TACTILE-004 — `min-h-11` ne rend PAS 44px dans ce produit.
 *
 * `11` est la classe canonique pour « 44px » et 373 endroits l'écrivent en
 * croyant poser le plancher tactile. UnoCSS l'émet en `2.75rem`, et
 * `--vc-type-interface-size` redéfinit la base rem à 12px (desktop) / 14px
 * (<=1024px) : le rendu est donc 33px / 38,5px. Jamais 44.
 *
 * C'est la cause commune des trois points
 * BUG-QA-TAP-TARGETS-{MARKETING,IDE-MOBILE,APP}-001, dont les intitulés
 * renvoient déjà à BUG-QA-REM-BASE-12-14PX-001 : trois symptômes, une cause.
 *
 * DEUX MÉCANISMES, DEUX TESTS :
 *   1. l'arithmétique — la base rem vaut bien 12/14px, et `min-h-11` est bien
 *      émis en rem. C'est ce qui rend le piège réel ; si l'un des deux changeait,
 *      le correctif n'aurait plus lieu d'être et il faudrait le savoir.
 *   2. le plancher — sous 1024px, un contrôle portant cette classe atteint 44px,
 *      en PIXELS, seule unité que la base rem ne peut pas déformer.
 */

const CSS = compile(join(__dirname, 'index.scss'), { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Valeur d'un jeton dans un bloc donné de la feuille COMPILÉE (préfixes NON cités). */
function jeton(prefixe: string, nom: string) {
  for (const [, selecteur, corps] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selecteur.trim().split('\n').pop()!.trim() !== prefixe) {
      continue;
    }

    const trouve = corps.match(new RegExp(`${nom}:\\s*([^;]+)`));

    if (trouve) {
      return trouve[1].trim();
    }
  }

  return undefined;
}

describe('TACTILE-004 — plancher tactile face à la base rem redéfinie', () => {
  it('MÉCANISME 1a — UnoCSS émet bien `min-h-11` en REM, pas en pixels', async () => {
    /*
     * Mesuré en exécutant le générateur, pas supposé : si le projet passait un
     * jour à une sortie en pixels, le piège disparaîtrait et ce test doit le
     * dire plutôt que de laisser un correctif devenu inutile.
     */
    const uno = createGenerator({ presets: [presetUno()] });
    const { css } = await uno.generate('min-h-11', { preflights: false });

    expect(css).toContain('min-height:2.75rem');
  });

  it('MÉCANISME 1b — la base rem est bien redéfinie sous 16px', () => {
    /* `:root` porte la valeur desktop ; le bloc <=1024px porte la valeur tactile. */
    const desktop = jeton(':root', '--vc-type-interface-size');

    expect(desktop, 'base rem desktop').toBe('12px');

    const compact = CSS.match(/@media \(max-width: 1024px\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1];

    expect(compact, 'bloc <=1024px').toBeTruthy();
    expect(compact).toMatch(/--vc-type-interface-size:\s*14px/);

    /* L'arithmétique qui fait le défaut : 2,75rem sous ces bases. */
    expect(2.75 * 12, 'rendu desktop').toBeLessThan(44);
    expect(2.75 * 14, 'rendu tactile').toBeLessThan(44);
  });

  it('MÉCANISME 2 — sous 1024px, la classe atteint 44px en PIXELS', () => {
    const bloc = CSS.match(/@media \(max-width: 1024px\)\s*\{\s*\.min-h-11,\s*\.h-11\s*\{([^}]*)\}/);

    expect(bloc, 'le plancher doit exister et viser les deux classes').toBeTruthy();
    expect(bloc![1], 'exprimé en pixels, jamais en rem').toMatch(/min-height:\s*var\(--vc-touch-min, 44px\)/);
    expect(bloc![1], 'une valeur en rem serait à nouveau dégonflée par la base').not.toMatch(/rem/);
  });

  it('MÉCANISME 2b — la LARGEUR aussi, sinon un bouton carré reste à moitié corrigé', async () => {
    /*
     * Une cible tactile a DEUX dimensions. La première version de ce correctif
     * ne posait que la hauteur : un bouton `min-h-11 min-w-11` rendait alors
     * 44px de haut sur 33 de large. Mesuré en réel à 390 par la session du
     * panneau Agent : 42x59 sur le repli des actions d'un artefact.
     */
    const uno = createGenerator({ presets: [presetUno()] });
    const { css } = await uno.generate('min-w-11 w-11', { preflights: false });

    expect(css, 'les classes de largeur sortent du même rem').toContain('min-width:2.75rem');

    const bloc = CSS.match(/@media \(max-width: 1024px\)\s*\{[\s\S]*?\.min-w-11,\s*\.w-11\s*\{([^}]*)\}/);

    expect(bloc, 'le plancher de largeur doit exister').toBeTruthy();
    expect(bloc![1], 'en pixels, jamais en rem').toMatch(/min-width:\s*var\(--vc-touch-min, 44px\)/);
    expect(bloc![1]).not.toMatch(/rem/);
  });

  it('le jeton de plancher vaut bien 44px, en pixels', () => {
    expect(jeton(':root', '--vc-touch-min')).toBe('44px');
  });

  it('la densité DESKTOP n’est pas touchée — le plancher reste sous 1024px', () => {
    /*
     * Contre-garde. Remonter la base rem à 16px « corrigerait » aussi le calcul,
     * mais redimensionnerait toute l'interface de 33% : la densité desktop est
     * un choix produit assumé, pas un défaut.
     */
    const horsMedia = CSS.slice(0, CSS.indexOf('@media'));

    expect(horsMedia, 'aucun plancher tactile global hors media query').not.toMatch(
      /\.min-h-11\s*,?\s*\.?h?-?1?1?\s*\{/,
    );
    expect(jeton(':root', '--vc-type-interface-size'), 'la base rem reste celle du produit').toBe('12px');
  });
});
