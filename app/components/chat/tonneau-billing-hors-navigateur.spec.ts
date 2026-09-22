/*
 * La garde qui empêche de recasser le build web.
 *
 * `packages/billing/src/index.ts` importe `node:crypto` à sa PREMIÈRE ligne.
 * Dans le bundle navigateur, `node:crypto` devient `__vite-browser-external`,
 * un module vide : rollup s'arrête sur « createHmac is not exported by
 * __vite-browser-external » et TOUT le build web échoue.
 *
 * Mesuré le 2026-09-22 : `FeuilleDesModes.tsx` importait des types du tonneau,
 * ce qui ne coûte rien (les types sont effacés). Le jour où on l'a MONTÉ, son
 * voisin `feuille-des-modes.ts` — qui importait des valeurs — est entré dans le
 * graphe, et le build a cassé. Aucun test ne l'a vu : les specs tournent sous
 * Node, où le tonneau fonctionne parfaitement.
 *
 * D'où cette garde, qui lit les SOURCES au lieu d'exécuter quoi que ce soit.
 * Elle tient pour tout `app/`, pas seulement pour la feuille — c'est la règle,
 * pas la première occurrence (règle 7).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RACINE = join(process.cwd(), 'app');

function fichiersSource(dossier: string): string[] {
  const sortie: string[] = [];

  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);

    if (statSync(chemin).isDirectory()) {
      sortie.push(...fichiersSource(chemin));
      continue;
    }

    if (/\.tsx?$/.test(entree) && !/\.spec\.tsx?$/.test(entree)) {
      sortie.push(chemin);
    }
  }

  return sortie;
}

/*
 * On cherche les imports du tonneau qui ne sont PAS `import type`. Un
 * `import { type X }` reste un import de valeur pour rollup dès qu'il porte au
 * moins un binding non-type, donc on n'accepte que la forme `import type {…}`.
 */
const TONNEAU = /import\s+(?!type\b)[^;]*?from\s+'@vibecore\/billing'/g;

describe('aucun fichier de app/ n’importe une valeur du tonneau @vibecore/billing', () => {
  it('le graphe navigateur reste libre de node:crypto', () => {
    const fichiers = fichiersSource(RACINE);

    // Contrôle positif : la recherche a bien balayé quelque chose.
    expect(fichiers.length).toBeGreaterThan(200);

    const coupables: string[] = [];

    for (const fichier of fichiers) {
      const source = readFileSync(fichier, 'utf8');

      if (TONNEAU.test(source)) {
        coupables.push(fichier.slice(process.cwd().length + 1));
      }

      TONNEAU.lastIndex = 0;
    }

    expect(coupables).toEqual([]);
  });
});
