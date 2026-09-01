/*
 * BUG-REL-003 — l'attestation de parité ne doit JAMAIS pousser directement sur
 * `main` : la protection de branche exige 3 contrôles, qu'un push direct ne
 * peut par définition pas porter (ils s'exécutent après). Mesuré le 2026-09-01,
 * run 33477515318 : `remote rejected … 3 of 3 required status checks are
 * expected` — l'attestation n'était plus roulée du tout.
 *
 * La réparation ne doit pas assouplir la protection. Ces gardes vérifient donc
 * les deux moitiés séparément :
 *   1. plus aucun push direct vers `main` ;
 *   2. le chemin de remplacement passe bien par une PR à fusion automatique,
 *      c'est-à-dire subordonnée aux contrôles.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const WF = join(RACINE, '.github', 'workflows', 'parity-registries.yml');

/** Commentaires retirés : une garde qui matche un commentaire ne garde rien. */
function sansCommentaires(texte) {
  return texte
    .split('\n')
    .filter((ligne) => !/^\s*#/.test(ligne))
    .join('\n');
}

describe('attestation de parité — chemin autorisé, protection intacte', () => {
  it('1. ne pousse plus directement sur main', () => {
    const wf = sansCommentaires(readFileSync(WF, 'utf8'));

    expect(wf).not.toMatch(/git\s+push\s+origin\s+HEAD:main/);
    expect(wf).not.toMatch(/git\s+push\s+\S*\s*origin\s+\S*\s*main\b/);
  });

  it('2. passe par une PR dont la fusion est subordonnée aux contrôles', () => {
    const wf = sansCommentaires(readFileSync(WF, 'utf8'));

    expect(wf).toMatch(/gh\s+pr\s+create/);

    /*
     * `--auto` est ce qui rend la fusion conditionnelle aux contrôles requis.
     * Sans lui, une fusion immédiate contournerait la protection.
     */
    expect(wf).toMatch(/gh\s+pr\s+merge[^\n]*--auto/);

    // Et surtout : aucune fusion administrative, qui passerait outre.
    expect(wf).not.toMatch(/--admin\b/);
  });

  it('3. déclare la permission nécessaire à ce chemin', () => {
    const wf = readFileSync(WF, 'utf8');

    expect(wf).toMatch(/pull-requests:\s*write/);
  });
});
