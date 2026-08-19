import { readFile, statfs } from 'node:fs/promises';

/**
 * Consommation réelle de l'espace de travail : mémoire, processeur, stockage.
 *
 * SCR-008 — « jauges RAM / CPU / stockage dans Vue d'ensemble ». La règle projet
 * interdit les mocks : ces valeurs viennent donc du noyau, pas d'une estimation.
 *
 * On lit les fichiers cgroup DU CONTENEUR, et non `/proc/meminfo` : dans un pod,
 * `/proc/meminfo` montre la mémoire de l'HÔTE — une jauge bâtie dessus
 * afficherait « 3 Go sur 64 Go » pour un conteneur limité à 512 Mo, c'est-à-dire
 * un chiffre faux et rassurant. Vérifié sur la production le 19/08 :
 *
 *     /sys/fs/cgroup/memory.current -> 400769024   (382 Mio réellement utilisés)
 *     /sys/fs/cgroup/memory.max     -> 536870912   (512 Mio de limite)
 *     /sys/fs/cgroup/cpu.stat       -> usage_usec 361202069
 */

export type ResourceGauge = Readonly<{
  /** Octets consommés, ou `null` quand le noyau ne l'expose pas. */
  used: number | null;

  /** Plafond en octets, ou `null` si aucune limite n'est posée. */
  limit: number | null;
}>;

export type ResourceUsage = Readonly<{
  memory: ResourceGauge;

  /**
   * Part de processeur consommée sur l'intervalle, entre 0 et 1 (1 = un cœur
   * plein). `null` au tout premier appel : un pourcentage d'utilisation est une
   * DÉRIVÉE, il n'existe pas avant d'avoir deux mesures. Afficher 0 % en
   * attendant serait un chiffre inventé.
   */
  cpu: Readonly<{ ratio: number | null; limitCores: number | null }>;

  storage: ResourceGauge;
  measuredAt: string;
}>;

const CGROUP = '/sys/fs/cgroup';

async function lireNombre(chemin: string): Promise<number | null> {
  try {
    const brut = (await readFile(chemin, 'utf8')).trim();

    /* `max` signifie « aucune limite » en cgroup v2 — ce n'est pas une valeur. */
    if (!brut || brut === 'max') {
      return null;
    }

    const valeur = Number.parseInt(brut, 10);

    return Number.isFinite(valeur) ? valeur : null;
  } catch {
    return null;
  }
}

async function lireUsageCpuMicrosecondes(): Promise<number | null> {
  try {
    const stat = await readFile(`${CGROUP}/cpu.stat`, 'utf8');
    const ligne = stat.split('\n').find((l) => l.startsWith('usage_usec '));

    if (!ligne) {
      return null;
    }

    const valeur = Number.parseInt(ligne.slice('usage_usec '.length).trim(), 10);

    return Number.isFinite(valeur) ? valeur : null;
  } catch {
    return null;
  }
}

/**
 * `cpu.max` vaut « <quota> <période> », ou « max <période> » sans plafond. Le
 * nombre de cœurs alloués est le rapport des deux.
 */
async function lireCoeursAlloues(): Promise<number | null> {
  try {
    const brut = (await readFile(`${CGROUP}/cpu.max`, 'utf8')).trim();
    const [quota, periode] = brut.split(/\s+/u);

    if (!quota || quota === 'max' || !periode) {
      return null;
    }

    const q = Number.parseInt(quota, 10);
    const p = Number.parseInt(periode, 10);

    return Number.isFinite(q) && Number.isFinite(p) && p > 0 ? q / p : null;
  } catch {
    return null;
  }
}

/*
 * Mesure précédente du processeur. Le ratio se calcule entre DEUX relevés : on
 * garde le dernier pour que le second appel puisse produire une valeur.
 */
let precedent: { usageUsec: number; horodatage: number } | undefined;

/** Testable : remet l'état du calcul de processeur à zéro. */
export function resetCpuSampling(): void {
  precedent = undefined;
}

export async function readResourceUsage(workspaceRoot: string, now: number = Date.now()): Promise<ResourceUsage> {
  const [memoireUtilisee, memoireMax, usageUsec, coeurs] = await Promise.all([
    lireNombre(`${CGROUP}/memory.current`),
    lireNombre(`${CGROUP}/memory.max`),
    lireUsageCpuMicrosecondes(),
    lireCoeursAlloues(),
  ]);

  let ratio: number | null = null;

  if (usageUsec !== null) {
    if (precedent && now > precedent.horodatage) {
      const deltaCpuUsec = usageUsec - precedent.usageUsec;
      const deltaTempsUsec = (now - precedent.horodatage) * 1000;

      /*
       * Un compteur qui recule signale un redémarrage du conteneur : on repart
       * d'une base propre plutôt que de publier un ratio négatif.
       */
      ratio = deltaCpuUsec >= 0 ? Math.min(1, deltaCpuUsec / deltaTempsUsec / (coeurs ?? 1)) : null;
    }

    precedent = { usageUsec, horodatage: now };
  }

  let stockage: ResourceGauge = { used: null, limit: null };

  try {
    const fs = await statfs(workspaceRoot);
    const total = Number(fs.blocks) * Number(fs.bsize);
    const libre = Number(fs.bavail) * Number(fs.bsize);

    stockage = { used: total - libre, limit: total };
  } catch {
    /* Volume absent ou non monté : la jauge le dira, elle n'inventera pas. */
  }

  return {
    memory: { used: memoireUtilisee, limit: memoireMax },
    cpu: { ratio, limitCores: coeurs },
    storage: stockage,
    measuredAt: new Date(now).toISOString(),
  };
}
