/*
 * Engorgement CI, 2026-09-01 — 30 exécutions en file derrière des builds sur des
 * commits déjà dépassés.
 *
 * Garde de SOURCE (espèce annoncée) : elle vérifie la DÉCLARATION, pas le
 * comportement de GitHub Actions, qu'on ne peut pas exécuter ici. Elle empêche
 * la régression silencieuse consistant à retirer le groupe de concurrence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const WF = join(RACINE, '.github', 'workflows', 'electron.yml');

/** Commentaires retirés : une garde qui matche sa propre prose ne garde rien. */
function sansCommentaires(texte) {
  return texte
    .split('\n')
    .filter((ligne) => !/^\s*#/.test(ligne))
    .join('\n');
}

describe('builds bureau — les exécutions dépassées sont annulées', () => {
  it('1. déclare un groupe de concurrence par référence', () => {
    const wf = sansCommentaires(readFileSync(WF, 'utf8'));

    expect(wf).toMatch(/^concurrency:/m);
    expect(wf).toMatch(/group:\s*electron-\$\{\{\s*github\.ref\s*\}\}/);
  });

  it('2. n’annule QUE les pull requests — jamais un tag', () => {
    /*
     * Une exécution annulée n'est pas une exécution verte. Annuler un push de
     * tag reviendrait à refuser une release sur un résultat qu'on n'a pas
     * laissé finir — la leçon de `ci.yml`, écrite après un déploiement sur
     * « Production CI = cancelled ».
     */
    const wf = sansCommentaires(readFileSync(WF, 'utf8'));

    expect(wf).toMatch(/cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/);
    expect(wf).not.toMatch(/cancel-in-progress:\s*true\b/);
  });
});
