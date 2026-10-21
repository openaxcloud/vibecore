import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-QA1006-PORTE-E2E-SPEC-SEUL — mesuré le 2026-10-06 (runs 37437259815 et
 * 37437263249) : en mode spec seul, chaque tranche joue tout le spec. La porte
 * jugeait « vide » une tranche qui n'apportait aucun test NOUVEAU, donc rendait
 * rouge un passage où le test avait réussi quatre fois sur quatre. Et elle
 * écrivait le DERNIER verdict lu : un échec en tranche 1 suivi d'une réussite en
 * tranche 4 se lisait « passed ».
 *
 * La porte est jouée telle quelle, sur de vrais rapports au format Playwright.
 * Le script réel est copié sans modification dans un dépôt temporaire avec
 * une politique de test bornée et deux specs attendus. Aucun changement à la
 * dérogation de production. Les assertions vérifient aussi le code de sortie.
 */

const RACINE = join(__dirname, '..', '..');
const SPEC = 'retour-ne-recule-pas.spec.ts';

function rapport(tests: Array<{ titre: string; statut: 'expected' | 'unexpected' | 'flaky' }>) {
  return {
    suites: [
      {
        title: SPEC,
        file: SPEC,
        specs: tests.map(({ titre, statut }) => ({
          title: titre,
          file: SPEC,
          tests: [
            {
              status: statut,
              expectedStatus: 'passed',
              results:
                statut === 'flaky'
                  ? [{ status: 'failed' }, { status: 'passed' }]
                  : [{ status: statut === 'unexpected' ? 'failed' : 'passed' }],
            },
          ],
        })),
        suites: [],
      },
    ],
  };
}

function porte(rapports: unknown[], env: Record<string, string> = {}) {
  const dossier = mkdtempSync(join(tmpdir(), 'porte-e2e-'));
  mkdirSync(join(dossier, 'scripts'));
  mkdirSync(join(dossier, 'tests/e2e'), { recursive: true });
  copyFileSync(join(RACINE, 'scripts/e2e-gate.mjs'), join(dossier, 'scripts/e2e-gate.mjs'));

  const expires = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  writeFileSync(join(dossier, 'tests/e2e/e2e-waivers.json'), JSON.stringify({ expires, waived: [] }));

  for (const spec of [SPEC, 'autre.spec.ts']) {
    writeFileSync(join(dossier, 'tests/e2e', spec), "test('témoin', () => {});\n");
  }

  const fichiers = rapports.map((r, i) => {
    const f = join(dossier, `tranche-${i + 1}.json`);
    writeFileSync(f, JSON.stringify(r));

    return f;
  });

  try {
    const resultat = spawnSync('node', ['scripts/e2e-gate.mjs', ...fichiers], {
      cwd: dossier,
      env: { ...process.env, E2E_SPEC: '', E2E_EXPECTED_REPORTS: String(rapports.length), ...env },
      encoding: 'utf8',
    });

    if (resultat.error) {
      throw resultat.error;
    }

    return { status: resultat.status, sortie: `${resultat.stdout}${resultat.stderr}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const reussi = rapport([{ titre: 'retour sur un projet', statut: 'expected' }]);
const echoue = rapport([{ titre: 'retour sur un projet', statut: 'unexpected' }]);

describe('porte E2E — mode spec seul', () => {
  it('quatre tranches qui jouent le même spec avec succès : la porte conclut, sans le juger vide ni amputé', () => {
    const { status, sortie } = porte([reussi, reussi, reussi, reussi], { E2E_SPEC: `tests/e2e/${SPEC}` });

    expect(status).toBe(0);

    // Mesuré AVANT correctif : « un rapport ne porte AUCUN test ».
    expect(sortie).not.toMatch(/AUCUN test/);
    expect(sortie).not.toMatch(/joués par AUCUNE tranche/);
    expect(sortie).toMatch(/fichiers de specs attendus : 1/);
    expect(sortie).not.toMatch(/failing tests that are NOT waived/);
  });

  it('un échec dans UNE tranche n’est pas effacé par les réussites des autres', () => {
    const { status, sortie } = porte([echoue, reussi, reussi, reussi], { E2E_SPEC: `tests/e2e/${SPEC}` });

    expect(status).toBe(1);
    expect(sortie).toMatch(/failing tests that are NOT waived/);
    expect(sortie).toMatch(/retour-ne-recule-pas\.spec\.ts › retour sur un projet/);
  });

  it('contre-épreuve — une tranche vide est refusée en mode ciblé et en suite entière', () => {
    for (const env of [{ E2E_SPEC: `tests/e2e/${SPEC}` }, {}]) {
      const resultat = porte([reussi, { suites: [] }, reussi, reussi], env);
      expect(resultat.status).toBe(1);
      expect(resultat.sortie).toMatch(/AUCUN test/);
    }
  });

  it('contre-épreuve — un seul spec laisse la suite entière amputée', () => {
    const resultat = porte([reussi, reussi, reussi, reussi]);
    expect(resultat.status).toBe(1);
    expect(resultat.sortie).toMatch(/joués par AUCUNE tranche/);
  });
});
