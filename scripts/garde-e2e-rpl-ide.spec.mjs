/*
 * La famille `rpl-ide-*-proof` bloquait #321 en échouant sur des PRÉCONDITIONS,
 * jamais sur ses assertions métier. Ces gardes tiennent les deux moitiés :
 *
 *   1. le budget est POSÉ et proportionné au travail réel du test ;
 *   2. rien n'est affaibli — les assertions métier sont intactes, l'attente
 *      explicite du champ de palette existe, et les tests ne sont pas désactivés.
 *
 * La garde n°2 existe parce que la tentation, sur un test instable, est de le
 * rendre vert en le relâchant.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PANELS = join(RACINE, 'tests', 'e2e', 'rpl-ide-panels-proof.spec.ts');
const LIVE = join(RACINE, 'tests', 'e2e', 'rpl-ide-live-proof.spec.ts');

/** Commentaires retirés : une garde qui matche un commentaire ne garde rien. */
function codeSeul(chemin) {
  return readFileSync(chemin, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !/^\s*\/\//.test(ligne))
    .join('\n');
}

describe('rpl-ide-*-proof — budget mesuré, assertions intactes', () => {
  it('1. les deux tests posent un budget explicite', () => {
    /*
     * Sans budget explicite, ils héritent des 30 s de `playwright.config.ts`.
     * Or ils prennent 12,5 à 19,9 s en marche normale : une marge de ×1,5 que
     * la moindre contention CI fait sauter.
     */
    for (const f of [PANELS, LIVE]) {
      expect(codeSeul(f)).toMatch(/test\.setTimeout\(90_000\)/);
    }
  });

  it('2. le champ de palette est attendu explicitement, avec un message', () => {
    const code = codeSeul(PANELS);

    expect(code).toMatch(/project-command-palette-search/);
    expect(code).toMatch(/toBeVisible\(\{\s*timeout:\s*15_000/);
    expect(code).toContain('la palette est ouverte mais son champ de recherche ne se monte pas');
  });

  it('3. les assertions métier sont intactes', () => {
    const code = codeSeul(PANELS);

    expect(code).toMatch(/toContainText\(\/studio\/i\)/);
    expect(code).toMatch(/toContainText\(\/domain\/i\)/);
    expect(code).toMatch(/project-command-palette/);
  });

  it('4. aucun des deux tests n’est désactivé', () => {
    for (const f of [PANELS, LIVE]) {
      const code = codeSeul(f);

      expect(code).not.toMatch(/test\.(skip|fixme)\(\s*true/);
      expect(code).not.toMatch(/test\.describe\.skip/);
      expect(code).not.toMatch(/\.only\(/);
    }
  });

  it('5. les deux thèmes sont toujours parcourus', () => {
    for (const f of [PANELS, LIVE]) {
      expect(codeSeul(f)).toMatch(/for \(const theme of \['light', 'dark'\]/);
    }
  });
});
