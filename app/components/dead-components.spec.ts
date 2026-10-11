import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Exercise the repository detector outside the application alias.
import { inventorierComposants, modulesReferences } from '../../scripts/composants-sans-import.mjs';

const racine = resolve(process.cwd(), 'app');
const inventaire = inventorierComposants(racine);

/*
 * Mesurés le 11/10/2026 après suppression des quatorze modules historiques.
 * Ces trois modules restent à examiner ; leur présence n'est pas cachée.
 */
const sansImportConnus = [
  'dashboard/prechauffer-coquille-publique',
  'deploy/cron-expression',
  'marketing/ecode-exact/pages/Pricing',
];

describe('cliquet des composants sans import', () => {
  it('lit des sources et reconnaît un module utilisé', () => {
    expect(inventaire.sourcesExaminees).toBeGreaterThan(100);
    expect(inventaire.composantsExamines).toBeGreaterThan(100);
    expect(inventaire.references.has(resolve(racine, 'components/database/DatabaseWorkbench'))).toBe(true);
  });

  it('refuse tout nouveau module sans import et toute entrée de dette périmée', () => {
    expect(inventaire.sansImport).toEqual(sansImportConnus);
  });
});

describe('le détecteur lit les imports et leurs chemins, pas les mentions', () => {
  it.each([
    "import { Panel } from './Panel';",
    "export { Panel } from './Panel';",
    "import('./Panel');",
    "import './Panel';",
    "const panel = require('./Panel');",
    "import type { Panel } from './Panel';",
  ])('conserve une dépendance du module : %s', (source) => {
    expect([...modulesReferences(source, resolve(racine, 'components/source.ts'), racine)]).toEqual([
      resolve(racine, 'components/Panel'),
    ]);
  });

  it('ignore les commentaires et les chaînes ordinaires', () => {
    const source = "// import './Panel';\nconst mention = \"import('./Panel')\";";
    expect([...modulesReferences(source, resolve(racine, 'components/source.ts'), racine)]).toEqual([]);
  });

  it('distingue deux modules de même nom et résout l’alias de l’application', () => {
    const source = "import '~/components/a/Panel.js'; import './b/Panel';";
    expect([...modulesReferences(source, resolve(racine, 'components/source.ts'), racine)].sort()).toEqual([
      resolve(racine, 'components/a/Panel'),
      resolve(racine, 'components/b/Panel'),
    ]);
  });
});
