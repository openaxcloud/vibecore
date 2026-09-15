import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Le contrôle « Verify complete proof set » de l'audit i18n comptait des
 * FICHIERS. Une reprise Playwright réécrit les mêmes preuves dans
 * `<titre>-retry<N>/` : un test instable rattrapé gonflait donc le total et
 * faisait rougir un shard qui n'avait rien de cassé.
 *
 * Mesuré le 2026-09-15, run 34935887738, un seul commit :
 *   desktop-1024   4 passed            282/282
 *   desktop-1440   4 passed            282/282
 *   mobile-390     4 passed            282/282
 *   tablet-768     1 flaky, 3 passed   317/282   <- rouge
 *
 * Ce spec EXÉCUTE la fonction shell telle qu'elle est écrite dans le workflow,
 * sur un arbre de preuves fabriqué. Il rougit si quelqu'un revient au comptage
 * de fichiers, et il rougit aussi si le comptage cesse de voir une preuve
 * réellement absente — les deux moitiés sont couplées.
 */

const WORKFLOW = join(process.cwd(), '.github', 'workflows', 'i18n-live-audit.yml');

/** La fonction de comptage, extraite du workflow — jamais recopiée ici. */
function fonctionDeComptage(): string {
  const source = readFileSync(WORKFLOW, 'utf8');
  const debut = source.indexOf('compter_preuves() {');
  const fin = source.indexOf('}', source.indexOf('wc -l | tr', debut));

  expect(debut, 'la fonction compter_preuves a disparu du workflow').toBeGreaterThan(-1);
  expect(fin, 'la fonction compter_preuves n’est pas refermée').toBeGreaterThan(debut);

  return source
    .slice(debut, fin + 1)
    .split('\n')
    .map((ligne) => ligne.replace(/^ {10}/, ''))
    .join('\n');
}

let racine: string;

function preuve(dossier: string, nom: string): void {
  mkdirSync(join(racine, 'test-results', dossier, 'i18n-proof'), { recursive: true });
  writeFileSync(join(racine, 'test-results', dossier, 'i18n-proof', nom), '{}');
}

function compter(): number {
  const script = `${fonctionDeComptage()}\ncompter_preuves -path '*/i18n-proof/i18n-audit-*.json'\n`;

  return Number(execFileSync('bash', ['-c', script], { cwd: racine }).toString().trim());
}

describe('le comptage des preuves de l’audit i18n', () => {
  beforeEach(() => {
    racine = mkdtempSync(join(tmpdir(), 'preuves-i18n-'));

    for (const test of ['chromium-sitemap', 'chromium-auth', 'chromium-panels']) {
      for (const n of [1, 2, 3]) {
        preuve(test, `i18n-audit-${test}-${n}.json`);
      }
    }
  });

  afterEach(() => {
    rmSync(racine, { recursive: true, force: true });
  });

  it('mesure bien quelque chose : neuf preuves sur un arbre sain', () => {
    expect(compter()).toBe(9);
  });

  it('ne compte PAS deux fois les preuves d’un test rattrapé après reprise', () => {
    for (const n of [1, 2, 3]) {
      preuve('chromium-panels-retry1', `i18n-audit-chromium-panels-${n}.json`);
    }

    // Le comptage de fichiers d'avant rendait 12 ici, et le shard rougissait.
    expect(compter()).toBe(9);
  });

  it('voit toujours une preuve réellement absente — la correction n’a rien affaibli', () => {
    rmSync(join(racine, 'test-results', 'chromium-auth', 'i18n-proof', 'i18n-audit-chromium-auth-2.json'));

    expect(compter()).toBe(8);
  });

  it('ne confond pas deux tests différents qui portent le même numéro de preuve', () => {
    // Les chemins restent entiers : seul le suffixe de reprise est neutralisé.
    preuve('chromium-quatrieme', 'i18n-audit-chromium-sitemap-1.json');

    expect(compter()).toBe(10);
  });
});
