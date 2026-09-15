import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TACTILE-003 — plancher tactile des pages d'authentification.
 *
 * Mesuré sur la production, /login en 390 : 12 contrôles sous 44px, dont le
 * bouton « Se connecter » à 42px.
 *
 * La cause n'est pas un balisage négligent — il demande déjà `h-12` et
 * `min-h-11`, les bonnes valeurs. C'est que `--vc-type-interface-size`
 * redéfinit la base rem (12px en desktop, 14px sous 1024px) : tout utilitaire
 * Tailwind exprimé en rem est dégonflé de 25 % / 12,5 %.
 *
 * Le test vérifie donc deux choses distinctes :
 *   1. le plancher est exprimé en PIXELS, la seule unité que la base rem ne
 *      peut pas déformer ;
 *   2. il couvre les contrôles autonomes, et PAS les liens en ligne dans une
 *      phrase, que WCAG 2.2 (2.5.8) exempte.
 */

const INDEX = readFileSync(join(__dirname, 'index.scss'), 'utf8');

/**
 * Le bloc du plancher tactile, isolé du reste de la feuille.
 *
 * ANCRÉ SUR DU CODE, PAS SUR UNE PROSE. La version précédente cherchait la
 * chaîne « TACTILE-003 », qui n'existe que dans un commentaire — et un autre
 * commentaire, ailleurs dans la feuille, s'est mis à la citer pour expliquer que
 * la même cause s'y appliquait. Le test s'est alors mis à découper la mauvaise
 * région et à tomber pour une raison qui n'avait rien à voir.
 *
 * La règle générale : un test qui lit du code source retire les commentaires, et
 * ne s'ancre jamais sur eux. Ici le repère est le sélecteur lui-même.
 */
function touchBlock(): string {
  const start = INDEX.indexOf('.vc-auth-input,\n.vc-auth-submit,');
  expect(start, 'le bloc du plancher tactile est introuvable').toBeGreaterThan(-1);

  return INDEX.slice(start, start + 4000);
}

/**
 * Le bloc SANS ses commentaires.
 *
 * Les cas qui vérifient une ABSENCE doivent lire le code seul : la prose qui
 * explique pourquoi un sélecteur est exclu le CITE, et un test qui lit ses
 * propres commentaires ne prouve rien. Piège rencontré pour de vrai sur #268.
 */
function touchCode(): string {
  return touchBlock()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('TACTILE-003 — le plancher tactile des pages d’authentification', () => {
  const CONTROLES_AUTONOMES = [
    '.vc-auth-input',
    '.vc-auth-submit',
    '.vc-auth-secondary-action',
    '.vc-auth-back-link',
    '.vc-auth-input-action',
    '.vc-auth-link.inline-flex',
    '.vc-auth-inline-link.inline-flex',
    '.vc-auth-checkbox-label',
  ];

  it('couvre chaque contrôle autonome mesuré sous 44px', () => {
    const block = touchBlock();

    for (const selector of CONTROLES_AUTONOMES) {
      expect(block).toContain(selector);
    }
  });

  it('exprime le plancher en pixels — une valeur en rem serait dégonflée par la base', () => {
    const block = touchBlock();
    const floors = block.match(/min-(?:height|width)\s*:\s*([^;]+);/g) ?? [];

    expect(floors.length).toBeGreaterThan(0);

    for (const floor of floors) {
      expect(floor).toMatch(/44px/);
      expect(floor).not.toMatch(/rem/);
    }
  });

  it('n’élargit pas les liens en ligne dans une phrase, que WCAG 2.2 exempte', () => {
    const code = touchCode();

    /*
     * `.vc-auth-link` NU (sans `.inline-flex`) toucherait « Inscrivez-vous
     * gratuitement » et « Conditions d'utilisation », qui vivent au milieu d'un
     * paragraphe : les grandir casserait la ligne de texte.
     */
    expect(code).not.toMatch(/^\s*\.vc-auth-link\s*[,{]/m);

    /*
     * `.vc-auth-inline-link` NU reste exclu ; seule sa forme `inline-flex` —
     * c'est-à-dire un contrôle autonome — est couverte.
     */
    expect(code).not.toMatch(/\.vc-auth-inline-link(?!\.inline-flex)/);
  });

  it('ne touche pas la base rem, qui porte la densité assumée du produit', () => {
    const block = touchBlock();

    expect(block).not.toMatch(/--vc-type-interface-size\s*:/);

    // La base reste celle que l'équipe a choisie, à son emplacement d'origine.
    expect(INDEX).toMatch(/--vc-type-interface-size:\s*12px/);
    expect(INDEX).toMatch(/--vc-type-interface-size:\s*14px/);
  });

  it('retombe sur 44px là où --vc-touch-min n’est pas défini', () => {
    const block = touchBlock();

    /*
     * La coque IDE définit `--vc-touch-min`; les pages d'authentification n'en
     * dépendent pas. Sans repli, le plancher disparaîtrait hors de l'IDE.
     */
    for (const floor of block.match(/min-(?:height|width)\s*:\s*([^;]+);/g) ?? []) {
      expect(floor).toMatch(/var\(--vc-touch-min,\s*44px\)/);
    }
  });
});
