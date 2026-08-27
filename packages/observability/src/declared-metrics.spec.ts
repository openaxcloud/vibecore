import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { platformMetricDefinitions } from './index.js';

/*
 * Garde : toute métrique incrémentée doit être déclarée ici.
 *
 * Le registre lève sur un nom inconnu. Sur `workspace_runtime_reseed_total`,
 * l'appel était fait sans déclaration : la levée retombait dans le `catch` de la
 * réconciliation et CHAQUE reseed réussi était journalisé
 * « runtime reseed reconciliation failed ». Constaté en réel sur l'env d'audit
 * pendant la chasse aux défauts de création — un journal qui dit l'inverse de ce
 * qui s'est passé coûte plus cher que pas de journal du tout.
 *
 * Ce test relit les sources et compare les littéraux aux déclarations, pour que
 * l'oubli soit rattrapé au commit et pas six mois plus tard dans un journal.
 */

const RACINE = new URL('../../..', import.meta.url).pathname;
const DOSSIERS = ['services/api/src', 'services/workspace-manager/src', 'services/preview-proxy/src'];
const APPEL = /\bmetrics\.(?:increment|observe|set)\(\s*'([a-z0-9_]+)'/g;

function fichiersTypeScript(racine: string): string[] {
  const trouves: string[] = [];

  const descendre = (dossier: string) => {
    for (const entree of readdirSync(dossier)) {
      const complet = join(dossier, entree);

      if (statSync(complet).isDirectory()) {
        if (entree !== 'node_modules' && entree !== 'dist') {
          descendre(complet);
        }

        continue;
      }

      if (entree.endsWith('.ts') && !entree.endsWith('.spec.ts')) {
        trouves.push(complet);
      }
    }
  };

  descendre(racine);

  return trouves;
}

describe('métriques déclarées', () => {
  it('déclare toute métrique référencée par un littéral dans les services', () => {
    const declarees = new Set(platformMetricDefinitions.map((d) => d.name));
    const manquantes = new Map<string, string>();

    for (const dossier of DOSSIERS) {
      let fichiers: string[];

      try {
        fichiers = fichiersTypeScript(join(RACINE, dossier));
      } catch {
        /* un service absent du checkout n'est pas un échec de ce test */
        continue;
      }

      for (const fichier of fichiers) {
        const source = readFileSync(fichier, 'utf8');

        for (const [, nom] of source.matchAll(APPEL)) {
          if (!declarees.has(nom)) {
            manquantes.set(nom, fichier.slice(RACINE.length));
          }
        }
      }
    }

    expect(Object.fromEntries(manquantes)).toEqual({});
  });

  it('ne déclare pas deux fois le même nom', () => {
    const noms = platformMetricDefinitions.map((d) => d.name);

    expect(noms.length).toBe(new Set(noms).size);
  });
});
