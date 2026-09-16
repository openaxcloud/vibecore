import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/*
 * L'action primaire sortait bleue ou orange SELON LA RÈGLE QUI L'EMPORTAIT.
 *
 * Deux jetons se définissaient l'un par l'autre, et le sens de la dérivation
 * s'inversait d'une coque à l'autre :
 *
 *     :root                  --vc-ide-accent-action: #0099ff
 *                            --vc-action-primary: var(--vc-ide-accent-action)   → BLEU
 *
 *     .vc-user-area-shell    --vc-action-primary: #f97316
 *                            --vc-ide-accent-action: var(--vc-action-primary)   → ORANGE
 *
 * Un cycle de ce genre ne casse rien de façon visible : il rend simplement la
 * couleur dépendante de l'ordre des règles, ce qui produit des boutons bleus
 * apparaissant au hasard dans un produit dont l'action primaire est orange.
 *
 * Ce test interdit tout cycle de définition entre jetons, pas seulement celui-là.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('./index.scss', import.meta.url)), 'utf8');

/** Retire les commentaires : ils CITENT les anciennes définitions pour les expliquer. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** `--a: var(--b)` → arête a → b. Une seule valeur `var()` par déclaration suffit ici. */
function readEdges(css: string): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();

  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    const from = match[1];
    const targets = [...match[2].matchAll(/var\(\s*(--[\w-]+)/g)].map((hit) => hit[1]);

    if (targets.length === 0) {
      continue;
    }

    const set = edges.get(from) ?? new Set<string>();

    for (const target of targets) {
      set.add(target);
    }

    edges.set(from, set);
  }

  return edges;
}

/** Retourne le premier cycle trouvé, sous forme de chemin lisible. */
function findCycle(edges: Map<string, Set<string>>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const path: string[] = [];

  function walk(node: string): string[] | null {
    if (state.get(node) === 'done') {
      return null;
    }

    if (state.get(node) === 'visiting') {
      return [...path.slice(path.indexOf(node)), node];
    }

    state.set(node, 'visiting');
    path.push(node);

    for (const next of edges.get(node) ?? []) {
      const cycle = walk(next);

      if (cycle) {
        return cycle;
      }
    }

    path.pop();
    state.set(node, 'done');

    return null;
  }

  for (const node of edges.keys()) {
    const cycle = walk(node);

    if (cycle) {
      return cycle;
    }
  }

  return null;
}

describe('jetons de couleur : aucune définition circulaire', () => {
  it('index.scss ne contient aucun cycle entre jetons', () => {
    const cycle = findCycle(readEdges(withoutComments(SOURCE)));

    expect(
      cycle,
      cycle ? `cycle de définition : ${cycle.join(' → ')} — la couleur rendue dépendrait de l'ordre des règles` : '',
    ).toBeNull();
  });

  it('l’action primaire porte la valeur, l’accent d’action en dérive', () => {
    const css = withoutComments(SOURCE);

    // Le sens interdit : l'accent d'action ne doit JAMAIS être la source.
    expect(css).not.toMatch(/--vc-action-primary\s*:\s*var\(\s*--vc-ide-accent-action/);

    // Le sens attendu, présent au moins une fois.
    expect(css).toMatch(/--vc-ide-accent-action\s*:\s*var\(\s*--vc-action-primary/);
  });

  it('aucune valeur bleue ne subsiste dans les TEINTES de l’action primaire', () => {
    const css = withoutComments(SOURCE);

    /*
     * Uniquement les jetons qui portent la teinte : fond, survol, ton renforcé.
     * `-foreground` en est exclu — c'est une couleur de TEXTE posée SUR la
     * teinte (#111827 en sombre), et elle a légitimement plus de bleu que de
     * rouge. La confondre avec la teinte reviendrait à interdire le seul
     * premier plan qui passe AA sur l'orange.
     */
    const tints = [...css.matchAll(/(--vc-action-primary(?:-strong|-hover|-strong-hover)?)\s*:\s*(#[0-9a-fA-F]{6})/g)];

    expect(tints.length, 'au moins une teinte déclarée en dur').toBeGreaterThan(0);

    for (const [, token, hex] of tints) {
      const red = Number.parseInt(hex.slice(1, 3), 16);
      const blue = Number.parseInt(hex.slice(5, 7), 16);

      // Un bleu franc a plus de bleu que de rouge ; l'orange de marque l'inverse.
      expect(blue, `${token}: ${hex} n'est pas une teinte de la marque`).toBeLessThan(red);
    }
  });
});
