/**
 * `test.globalSetup` de vitest — s'exécute UNE fois par run, dans le processus
 * principal, avant tout fichier de test.
 *
 * Il évalue `runtime-resources.ts` (les 150 catalogues, ~2 s) et sérialise
 * chaque langue en JSON dans `node_modules/.cache`. Chaque fichier de test
 * n'a plus qu'à lire ce JSON, et seulement s'il demande une langue
 * (BUG-PERF-I18N-RACINE-001 — mesuré : évaluer les catalogues dans chaque
 * fichier coûtait 2,2 s × 1 089 fichiers).
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { cheminDuCatalogueSerialise, DOSSIER_CACHE_CATALOGUES } from './catalogues-vitest-cache';
import { SUPPORTED_LANGUAGES } from './language';
import { RESOURCES } from './runtime-resources';

export function setup(): void {
  mkdirSync(DOSSIER_CACHE_CATALOGUES, { recursive: true });

  for (const langue of SUPPORTED_LANGUAGES) {
    writeFileSync(cheminDuCatalogueSerialise(langue), JSON.stringify(RESOURCES[langue].translation));
  }
}
