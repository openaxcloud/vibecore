import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { construireBlocArborescence } from './stream-text';

/*
 * L'agent écrivait ses fichiers sans les brancher au point d'entrée. Reproduit
 * deux fois : `Contact.jsx` créé dans un projet TypeScript, et quatre fichiers
 * dans `src/deck/` avec `src/App.tsx` intact à UN OCTET près.
 *
 * La cause n'est pas le modèle : il y a DEUX appels. `selectContext` reçoit la
 * liste complète des chemins, mais seulement pour choisir quoi charger. Le
 * générateur ne recevait que le contenu sélectionné — jamais l'arborescence.
 */
const ARBRE = ['/home/project/src/App.tsx', '/home/project/src/main.tsx', '/home/project/package.json'];

describe('bloc arborescence + consigne de câblage', () => {
  it('liste TOUS les chemins, pas seulement ceux du tampon de contexte', () => {
    const bloc = construireBlocArborescence(ARBRE);

    for (const chemin of ARBRE) {
      expect(bloc, `${chemin} doit apparaître`).toContain(chemin);
    }
  });

  /*
   * La liste SEULE ne changerait rien : le défaut n'est pas que l'ignorance,
   * c'est l'absence de consigne. Ces trois exigences sont le correctif.
   */
  it('porte la consigne de câblage, sans laquelle la liste ne sert à rien', () => {
    const bloc = construireBlocArborescence(ARBRE);

    expect(bloc, 'le fichier créé doit être atteignable').toMatch(/reachable from the project's existing entry point/i);
    expect(bloc, 'et le point d’entrée doit être MODIFIÉ').toMatch(/EDIT the existing entry point/i);
    expect(bloc, 'les extensions doivent correspondre').toMatch(/Match the extensions already in use/i);
  });

  it('dit explicitement qu’un fichier absent du tampon EXISTE quand même', () => {
    expect(construireBlocArborescence(ARBRE)).toMatch(/still EXIST/i);
  });

  it('rend une chaîne VIDE sans chemin — jamais un en-tête orphelin', () => {
    expect(construireBlocArborescence([])).toBe('');
  });

  /*
   * LE SITE D'APPEL. Le bloc peut être parfait et n'être jamais joint au
   * prompt : c'est le mécanisme qui se défait, pas le texte. Ancré sur le CODE
   * de stream-text.ts, pas sur un commentaire — réécrire l'explication ne fait
   * pas passer ce test au vert.
   */
  it('est effectivement JOINT au prompt du générateur', () => {
    const source = readFileSync(join(process.cwd(), 'app/lib/.server/llm/stream-text.ts'), 'utf8');

    expect(source, 'le bloc doit être construit dans streamText').toContain(
      'const arborescenceBlock = construireBlocArborescence(projectFilePaths);',
    );
    expect(source, 'et INTERPOLÉ en tête du tampon de contexte').toContain(
      '`${arborescenceBlock}Below is the artifact',
    );
  });
});
