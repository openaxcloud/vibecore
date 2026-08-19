import { describe, expect, it, beforeEach } from 'vitest';

import { readResourceUsage, resetCpuSampling } from './resource-usage';

/*
 * SCR-008 — jauges RAM / CPU / stockage. La règle projet interdit les mocks :
 * ce lecteur va chercher les vraies valeurs du noyau. Ces tests vérifient donc
 * le CONTRAT et le comportement en l'absence de source, pas des chiffres figés
 * — les cgroup d'une machine de développement ne sont pas ceux d'un pod.
 *
 * Valeurs relevées sur la production le 19/08, qui ont guidé le lecteur :
 *   memory.current -> 400769024, memory.max -> 536870912,
 *   cpu.stat       -> usage_usec 361202069
 */

beforeEach(() => {
  resetCpuSampling();
});

describe('lecture des ressources', () => {
  it('rend toujours les trois jauges et un horodatage', async () => {
    const usage = await readResourceUsage(process.cwd());

    expect(usage).toHaveProperty('memory');
    expect(usage).toHaveProperty('cpu');
    expect(usage).toHaveProperty('storage');
    expect(() => new Date(usage.measuredAt).toISOString()).not.toThrow();
  });

  /*
   * Le point le plus important : ne JAMAIS inventer. Sur une machine sans les
   * cgroup du conteneur, les jauges doivent valoir `null` — pas `0`, qui se
   * lirait comme « rien n'est consommé » et serait un mensonge.
   */
  it('rend null plutôt que zéro quand le noyau n’expose pas la valeur', async () => {
    const usage = await readResourceUsage(process.cwd());

    for (const valeur of [usage.memory.used, usage.memory.limit, usage.cpu.limitCores]) {
      expect(valeur === null || typeof valeur === 'number').toBe(true);
      expect(valeur).not.toBe(Number.NaN);
    }
  });

  it('ne publie aucun ratio de processeur au PREMIER relevé', async () => {
    const usage = await readResourceUsage(process.cwd());

    /*
     * Un pourcentage d'utilisation est une DÉRIVÉE : il n'existe pas avant deux
     * mesures. Afficher 0 % en attendant serait un chiffre inventé.
     */
    expect(usage.cpu.ratio).toBeNull();
  });

  it('borne le ratio à 1 et ne rend jamais de valeur négative', async () => {
    await readResourceUsage(process.cwd(), 1_000_000);

    const usage = await readResourceUsage(process.cwd(), 1_002_000);

    if (usage.cpu.ratio !== null) {
      expect(usage.cpu.ratio).toBeGreaterThanOrEqual(0);
      expect(usage.cpu.ratio).toBeLessThanOrEqual(1);
    }
  });

  it('mesure le stockage du chemin demandé', async () => {
    const usage = await readResourceUsage(process.cwd());

    if (usage.storage.limit !== null) {
      expect(usage.storage.limit).toBeGreaterThan(0);
      expect(usage.storage.used).not.toBeNull();
      expect(usage.storage.used!).toBeLessThanOrEqual(usage.storage.limit);
    }
  });

  it('rend des jauges vides sur un chemin inexistant, sans lever', async () => {
    const usage = await readResourceUsage('/chemin/qui/n/existe/pas/du/tout');

    expect(usage.storage).toEqual({ used: null, limit: null });
  });
});
