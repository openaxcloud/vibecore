/**
 * `test.setupFiles` de vitest — s'exécute dans CHAQUE fichier de test, donc
 * doit rester quasi gratuit.
 *
 * Depuis BUG-PERF-I18N-RACINE-001, `runtime.ts` n'importe plus aucun
 * catalogue : en production c'est l'entrée serveur qui les enregistre. Ici, on
 * n'installe qu'un lecteur synchrone paresseux du JSON que le `globalSetup` a
 * écrit ; les 127 specs qui montent un `I18nextProvider` obtiennent leurs
 * ressources au premier `createI18nInstance`, sans qu'aucune n'ait à changer,
 * et les 960 autres ne paient rien.
 */
import { readFileSync } from 'node:fs';

import { cheminDuCatalogueSerialise } from './catalogues-vitest-cache';
import { definirFournisseurSynchrone } from './fournisseur-synchrone';

definirFournisseurSynchrone((langue) => JSON.parse(readFileSync(cheminDuCatalogueSerialise(langue), 'utf8')));
