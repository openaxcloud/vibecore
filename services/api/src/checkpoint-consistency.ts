/**
 * Déclaration EXACTE du niveau de cohérence d'un checkpoint projet (P0-V3-09).
 *
 * Le refus expert sur P0-V3-09 était : « barrière 2 phases prouvée mais pas le
 * niveau *transaction-consistent* revendiqué ». Ce module existe pour que le
 * niveau annoncé soit DÉRIVÉ de ce que la plateforme gèle réellement, au lieu
 * d'être une chaîne écrite à la main dans l'orchestrateur.
 *
 * Ce que la barrière gèle RÉELLEMENT :
 *   - les écritures fichiers passant par les routes API (423
 *     CHECKPOINT_BARRIER_ACTIVE), sur TOUS les replicas depuis que le bail est
 *     persisté en base.
 *
 * Ce qu'elle NE gèle PAS :
 *   - les écrivains DANS le pod workspace (dev server, terminal, agent) qui
 *     écrivent sur le volume sans traverser l'API ;
 *   - les écritures SQL des clients de la base projet.
 *
 * Conséquence, dite telle quelle : un snapshot pris pendant que ces écrivains
 * peuvent courir est **crash-consistent** — l'équivalent d'une coupure de
 * courant : les fichiers sont récupérables individuellement mais rien ne
 * garantit qu'ils forment un état applicatif cohérent.
 *
 * `application-consistent` exigerait de quiescer les écrivains in-pod (flush +
 * gel), `transaction-consistent` exigerait en plus un instant commun
 * fichiers↔base (snapshot coordonné, ex. gel du volume + `pg_backup_start`
 * sous la même barrière). Ni l'un ni l'autre n'est implémenté, donc ni l'un ni
 * l'autre n'est émis. C'est volontaire : voir NEVER_CLAIMED.
 */

export type ConsistencyLevel = 'crash-consistent' | 'application-consistent' | 'transaction-consistent' | 'UNKNOWN';

/**
 * Niveaux que ce système n'a PAS le droit d'émettre tant que le mécanisme
 * correspondant n'est pas implémenté ET prouvé. Le test
 * `checkpoint-consistency.spec.ts` échoue si un niveau d'ici apparaît dans un
 * manifeste — la sur-revendication devient une erreur de CI, pas une revue.
 */
export const NEVER_CLAIMED = [
  // Exigerait de quiescer les écrivains in-pod (dev server / terminal / agent).
  'application-consistent',

  // Exigerait en plus un instant commun fichiers↔base sous la même barrière.
  'transaction-consistent',
] as const satisfies readonly ConsistencyLevel[];

/** Les niveaux non prouvés sont également impossibles à émettre au typecheck. */
export type DeclaredConsistencyLevel = Exclude<ConsistencyLevel, (typeof NEVER_CLAIMED)[number]>;

/** Ce que la barrière atteint pour un projet donné, au moment du checkpoint. */
export interface BarrierScope {
  /** Le bail de barrière est persisté → tous les replicas API le voient. */
  apiWritesFrozenAllReplicas: boolean;

  /**
   * Un runtime (pod workspace) peut écrire sur SON volume sans passer par l'API.
   * `true` dès qu'un workspace existe : on ne peut pas prouver qu'il est muet.
   */
  inPodWritersReachable: boolean;

  /** Des clients SQL peuvent écrire dans la base projet pendant le snapshot. */
  dbClientWritesReachable: boolean;
}

/**
 * Ce que le checkpoint capture RÉELLEMENT, et ce qu'il ne capture pas. Ces
 * limites sont structurelles (deux volumes distincts), pas des TODO : les
 * écrire dans le manifeste évite qu'un appelant déduise une couverture absente.
 */
export const CAPTURE_SCOPE = {
  /**
   * Le snapshot lit l'arbre projet côté API (Filestore RWX `/data/vibecore`),
   * PAS le volume vif du pod workspace (`pvc-<workspaceId>` monté sur
   * `/workspace`). Ce sont deux volumes distincts.
   */
  source: 'api-filestore-project-tree',

  /**
   * Les deux copies ne convergent que lorsqu'un onglet navigateur autosauve
   * (workbench → POST /projects/:id/files/import/zip). Il n'existe aucun
   * réconciliateur côté serveur : sans onglet ouvert, la copie API peut être
   * arbitrairement en retard sur ce que l'utilisateur voit dans l'IDE.
   */
  convergesOnlyOnBrowserAutosave: true,

  /** Écrivains hors de portée de toute barrière côté API, énumérés. */
  writersOutsideBarrier: [
    'processus dans le pod workspace (dev server, terminal, npm install) — écrivent /workspace, jamais vus par la barrière API',
    'pods de tâches planifiées montant pvc-<workspaceId> (déclenchés par setInterval in-process, sans requête HTTP)',
    'worker BullMQ de déploiement (build dans le pod)',
  ],
} as const;

export interface ConsistencyDeclaration {
  level: DeclaredConsistencyLevel;

  /** Pourquoi ce niveau et pas un autre — repris tel quel dans le manifeste. */
  basis: string;

  /** Écrivains NON gelés, énumérés. Vide ⇒ rien ne pouvait écrire. */
  unfrozenWriters: string[];
}

/**
 * Niveau du composant FICHIERS. Jamais au-dessus de `crash-consistent` : même
 * sans runtime joignable, on ne fait aucun flush applicatif, donc on ne peut
 * pas revendiquer `application-consistent`.
 */
export function declareFilesConsistency(scope: BarrierScope): ConsistencyDeclaration {
  const unfrozenWriters: string[] = [];

  if (!scope.apiWritesFrozenAllReplicas) {
    unfrozenWriters.push('écritures API sur les autres replicas (bail de barrière non persisté)');
  }

  if (scope.inPodWritersReachable) {
    unfrozenWriters.push(...CAPTURE_SCOPE.writersOutsideBarrier);
  }

  if (!scope.apiWritesFrozenAllReplicas) {
    return {
      level: 'UNKNOWN',
      basis:
        "la barrière n'est pas garantie sur tous les replicas API : l'instant du snapshot n'est pas défini, aucun niveau n'est revendiqué",
      unfrozenWriters,
    };
  }

  return {
    level: 'crash-consistent',
    basis:
      unfrozenWriters.length > 0
        ? 'les écritures API sont gelées sur tous les replicas, mais les écrivains in-pod ne le sont pas : le jeu de fichiers vaut une coupure de courant — récupérable, pas garanti applicativement cohérent'
        : "les écritures API sont gelées sur tous les replicas ; aucun flush applicatif n'est demandé aux écrivains, donc on s'en tient à crash-consistent",
    unfrozenWriters,
  };
}

/**
 * Niveau du composant BASE. Un backup physique CNPG/Barman est crash-consistent
 * par construction (base backup + WAL rejoué) ; il n'est PAS coordonné avec
 * l'instant du snapshot fichiers.
 */
export function declareDatabaseConsistency(scope: BarrierScope): ConsistencyDeclaration {
  return {
    level: 'crash-consistent',
    basis:
      'backup physique CNPG (base backup + WAL) : cohérent au sens du moteur après rejeu, mais pris hors de la barrière fichiers — aucun instant commun',
    unfrozenWriters: scope.dbClientWritesReachable ? ['clients SQL de la base projet pendant le snapshot'] : [],
  };
}

export interface CheckpointConsistency {
  /** Le plus faible des composants — jamais le plus fort. */
  level: DeclaredConsistencyLevel;
  basis: string;

  /**
   * `true` seulement si tous les composants sont capturés au MÊME instant
   * logique. Les composants étant snapshottés en SÉQUENCE (fichiers puis base),
   * c'est `false` : le partager sous un même `logicalBarrierId` ordonne les
   * étapes, il ne crée pas un instant atomique.
   */
  crossComponentAtomic: boolean;

  /** Niveaux explicitement NON revendiqués, pour couper court à la lecture haute. */
  notClaimed: readonly ConsistencyLevel[];
}

const RANK: Record<ConsistencyLevel, number> = {
  UNKNOWN: 0,
  'crash-consistent': 1,
  'application-consistent': 2,
  'transaction-consistent': 3,
};

/**
 * Agrège les composants au NIVEAU LE PLUS FAIBLE. Un checkpoint ne vaut jamais
 * mieux que son composant le plus faible — prendre le plus fort (ou « tous
 * sont X donc X ») est exactement la sur-revendication refusée en v3.
 */
export function declareCheckpointConsistency(
  components: Array<{ componentKind: string; consistency: ConsistencyDeclaration }>,
): CheckpointConsistency {
  if (components.length === 0) {
    return {
      level: 'UNKNOWN',
      basis: 'aucun composant capturé',
      crossComponentAtomic: false,
      notClaimed: NEVER_CLAIMED,
    };
  }

  const weakest = components.reduce((acc, c) => (RANK[c.consistency.level] < RANK[acc.consistency.level] ? c : acc));

  /*
   * Les composants sont snapshottés séquentiellement sous une même barrière
   * logique. La barrière ORDONNE (rien ne commence avant qu'elle tienne) mais
   * ne fige pas un instant commun : l'atomicité inter-composants est fausse dès
   * qu'il y a plus d'un composant.
   */
  const crossComponentAtomic = false;

  return {
    level: weakest.consistency.level,
    basis: `niveau du composant le plus faible (${weakest.componentKind}) : ${weakest.consistency.basis}`,
    crossComponentAtomic,
    notClaimed: NEVER_CLAIMED,
  };
}
