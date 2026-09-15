import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

/**
 * TERMINAL-GEL-001 — l'apparence de l'onglet Terminal/Shell mobile est GELÉE.
 *
 * Règle posée par Avi : l'onglet est gelé sur sa référence (IMG_9149). Il doit
 * FONCTIONNER pour de vrai, comme Replit, mais son apparence ne doit pas
 * bouger. Le correctif de rattachement (BUG-TERM-002 / BUG-QUOTA-001, PR #315)
 * respecte déjà cette règle : il n'a touché que `packages/runtime-remote` et
 * `services/api`, aucune ligne de style — vérifié, 0 ligne ajoutée portant
 * `className`, `style`, une couleur ou un pixel.
 *
 * Ce test transforme la règle en garde. Il prend l'empreinte des déclarations
 * qui DÉCIDENT DE L'APPARENCE du panneau terminal telles qu'elles s'appliquent
 * à 390 px, et refuse tout changement.
 *
 * CE QU'IL NE FAIT PAS — il ne gèle pas le comportement : les règles de
 * disposition pure (`min-width: 0`, `flex`) et tout ce qui vit hors du panneau
 * restent libres. Geler large aurait bloqué du travail légitime et fini par
 * être contourné.
 *
 * POUR CHANGER L'APPARENCE VOLONTAIREMENT : mettre à jour `EMPREINTE` ci-
 * dessous dans le MÊME commit que le changement de style. L'empreinte n'est pas
 * un obstacle, c'est une signature — elle force la décision à être explicite et
 * datée plutôt que subie.
 */

/* Empreinte relevée le 2026-09-01 sur `origin/main`, référence IMG_9149. */
const EMPREINTE = 'a5820de881495d65';

const CSS = compile(join(__dirname, 'index.scss'), { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Propriétés qui décident de ce que l'œil voit. */
const APPARENCE =
  /^(color|background|background-color|border|border-radius|box-shadow|font-size|font-weight|font-family|line-height|padding|text-transform|letter-spacing|opacity)$/;

/** Règles du panneau terminal, déclarations d'apparence seulement, triées. */
function reglesApparence(source: string): string[] {
  const out: string[] = [];

  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = m[1].trim().split('\n').pop()!.trim();

    if (!/bolt-project-bottom-terminal/.test(selecteur)) {
      continue;
    }

    const decls: string[] = [];

    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');

      if (i > 0 && APPARENCE.test(d.slice(0, i).trim())) {
        decls.push(`${d.slice(0, i).trim()}:${d.slice(i + 1).trim()}`);
      }
    }

    if (decls.length) {
      out.push(`${selecteur}{${decls.sort().join(';')}}`);
    }
  }

  return out;
}

/** Ce qui s'applique RÉELLEMENT à 390 px : la base, plus les `@media` actifs. */
function surfaceMobile(): string[] {
  const base = CSS.replace(/@media[^{]+\{[\s\S]*?\n\}/g, '');

  let mobile = '';

  for (const m of CSS.matchAll(/@media([^{]+)\{([\s\S]*?)\n\}/g)) {
    const condition = m[1];
    const trop = [...condition.matchAll(/\(max-width:\s*(\d+)px\)/g)].some((x) => 390 > Number(x[1]));
    const pasAssez = [...condition.matchAll(/\(min-width:\s*(\d+)px\)/g)].some((x) => 390 < Number(x[1]));

    if (!trop && !pasAssez) {
      mobile += m[2];
    }
  }

  return [...reglesApparence(base), ...reglesApparence(mobile)].sort();
}

describe('TERMINAL-GEL-001 — apparence gelée de l’onglet Terminal mobile', () => {
  it('la sonde voit bien le panneau, et ses règles de COULEUR', () => {
    /*
     * Témoin obligatoire : sans lui, un sélecteur renommé rendrait une liste
     * VIDE, dont l'empreinte serait stable — le gel « tiendrait » en ne
     * surveillant plus rien.
     */
    const regles = surfaceMobile();

    expect(regles.length, 'règles d’apparence du panneau terminal').toBeGreaterThan(10);
    expect(
      regles.filter((r) => /(^|;|\{)color:/.test(r)).length,
      'des règles portant une couleur de texte',
    ).toBeGreaterThan(3);
  });

  it('l’apparence n’a pas bougé depuis la référence d’Avi', () => {
    const regles = surfaceMobile();
    const empreinte = createHash('sha256').update(regles.join('\n')).digest('hex').slice(0, 16);

    expect(
      empreinte,
      "L'apparence de l'onglet Terminal mobile est GELÉE sur la référence d'Avi (IMG_9149).\n" +
        'Si ce changement est VOULU, mettre à jour EMPREINTE dans le MÊME commit et le dire dans le message.\n' +
        "S'il ne l'est pas, c'est une régression visuelle sur une surface gelée.\n" +
        `Règles surveillées : ${regles.length}`,
    ).toBe(EMPREINTE);
  });
});
