/*
 * Famille A — ce qui n'apparaît qu'au survol est MORT au doigt.
 *
 * Un pointeur grossier n'a pas d'état de survol, et le focus n'arrive qu'APRÈS
 * le toucher — trop tard pour révéler ce qu'il fallait voir avant de toucher.
 *
 * ⚠️ Penser au clavier NE COUVRE PAS le tactile. `focus-visible:` rend une
 * commande atteignable au clavier et ne fait rien au doigt. Les deux se
 * traitent séparément. Constaté sur `QueryHistoryControl`, dont le bouton
 * « supprimer » portait un `focus-visible:` soigné et restait invisible.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COARSE_POINTER_QUERY, resolveCoarsePointer } from './useCoarsePointer';

const APP = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

function fichiersTsx(racine: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(racine)) {
    const chemin = join(racine, nom);

    if (statSync(chemin).isDirectory()) {
      fichiersTsx(chemin, acc);
    } else if (nom.endsWith('.tsx') && !nom.includes('.spec.')) {
      acc.push(chemin);
    }
  }

  return acc;
}

describe('révélation au survol — repli tactile obligatoire', () => {
  it('1. la primitive répond sans matchMedia (rendu serveur)', () => {
    expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)');
    expect(resolveCoarsePointer(undefined)).toBe(false);
    expect(resolveCoarsePointer({ matchMedia: undefined as never })).toBe(false);
    expect(resolveCoarsePointer({ matchMedia: (() => ({ matches: true })) as never })).toBe(true);
  });

  it('2. aucun composant ne révèle une commande au SEUL survol', () => {
    const fautifs: string[] = [];

    for (const chemin of fichiersTsx(join(APP, 'components'))) {
      const src = readFileSync(chemin, 'utf8');

      const revelationAuSurvol = /opacity-0/.test(src) && /(group-)?hover:opacity-100/.test(src);

      if (!revelationAuSurvol) {
        continue;
      }

      /*
       * Repli accepté : décider sur le POINTEUR. Le point de rupture (`sm:`) ne
       * suffit pas — une tablette tactile à 768 px n'a pas plus de survol qu'un
       * téléphone à 390.
       */
      /*
       * On exige le MÉCANISME (l'appel au hook), pas un nom de variable :
       * `HistoryItem` l'appelle `isCoarsePointer`, et une première version de
       * cette garde le comptait fautif — un faux positif de la garde elle-même.
       */
      const repli = /useCoarsePointer\s*\(/.test(src);

      if (!repli) {
        fautifs.push(chemin.slice(chemin.indexOf('/app/') + 1));
      }
    }

    // Témoin : sans fichier scanné, l'assertion passerait à vide.
    expect(fichiersTsx(join(APP, 'components')).length).toBeGreaterThan(50);
    expect(fautifs).toEqual([]);
  });
});
