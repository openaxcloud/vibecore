/**
 * Où le `globalSetup` de vitest dépose les catalogues sérialisés, et où le
 * setup par fichier vient les lire (BUG-PERF-I18N-RACINE-001).
 */
import { join } from 'node:path';

import type { SupportedLanguage } from './language';

export const DOSSIER_CACHE_CATALOGUES = join(process.cwd(), 'node_modules', '.cache', 'vibecore-catalogues-i18n');

export function cheminDuCatalogueSerialise(langue: SupportedLanguage): string {
  return join(DOSSIER_CACHE_CATALOGUES, `${langue}.json`);
}
