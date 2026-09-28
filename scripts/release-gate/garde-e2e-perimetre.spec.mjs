import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const FLUX = parse(readFileSync(new URL('../../.github/workflows/e2e.yml', import.meta.url), 'utf8'));

/**
 * Un contrôle qui s'exécute là où il n'a rien à vérifier n'est pas neutre :
 * il coûte à ceux qui en ont besoin.
 *
 * Mesuré le 2026-09-05 sur les 60 derniers runs E2E : **30 portaient sur des
 * commits ne touchant QUE de la documentation**. Chacun occupait les runners
 * environ une heure, et cette saturation faisait échouer les vraies PR —
 * `agent-message-density.spec.ts` rougissait 3 fois sur 3 sous 24 exécutions
 * concurrentes, et passait sur le même arbre une fois la file vide.
 */
describe("la suite navigateur ne tourne pas pour un changement documentaire", () => {
  // DISCRIMINANT — sans le job de périmètre, rien ne conditionne les étapes.
  it('un job de périmètre décide, et le job e2e en dépend', () => {
    expect(Object.keys(FLUX.jobs)).toContain('perimetre');
    expect(FLUX.jobs.e2e.needs).toBe('perimetre');
  });

  // DISCRIMINANT — le nom du check ne doit pas changer.
  it("garde le nom du check requis par la protection de branche", () => {
    expect(FLUX.jobs.e2e.name).toBe('Playwright local stack');
  });

  // DISCRIMINANT — chaque étape coûteuse doit être conditionnée.
  it('toutes les étapes du job e2e sont conditionnées par le périmètre', () => {
    /*
     * L'envoi des traces porte `always() && …` : il doit tourner même quand les
     * tests échouent, mais pas quand la suite est sautée. Les deux conditions se
     * combinent, elles ne se remplacent pas — c'est bien une garde, pas une
     * exception.
     */
    const nonGardees = FLUX.jobs.e2e.steps.filter(
      (s) => !String(s.if ?? '').includes("needs.perimetre.outputs.code == 'true'"),
    );

    expect(nonGardees.map((s) => s.name ?? s.uses ?? '(anonyme)')).toEqual([]);
  });

  /**
   * GARDE ASSUMÉE — passe des deux côtés à dessein. Elle protège contre le troc
   * inverse : un filtre trop zélé qui sauterait la suite sur du code non testé,
   * bien pire que le gaspillage qu'il évite.
   */
  it("exécute par défaut : hors pull request, ou au moindre doute", () => {
    const script = FLUX.jobs.perimetre.steps.find((s) => s.id === 'detecte').run;

    expect(script).toContain("!= 'pull_request'");
    expect(script).toContain('base ou tete illisible');
    expect(script).toContain('aucun fichier detecte');

    // Chacun de ces chemins de doute doit ÉCRIRE code=true, jamais false.
    for (const bloc of script.split('exit 0').slice(0, 3)) {
      expect(bloc).toContain('code=true');
    }
  });
});
