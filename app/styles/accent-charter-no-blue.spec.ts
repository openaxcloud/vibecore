import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CHARTE-IDE-001 — garde-fou contre le retour du bleu dans la famille d'action.
 *
 * Le défaut d'origine n'était pas « quelqu'un a écrit du bleu exprès ». Il était
 * qu'une PARTIE de la famille suivait la marque et l'autre non : l'aplat au repos
 * passait à l'orange, le SURVOL restait sur l'échelle `accent`, qui est bleue.
 * Le bouton virait donc au bleu sous le curseur.
 *
 * Le test lit les VALEURS finales de la famille et refuse toute couleur dont le
 * bleu domine le rouge. Il ne fige aucun ton précis : la charte peut évoluer,
 * elle ne peut simplement plus repartir vers le bleu sans que ce test tombe.
 */

const ROOT = join(__dirname, '..', '..');
const INDEX = readFileSync(join(ROOT, 'app/styles/index.scss'), 'utf8');
const VARIABLES = readFileSync(join(ROOT, 'app/styles/variables.scss'), 'utf8');

/** Familles dont chaque valeur littérale doit rester du côté chaud du spectre. */
const ACTION_FAMILY = [
  '--vc-action-primary',
  '--vc-action-primary-hover',
  '--vc-action-primary-strong',
  '--vc-action-primary-strong-hover',
  '--vc-ide-accent-action',
  '--bolt-elements-item-contentAccent',
  '--bolt-elements-item-backgroundAccent',
];

function literalValuesOf(token: string, source: string): string[] {
  const found: string[] = [];
  const re = new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(source)) !== null) {
    const value = m[1].trim();

    // Les renvois (`var(...)`) sont validés à travers le jeton qu'ils citent.
    if (value.startsWith('var(')) {
      continue;
    }

    for (const hex of value.match(/#[0-9a-fA-F]{6}/g) ?? []) {
      found.push(hex.toLowerCase());
    }
  }

  return found;
}

function isBlueDominant(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return b > r;
}

describe('CHARTE-IDE-001 — la famille d’action ne repart pas au bleu', () => {
  it('déclare au moins une valeur pour chaque jeton surveillé', () => {
    const source = `${INDEX}\n${VARIABLES}`;

    for (const token of ACTION_FAMILY) {
      expect(source).toContain(`${token}:`);
    }
  });

  it('n’a plus une seule valeur à dominante bleue dans la famille d’action', () => {
    const offenders: string[] = [];

    for (const token of ACTION_FAMILY) {
      for (const [name, source] of [
        ['index.scss', INDEX],
        ['variables.scss', VARIABLES],
      ] as const) {
        for (const hex of literalValuesOf(token, source)) {
          if (isBlueDominant(hex)) {
            offenders.push(`${name} → ${token}: ${hex}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('sort contentAccent et backgroundAccent de l’échelle `accent`, qui est bleue', () => {
    // theme('colors.accent.*') vaut #0099FF et ses voisins : y revenir remettrait
    // du bleu sur l'anneau de focus et les indicateurs de chargement.
    for (const token of ['--bolt-elements-item-contentAccent', '--bolt-elements-item-backgroundAccent']) {
      const re = new RegExp(`${token}\\s*:\\s*theme\\('colors\\.(alpha\\.)?accent`, 'g');
      expect(VARIABLES).not.toMatch(re);
    }
  });
});
