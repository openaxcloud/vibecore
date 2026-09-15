/*
 * Ce test E2E bloquait les livraisons une fois sur trois. Ces gardes tiennent
 * les deux moitiés de la correction, séparément :
 *
 *   1. la NAVIGATION est robuste — elle est rejouée une fois si le shell IDE
 *      n'apparaît pas, et le message d'échec nomme le panneau ;
 *   2. rien n'est AFFAIBLI — l'assertion de couleur, la liste des fonds
 *      interdits et le budget par tentative sont intacts, et le test n'est ni
 *      sauté ni marqué `fixme`.
 *
 * La garde n°2 existe parce que la tentation, sur un test instable, est de le
 * rendre vert en le relâchant. Elle rougit si quelqu'un le fait.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SPEC = join(RACINE, 'tests', 'e2e', 'dashboard.spec.ts');

/** Commentaires retirés : une garde qui matche un commentaire ne garde rien. */
function codeSeul(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !/^\s*\/\//.test(ligne))
    .join('\n');
}

describe('attente du shell IDE — robuste sans être relâchée', () => {
  it('1. la boucle passe par le helper, pas par une navigation nue', () => {
    const code = codeSeul(readFileSync(SPEC, 'utf8'));

    expect(code).toMatch(/await\s+ouvrirPanneauIde\(page,\s*projectId,\s*panel\)/);

    // La navigation nue de la boucle, celle qui portait le défaut, a disparu.
    const boucle = code.slice(code.indexOf('for (const [, panel] of panels)'));
    expect(boucle.slice(0, 400)).not.toMatch(/page\.goto\(`\/projects\/\$\{projectId\}\/ide\?panel=/);
  });

  it('2. le helper rejoue la navigation et nomme le panneau en échec', () => {
    const code = codeSeul(readFileSync(SPEC, 'utf8'));
    const helper = code.slice(code.indexOf('async function ouvrirPanneauIde'));

    expect(helper.slice(0, 900)).toMatch(/tentative\s*<=\s*2/);
    expect(helper.slice(0, 900)).toMatch(/panel/);
    expect(helper.slice(0, 900)).toMatch(/throw new Error/);
  });

  it('3. le budget par tentative n’est PAS gonflé', () => {
    const code = codeSeul(readFileSync(SPEC, 'utf8'));

    const helper = code.slice(
      code.indexOf('async function ouvrirPanneauIde'),
      code.indexOf('async function ouvrirPanneauIde') + 900,
    );

    /*
     * Grossir le nombre masquerait un blocage réel au lieu de le traiter :
     * quand le test passe, il fait les 20 panneaux en 54 s, soit ~2,7 s par
     * panneau. 30 s est déjà dix fois cela.
     */
    expect(helper).toMatch(/timeout:\s*30_000/);
    expect(helper).not.toMatch(/timeout:\s*(4[5-9]|[5-9]\d|\d{3})_?000/);
  });

  it('4. l’assertion de couleur est intacte', () => {
    const code = codeSeul(readFileSync(SPEC, 'utf8'));

    expect(code).toMatch(/readDarkContainers\(\)/);
    expect(code).toMatch(/contains dark containers in light theme/);
    expect(code).toMatch(/\.toEqual\(\[\]\)/);

    // Les quatre fonds interdits sont toujours listés.
    for (const fond of ['rgb(10, 15, 28)', 'rgb(14, 21, 37)', 'rgb(26, 32, 48)', 'rgb(43, 50, 69)']) {
      expect(code).toContain(fond);
    }
  });

  it('5. le test n’est ni sauté ni marqué fixme', () => {
    const code = codeSeul(readFileSync(SPEC, 'utf8'));
    const bloc = code.slice(code.indexOf("test('all IDE service panels keep light theme containers readable'"));

    expect(bloc.slice(0, 300)).not.toMatch(/test\.(skip|fixme)\(\s*true/);
    expect(code).not.toMatch(/test\.describe\.skip/);

    // Les 20 panneaux sont toujours parcourus.
    const panneaux = (code.match(/\['[A-Z][^']*',\s*'[a-z-]+'\]/g) ?? []).length;
    expect(panneaux).toBeGreaterThanOrEqual(20);
  });
});
