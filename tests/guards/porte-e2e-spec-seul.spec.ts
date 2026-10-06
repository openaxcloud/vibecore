import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
 * Les assertions portent sur ses MESSAGES, pas sur son code de sortie : la
 * dérogation qu'elle lit a une date, et son expiration ne doit pas faire mentir
 * ce test.
 */

const RACINE = join(__dirname, '..', '..');
const SPEC = 'retour-ne-recule-pas.spec.ts';

function rapport(tests: Array<{ titre: string; statut: 'expected' | 'unexpected' | 'flaky' }>) {
  return {
    suites: [
      {
        title: SPEC,
        file: SPEC,
        specs: tests.map(({ titre, statut }) => ({ title: titre, file: SPEC, tests: [{ status: statut }] })),
        suites: [],
      },
    ],
  };
}

function porte(rapports: unknown[], env: Record<string, string> = {}) {
  const dossier = mkdtempSync(join(tmpdir(), 'porte-e2e-'));
  const fichiers = rapports.map((r, i) => {
    const f = join(dossier, `tranche-${i + 1}.json`);
    writeFileSync(f, JSON.stringify(r));

    return f;
  });

  try {
    return execFileSync('node', ['scripts/e2e-gate.mjs', ...fichiers], {
      cwd: RACINE,
      env: { ...process.env, E2E_EXPECTED_REPORTS: String(rapports.length), ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (erreur) {
    const e = erreur as { stdout?: string; stderr?: string };

    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

const reussi = rapport([{ titre: 'retour sur un projet', statut: 'expected' }]);
const echoue = rapport([{ titre: 'retour sur un projet', statut: 'unexpected' }]);

describe('porte E2E — mode spec seul', () => {
  it('quatre tranches qui jouent le même spec avec succès : la porte conclut, sans le juger vide ni amputé', () => {
    const sortie = porte([reussi, reussi, reussi, reussi], { E2E_SPEC: `tests/e2e/${SPEC}` });

    // Mesuré AVANT correctif : « un rapport ne porte AUCUN test ».
    expect(sortie).not.toMatch(/AUCUN test/);
    expect(sortie).not.toMatch(/joués par AUCUNE tranche/);
    expect(sortie).toMatch(/fichiers de specs attendus : 1/);
    expect(sortie).not.toMatch(/failing tests that are NOT waived/);
  });

  it('un échec dans UNE tranche n’est pas effacé par les réussites des autres', () => {
    const sortie = porte([echoue, reussi, reussi, reussi], { E2E_SPEC: `tests/e2e/${SPEC}` });

    expect(sortie).toMatch(/failing tests that are NOT waived/);
    expect(sortie).toMatch(/retour-ne-recule-pas\.spec\.ts › retour sur un projet/);
  });

  it('contre-épreuve — une tranche réellement vide est toujours refusée, en mode spec seul comme en suite entière', () => {
    expect(porte([reussi, { suites: [] }, reussi, reussi], { E2E_SPEC: `tests/e2e/${SPEC}` })).toMatch(/AUCUN test/);
    expect(porte([reussi, { suites: [] }, reussi, reussi])).toMatch(/AUCUN test/);
  });

  it('contre-épreuve — en suite entière, un seul spec joué reste une couverture amputée', () => {
    expect(porte([reussi, reussi, reussi, reussi])).toMatch(/joués par AUCUNE tranche/);
  });
});
