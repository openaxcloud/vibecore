import { describe, expect, it } from 'vitest';

import { fichiersQuiDeclenchent, motifsIgnores, versRegex } from './declenche-un-deploiement.mjs';

/*
 * CE SPEC CONTRÔLE D'ABORD L'INSTRUMENT, ENSUITE LE VERDICT.
 *
 * L'ordre n'est pas décoratif. Le 2026-09-30, ma première traduction des motifs
 * glob a rendu un résultat FAUX — `tests/**` ne matchait pas `tests/e2e/x.ts`
 * — et le verdict qui en sortait était plausible. Ce sont les cas connus
 * ci-dessous, et eux seuls, qui l'ont attrapé.
 *
 * Un script qui répond « déploie » alors que non fait perdre une livraison en
 * silence. Le premier bloc existe donc pour que le second ait le droit de
 * conclure.
 */
const CAS_CONNUS = [
  ['README.md', true],
  ['docs/bugs/BUG-X.md', true],
  ['tests/e2e/parcours.spec.ts', true],
  ['tests/guards/quelque-chose.ts', true],
  ['.github/workflows/e2e.yml', true],
  ['app/composant.spec.ts', true],
  ['app/composant.spec.tsx', true],
  ['scripts/outil.spec.mjs', true],
  ['playwright.config.ts', true],
  ['playwright-mobile.config.ts', true],
  ['app/root.tsx', false],
  ['app/styles/index.scss', false],
  ['scripts/outil.mjs', false],
  ['services/api/src/app.ts', false],
  ['infra/helm/platform/values-prod.yaml', false],
  ['package.json', false],
];

describe("l'instrument avant le verdict", () => {
  it('TÉMOIN — les motifs sont LUS dans le workflow, et il y en a', () => {
    const motifs = motifsIgnores();

    expect(motifs.length, 'aucun motif lu : tout le reste du spec ne mesurerait rien').toBeGreaterThan(0);
    expect(motifs, 'le cas nominal du piège est le commit purement Markdown').toContain('**/*.md');
  });

  it.each(CAS_CONNUS)('« %s » est-il filtré ? attendu : %s', (chemin, attendu) => {
    const filtre = fichiersQuiDeclenchent([chemin]).length === 0;

    expect(
      filtre,
      `traduction des motifs glob fausse sur « ${chemin} » — aucune conclusion de ce script n'est utilisable`,
    ).toBe(attendu);
  });

  it('LE DÉFAUT D’ORIGINE — `**` doit traverser les séparateurs, `*` non', () => {
    /*
     * Les deux moitiés du bug, épinglées séparément : la première version
     * rendait `tests/.[^/]*` pour `tests/**`, donc échouait sur un chemin
     * profond tout en réussissant sur un chemin plat — une moitié juste.
     */
    expect(versRegex('tests/**').test('tests/e2e/profond/x.ts'), '`**` ne traverse pas les séparateurs').toBe(true);
    expect(versRegex('tests/**').test('tests/plat.ts'), 'régression sur le cas plat').toBe(true);
    expect(versRegex('docs/*.md').test('docs/a/b.md'), '`*` ne doit PAS traverser un séparateur').toBe(false);
    expect(versRegex('docs/*.md').test('docs/a.md')).toBe(true);
  });
});

describe('le verdict de fusion', () => {
  it('une proposition DOCUMENTAIRE ne déclenche aucun déploiement — le piège', () => {
    const restants = fichiersQuiDeclenchent([
      'CLAUDE.md',
      'docs/bugs/BUG-Y.md',
      '.github/workflows/deploy-main.yml',
      'tests/guards/garde.spec.ts',
    ]);

    expect(restants, 'une telle proposition NE doit PAS être fusionnée juste après du code').toEqual([]);
  });

  it('CONTRE-ÉPREUVE — un seul fichier de produit suffit à déclencher', () => {
    const restants = fichiersQuiDeclenchent(['CLAUDE.md', 'docs/bugs/BUG-Y.md', 'app/root.tsx']);

    expect(restants, '`paths-ignore` ne saute que si TOUS les fichiers correspondent').toEqual(['app/root.tsx']);
  });

  it('refuse plutôt que de rassurer quand les motifs sont introuvables', () => {
    /*
     * Un `paths-ignore` absent rendrait « déploie » pour tout — le verdict le
     * plus permissif, donc le plus dangereux à rendre par accident.
     */
    expect(() => motifsIgnores('/chemin/qui/n-existe-pas.yml')).toThrow();
  });
});
