import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * IOS-ZOOM-001 — garde-fou sur la RÈGLE, doublé par un test E2E qui mesure la
 * police réellement rendue (`tests/e2e/ios-input-zoom.spec.ts`).
 *
 * Le fichier est lu COMMENTAIRES RETIRÉS : la prose cite `user-scalable=no` et
 * `1rem` pour expliquer ce qu'on refuse de faire, et un test qui lit ses propres
 * commentaires ne prouve rien.
 */

const ROOT = join(__dirname, '..', '..');
const INDEX = readFileSync(join(__dirname, 'index.scss'), 'utf8');
const CODE = INDEX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Le bloc IOS-ZOOM-001, sans commentaires. */
function zoomRule(): string {
  const marker = CODE.indexOf("input:not([type='checkbox'])");
  expect(marker, 'la règle anti-zoom est introuvable').toBeGreaterThan(-1);

  /*
   * Fenêtre fermée sur l'accolade de la règle : au-delà, on déborderait sur le
   * bloc `@media` suivant, dont le contenu n'a rien à voir.
   */
  const end = CODE.indexOf('}', CODE.indexOf('{', marker));

  return CODE.slice(marker, end + 1);
}

describe('IOS-ZOOM-001 — les champs ne descendent pas sous le seuil de Safari', () => {
  it('impose 16px, en PIXELS — en rem la base les dégonflerait', () => {
    const rule = zoomRule();
    const size = rule.match(/font-size:\s*([^;]+);/)?.[1] ?? '';

    expect(size).toMatch(/16px/);
    expect(size).not.toMatch(/rem/);
  });

  it('couvre les trois familles de champ texte', () => {
    const rule = zoomRule();

    expect(rule).toMatch(/\binput\b/);
    expect(rule).toMatch(/\btextarea\b/);
    expect(rule).toMatch(/\bselect\b/);
  });

  it('exclut les champs non textuels, dont la boîte serait déformée', () => {
    const rule = zoomRule();

    for (const type of ['checkbox', 'radio', 'range', 'color', 'file']) {
      expect(rule).toMatch(new RegExp(`:not\\(\\[type='${type}'\\]\\)`));
    }
  });

  it('n’interdit jamais le zoom volontaire dans la balise viewport', () => {
    /*
     * La solution de facilité — et un vrai défaut d'accessibilité. On la refuse
     * partout, pas seulement dans cette feuille : le balisage de la page porte
     * la balise.
     */
    const sources = ['app/root.tsx', 'app/styles/index.scss'];

    for (const relative of sources) {
      let content = '';

      try {
        content = readFileSync(join(ROOT, relative), 'utf8');
      } catch {
        continue;
      }

      /*
       * COMMENTAIRES RETIRÉS. Sans cela, la prose qui explique ce qu'on refuse
       * de faire — et qui cite donc `user-scalable=no` — ferait tomber le cas.
       * Piège rencontré ici même, sur mon propre commentaire.
       */
      const sansCommentaires = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      expect(sansCommentaires).not.toMatch(/user-scalable\s*=\s*(no|0)/);
      expect(sansCommentaires).not.toMatch(/maximum-scale\s*=\s*1(\.0)?[,"']/);
    }
  });

  it('ne touche pas la base rem, qui porte la densité assumée du produit', () => {
    expect(zoomRule()).not.toMatch(/--vc-type-interface-size/);
    expect(INDEX).toMatch(/--vc-type-interface-size:\s*12px/);
    expect(INDEX).toMatch(/--vc-type-interface-size:\s*14px/);
  });
});
