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
 *
 * ⚠️ Ce relevé du 19/08 a été fait sur un pod de la PLATEFORME, pas dans un
 * espace de travail. Mesuré live le 20/08 sur le projet réel, l'agent rendait
 * `memory: null` et `cpu: null` à chaque rafraîchissement, alors que
 * `storage` — seul à passer par `statfs` et non par cgroup — sortait juste.
 * Les espaces de travail tournent sous gVisor, qui expose la disposition
 * cgroup **v1** ; les chemins v2 ci-dessus n'y existent tout simplement pas.
 *
 * On lit donc v2 d'abord, puis v1 en repli. Le rendu refusait déjà d'inventer
 * un zéro, c'est ce qui a rendu le trou visible au lieu de le maquiller en
 * « 0 % ».
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

/*
 * cgroup v1 place chaque contrôleur dans son propre sous-dossier. Les sentinelles
 * de « pas de limite » y sont d'énormes entiers (`LIMIT_MAX_V1`) plutôt que le
 * mot `max` de v2 : au-delà de ce seuil, il n'y a pas de plafond à afficher.
 */
const CGROUP_V1_MEMOIRE_UTILISEE = `${CGROUP}/memory/memory.usage_in_bytes`;
const CGROUP_V1_MEMOIRE_LIMITE = `${CGROUP}/memory/memory.limit_in_bytes`;
const CGROUP_V1_CPU_USAGE_NS = `${CGROUP}/cpuacct/cpuacct.usage`;
const CGROUP_V1_CPU_QUOTA = `${CGROUP}/cpu/cpu.cfs_quota_us`;
const CGROUP_V1_CPU_PERIODE = `${CGROUP}/cpu/cpu.cfs_period_us`;
const LIMIT_MAX_V1 = 2 ** 62;

/*
 * Lecteur de fichier injectable. Le repli v1 se teste ainsi sans simuler tout
 * `node:fs/promises` : les cgroup d'une machine de développement ne sont pas
 * ceux d'un pod gVisor, et un test qui monte le vrai noyau ne prouverait rien
 * de reproductible.
 */
export type LecteurFichier = (chemin: string) => Promise<string>;

let lecteur: LecteurFichier = (chemin) => readFile(chemin, 'utf8') as Promise<string>;

/** Testable : remplace le lecteur de fichier ; sans argument, remet le vrai. */
export function setLecteurFichier(remplacant?: LecteurFichier): void {
  lecteur = remplacant ?? ((chemin) => readFile(chemin, 'utf8') as Promise<string>);
}

async function lireNombre(chemin: string): Promise<number | null> {
  try {
    const brut = (await lecteur(chemin)).trim();

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
    const stat = await lecteur(`${CGROUP}/cpu.stat`);
    const ligne = stat.split('\n').find((l) => l.startsWith('usage_usec '));

    if (ligne) {
      const valeur = Number.parseInt(ligne.slice('usage_usec '.length).trim(), 10);

      if (Number.isFinite(valeur)) {
        return valeur;
      }
    }
  } catch {
    /* Pas de cgroup v2 ici : on tente v1 ci-dessous. */
  }

  /* v1 : `cpuacct.usage` est en NANOsecondes — d'où la division par 1000. */
  const nanosecondes = await lireNombre(CGROUP_V1_CPU_USAGE_NS);

  return nanosecondes === null ? null : Math.floor(nanosecondes / 1000);
}

/**
 * `cpu.max` vaut « <quota> <période> », ou « max <période> » sans plafond. Le
 * nombre de cœurs alloués est le rapport des deux.
 */
async function lireCoeursAlloues(): Promise<number | null> {
  try {
    const brut = (await lecteur(`${CGROUP}/cpu.max`)).trim();
    const [quota, periode] = brut.split(/\s+/u);

    if (quota && quota !== 'max' && periode) {
      const q = Number.parseInt(quota, 10);
      const p = Number.parseInt(periode, 10);

      if (Number.isFinite(q) && Number.isFinite(p) && p > 0) {
        return q / p;
      }
    }
  } catch {
    /* Pas de cgroup v2 ici : on tente v1 ci-dessous. */
  }

  /* v1 : quota et période vivent dans deux fichiers. `-1` = aucun plafond. */
  const [quotaV1, periodeV1] = await Promise.all([lireNombre(CGROUP_V1_CPU_QUOTA), lireNombre(CGROUP_V1_CPU_PERIODE)]);

  if (quotaV1 === null || quotaV1 <= 0 || periodeV1 === null || periodeV1 <= 0) {
    return null;
  }

  return quotaV1 / periodeV1;
}

/**
 * Mémoire consommée et plafond, cgroup v2 puis v1.
 *
 * En v1, « aucune limite » n'est pas un mot-clé mais un entier gigantesque
 * (souvent `9223372036854771712`) : au-delà de `LIMIT_MAX_V1` on rend `null`,
 * exactement comme le `max` de v2 — sinon la jauge annoncerait « 84 Mio sur
 * 8 exaoctets », un chiffre vrai et parfaitement inutile.
 */
async function lireMemoire(): Promise<ResourceGauge> {
  const [utiliseeV2, maxV2] = await Promise.all([
    lireNombre(`${CGROUP}/memory.current`),
    lireNombre(`${CGROUP}/memory.max`),
  ]);

  if (utiliseeV2 !== null) {
    return { used: utiliseeV2, limit: maxV2 };
  }

  const [utiliseeV1, limiteV1] = await Promise.all([
    lireNombre(CGROUP_V1_MEMOIRE_UTILISEE),
    lireNombre(CGROUP_V1_MEMOIRE_LIMITE),
  ]);

  return {
    used: utiliseeV1,
    limit: limiteV1 !== null && limiteV1 < LIMIT_MAX_V1 ? limiteV1 : null,
  };
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
  const [memoire, usageUsec, coeurs] = await Promise.all([
    lireMemoire(),
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
    memory: memoire,
    cpu: { ratio, limitCores: coeurs },
    storage: stockage,
    measuredAt: new Date(now).toISOString(),
  };
}
