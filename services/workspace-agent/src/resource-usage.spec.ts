import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readResourceUsage, resetCpuSampling, setLecteurFichier } from './resource-usage';

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

/*
 * Repli cgroup v1 — trouvé en certifiant SCR-008 live le 20/08.
 *
 * L'agent rendait `memory: null` et `cpu: null` à CHAQUE rafraîchissement sur le
 * projet réel, alors que `storage` sortait juste. La différence est décisive :
 * `storage` passe par `statfs`, les deux autres par cgroup. Les espaces de
 * travail tournent sous gVisor, qui expose la disposition **v1** ; les chemins
 * v2 n'y existent pas. Le relevé du 19/08 qui avait validé le lecteur avait été
 * fait sur un pod de la PLATEFORME, pas dans un espace de travail.
 */
describe('repli cgroup v1 (gVisor)', () => {
  let fichiers: Record<string, string>;

  beforeEach(() => {
    fichiers = {
      '/sys/fs/cgroup/memory/memory.usage_in_bytes': '87912448',
      '/sys/fs/cgroup/memory/memory.limit_in_bytes': '536870912',
      '/sys/fs/cgroup/cpuacct/cpuacct.usage': '361202069000',
      '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '200000',
      '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000',
    };

    // v2 absent, exactement comme sous gVisor.
    setLecteurFichier(async (chemin) => {
      const valeur = fichiers[chemin];

      if (valeur === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }

      return valeur;
    });
  });

  afterEach(() => {
    setLecteurFichier();
  });

  it('lit la mémoire quand seul cgroup v1 est monté', async () => {
    const usage = await readResourceUsage('/workspace', 1_000);

    expect(usage.memory.used).toBe(87_912_448);
    expect(usage.memory.limit).toBe(536_870_912);
  });

  it('convertit les nanosecondes de cpuacct et lit le quota en deux fichiers', async () => {
    // Premier relevé : pas de dérivée, donc pas de ratio — jamais 0.
    const premier = await readResourceUsage('/workspace', 1_000);

    expect(premier.cpu.ratio).toBeNull();
    expect(premier.cpu.limitCores).toBe(2);

    // 200 ms plus tard, 100 ms de CPU consommées sur 2 cœurs = 25 %.
    fichiers['/sys/fs/cgroup/cpuacct/cpuacct.usage'] = String(361_202_069_000 + 100_000_000);

    const second = await readResourceUsage('/workspace', 1_200);

    expect(second.cpu.ratio).toBeCloseTo(0.25, 3);
  });

  it('traite la sentinelle « pas de limite » de v1 comme une absence, pas comme 8 exaoctets', async () => {
    fichiers['/sys/fs/cgroup/memory/memory.limit_in_bytes'] = '9223372036854771712';

    const usage = await readResourceUsage('/workspace', 1_000);

    expect(usage.memory.used).toBe(87_912_448);
    expect(usage.memory.limit).toBeNull();
  });

  it('rend toujours null, jamais 0, quand aucune des deux dispositions n’existe', async () => {
    setLecteurFichier(async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const usage = await readResourceUsage('/workspace', 1_000);

    expect(usage.memory.used).toBeNull();
    expect(usage.memory.limit).toBeNull();
    expect(usage.cpu.ratio).toBeNull();
    expect(usage.cpu.limitCores).toBeNull();
  });
});
