/**
 * Exécution d'une migration de schéma sur la base d'un projet, au Publish
 * (P0-V3-11, CTR-DATABASE).
 *
 * Règle qui gouverne tout ce fichier : **une migration ne doit JAMAIS corrompre
 * les données**. Quand un doute subsiste, on refuse d'appliquer — on ne « tente
 * quand même ». Concrètement :
 *
 *  - I-MIG-1 : `APPLYING` exige `BACKUP_VERIFIED`, et « vérifié » veut dire que
 *    l'ABOUTISSEMENT du backup a été observé (phase CNPG `completed`), pas que
 *    le CR a été accepté. Sans cette preuve → refus, aucune instruction n'est
 *    exécutée.
 *  - I-MIG-2 : une seule migration active par (projet, environnement). Le verrou
 *    est tenu par un index UNIQUE en base, donc par le SGBD — pas par un
 *    « lister les actives puis décider » applicatif, qui laisse une fenêtre de
 *    course entre le SELECT et l'INSERT et ne voit de toute façon pas les autres
 *    replicas (l'API tourne en 2..6).
 *  - I-MIG-3 : compatibilité arrière/avant DÉCLARÉE, jamais supposée.
 *
 * Atomicité : en PostgreSQL le DDL est transactionnel. Toutes les instructions
 * tournent dans UNE transaction : un échec en cours de route déclenche un
 * ROLLBACK et la base est laissée telle qu'avant (`FAILED_SAFE`). Cette garantie
 * vaut pour Postgres et pour lui seul — MySQL committe implicitement sur DDL,
 * donc le moteur est refusé plutôt que traité comme équivalent.
 */
import { createHash } from 'node:crypto';

import type { DatabaseProvisioner } from './database-provisioner.js';
import { assertMigrationTransition, LifecycleError, type MigrationState } from './lifecycle-state-machines.js';

/** Résultat d'une tentative d'exécution. */
export type MigrationOutcome =
  | { ok: true; executionId: string; state: MigrationState; replayed: boolean; appliedStatements: number }
  | { ok: false; code: MigrationFailureCode; error: string; executionId?: string; state?: MigrationState };

export type MigrationFailureCode =
  /** Une autre migration est active sur le même (projet, environnement). */
  | 'MIGRATION_LOCK_HELD'
  /** Backup impossible à vérifier → on n'applique rien. */
  | 'MIGRATION_BACKUP_UNVERIFIED'
  /** Échec pendant l'application, transaction annulée : la base est intacte. */
  | 'MIGRATION_FAILED_SAFE'
  /** État incertain (échec au COMMIT) : intervention humaine requise. */
  | 'MIGRATION_MANUAL_RECOVERY'
  /** Moteur non supporté (pas de DDL transactionnel). */
  | 'MIGRATION_ENGINE_UNSUPPORTED';

/** Une migration déclarée par le projet : un nom stable et son SQL. */
export interface DeclaredMigration {
  /** Nom de fichier, qui sert de clé dans le registre des migrations appliquées. */
  name: string;
  sql: string;
}

/**
 * Applique les migrations NON ENCORE APPLIQUÉES dans UNE transaction, en tenant
 * le registre à jour dans la même transaction. Doit throw pour signaler l'échec.
 */
export interface SqlApplier {
  (input: { connectionString: string; migrations: DeclaredMigration[] }): Promise<{
    committed: boolean;
    applied: string[];
  }>;
}

export interface MigrationExecutionStore {
  createMigrationExecution(input: {
    projectId: string;
    organizationId: string;
    environment: string;
    idempotencyKey: string;
    activeLock: string;
    state: string;
    statementsSha256: string;
    statementCount: number;
    backwardCompatible: string;
    forwardCompatible: string;
    deploymentId?: string;
    createdByUserId?: string;
  }): Promise<{ id: string; state: string }>;
  updateMigrationExecution(
    id: string,
    patch: {
      state?: string;
      activeLock?: string | null;
      backupId?: string;
      backupVerifiedAt?: string;
      backupVerificationMethod?: string;
      appliedStatements?: number;
      error?: string;
      completedAt?: string;
    },
  ): Promise<void>;
  getMigrationExecutionByIdempotencyKey(
    projectId: string,
    idempotencyKey: string,
  ): Promise<{ id: string; state: string; appliedStatements: number } | undefined>;
}

/** Levée quand l'INSERT viole l'index unique du verrou. */
export function isLockConflict(error: unknown): boolean {
  const code = (error as { code?: string })?.code;

  // P2002 = violation d'unicité Prisma ; 23505 = code natif Postgres.
  return code === 'P2002' || code === '23505';
}

/** Empreinte des instructions : deux plans différents ne partagent pas une clé. */
export function hashStatements(migrations: DeclaredMigration[]): string {
  return createHash('sha256')
    .update(migrations.map((m) => `${m.name}:${m.sql}`).join(';\n'))
    .digest('hex');
}

export interface RunPublishMigrationInput {
  store: MigrationExecutionStore;
  provisioner: DatabaseProvisioner;
  projectId: string;
  organizationId: string;
  environment: string;
  idempotencyKey: string;
  migrations: DeclaredMigration[];
  connectionString: string;
  engine?: 'postgres' | 'mysql' | string;
  deploymentId?: string;
  createdByUserId?: string;
  backwardCompatible?: boolean | 'UNKNOWN';
  forwardCompatible?: boolean | 'UNKNOWN';
  applySql: SqlApplier;
  /** Fenêtre d'attente de l'aboutissement du backup. */
  backupTimeoutMs?: number;
  backupPollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const DEFAULT_BACKUP_TIMEOUT_MS = 180_000;
const DEFAULT_BACKUP_POLL_MS = 3_000;

/**
 * Attend l'ABOUTISSEMENT réel du backup. Renvoie `verified: false` sur timeout,
 * échec ou absence — jamais un succès par défaut : c'est précisément le cas où
 * appliquer une migration ferait perdre des données sans filet.
 */
export async function waitForVerifiedBackup(input: {
  provisioner: DatabaseProvisioner;
  projectId: string;
  snapshotId: string;
  timeoutMs: number;
  pollIntervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}): Promise<{ verified: boolean; phase?: string; method: string; error?: string }> {
  const deadline = input.now().getTime() + input.timeoutMs;

  for (;;) {
    type BackupStatus = { found: boolean; phase?: string; completed: boolean; error?: string };

    /*
     * Une erreur de lecture (API k8s injoignable, RBAC) est traitée comme
     * « non abouti », pas comme un échec définitif : on re-tentera jusqu'au
     * deadline. Ce qui n'est jamais fait, c'est de la traiter comme un succès.
     */
    const status: BackupStatus = await input.provisioner
      .backupStatus({ projectId: input.projectId, snapshotId: input.snapshotId })
      .catch((error: unknown): BackupStatus => ({
        found: false,
        completed: false,
        error: error instanceof Error ? error.message : String(error),
      }));

    if (status.completed) {
      return { verified: true, phase: status.phase, method: 'cnpg-backup-cr-phase-completed' };
    }

    // Une phase d'échec est terminale : ré-interroger ne la fera pas réussir.
    if (status.phase && /failed/i.test(status.phase)) {
      return {
        verified: false,
        phase: status.phase,
        method: 'cnpg-backup-cr-phase-completed',
        error: status.error ?? `backup en phase ${status.phase}`,
      };
    }

    if (input.now().getTime() >= deadline) {
      return {
        verified: false,
        phase: status.phase,
        method: 'cnpg-backup-cr-phase-completed',
        error: status.error ?? `backup non abouti avant ${input.timeoutMs} ms (phase=${status.phase ?? 'inconnue'})`,
      };
    }

    await input.sleep(input.pollIntervalMs);
  }
}

const declared = (value: boolean | 'UNKNOWN' | undefined): string =>
  value === undefined ? 'UNKNOWN' : String(value);

/**
 * Machine PLANNED → LOCK_ACQUIRED → BACKUP_VERIFIED → APPLYING → VALIDATING →
 * COMMITTED, avec sortie d'échec sûre. Chaque transition passe par
 * `assertMigrationTransition` : la garde `MIGRATION_APPLY_BEFORE_BACKUP` est
 * exécutée pour de vrai, pas seulement décrite dans un contrat.
 */
export async function runPublishMigration(input: RunPublishMigrationInput): Promise<MigrationOutcome> {
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /*
   * IDEMPOTENCE — rejouer la même clé ne ré-applique JAMAIS les instructions.
   * Un publish relancé (retry réseau, double-clic, worker qui reprend) doit être
   * sans effet, sinon un `ALTER TABLE … ADD COLUMN` rejoué casse la migration.
   */
  const existing = await input.store.getMigrationExecutionByIdempotencyKey(input.projectId, input.idempotencyKey);

  if (existing) {
    return {
      ok: true,
      executionId: existing.id,
      state: existing.state as MigrationState,
      replayed: true,
      appliedStatements: existing.appliedStatements,
    };
  }

  const engine = input.engine ?? 'postgres';

  if (engine !== 'postgres') {
    /*
     * Refus explicite : sans DDL transactionnel (MySQL committe implicitement),
     * un échec à mi-parcours laisse un schéma à moitié muté — l'inverse de la
     * garantie annoncée. Mieux vaut ne pas supporter que prétendre supporter.
     */
    return {
      ok: false,
      code: 'MIGRATION_ENGINE_UNSUPPORTED',
      error: `moteur ${engine} : pas de DDL transactionnel, un échec partiel ne serait pas annulable`,
    };
  }

  let state: MigrationState = 'PLANNED';
  const statementsSha256 = hashStatements(input.migrations);

  // ---- LOCK_ACQUIRED : le SGBD arbitre, pas l'application (I-MIG-2). ----
  assertMigrationTransition(state, 'LOCK_ACQUIRED');

  let execution: { id: string; state: string };

  try {
    execution = await input.store.createMigrationExecution({
      projectId: input.projectId,
      organizationId: input.organizationId,
      environment: input.environment,
      idempotencyKey: input.idempotencyKey,
      activeLock: `${input.projectId}:${input.environment}`,
      state: 'LOCK_ACQUIRED',
      statementsSha256,
      statementCount: input.migrations.length,
      backwardCompatible: declared(input.backwardCompatible),
      forwardCompatible: declared(input.forwardCompatible),
      deploymentId: input.deploymentId,
      createdByUserId: input.createdByUserId,
    });
  } catch (error) {
    if (isLockConflict(error)) {
      return {
        ok: false,
        code: 'MIGRATION_LOCK_HELD',
        error: `une migration est déjà active sur ${input.projectId}/${input.environment}`,
      };
    }

    throw error;
  }

  state = 'LOCK_ACQUIRED';

  /** Libère le verrou : sans ça, un échec bloquerait toute migration ultérieure. */
  const release = async (finalState: MigrationState, patch: Record<string, unknown> = {}) => {
    await input.store
      .updateMigrationExecution(execution.id, {
        state: finalState,
        activeLock: null,
        completedAt: now().toISOString(),
        ...patch,
      })
      .catch(() => undefined);
  };

  try {
    // ---- BACKUP_VERIFIED : observé abouti, pas seulement demandé (I-MIG-1). ----
    const snapshotId = `mig_${execution.id}`;
    const submitted = await input.provisioner
      .takeSnapshot({ projectId: input.projectId, snapshotId })
      .catch(() => ({ applied: false }));

    if (!submitted.applied) {
      assertMigrationTransition(state, 'FAILED_SAFE');
      await release('FAILED_SAFE', { error: 'backup refusé par le provisionneur — aucune instruction exécutée' });

      return {
        ok: false,
        code: 'MIGRATION_BACKUP_UNVERIFIED',
        error: "le backup n'a pas pu être lancé — migration refusée, la base est intacte",
        executionId: execution.id,
        state: 'FAILED_SAFE',
      };
    }

    const backup = await waitForVerifiedBackup({
      provisioner: input.provisioner,
      projectId: input.projectId,
      snapshotId,
      timeoutMs: input.backupTimeoutMs ?? DEFAULT_BACKUP_TIMEOUT_MS,
      pollIntervalMs: input.backupPollIntervalMs ?? DEFAULT_BACKUP_POLL_MS,
      sleep,
      now,
    });

    if (!backup.verified) {
      assertMigrationTransition(state, 'FAILED_SAFE');
      await release('FAILED_SAFE', { backupId: snapshotId, error: backup.error ?? 'backup non vérifié' });

      return {
        ok: false,
        code: 'MIGRATION_BACKUP_UNVERIFIED',
        error: `backup non vérifié (${backup.error ?? 'aboutissement non observé'}) — migration refusée, aucune instruction exécutée`,
        executionId: execution.id,
        state: 'FAILED_SAFE',
      };
    }

    assertMigrationTransition(state, 'BACKUP_VERIFIED');
    state = 'BACKUP_VERIFIED';
    await input.store.updateMigrationExecution(execution.id, {
      state,
      backupId: snapshotId,
      backupVerifiedAt: now().toISOString(),
      backupVerificationMethod: backup.method,
    });

    // ---- APPLYING : la garde refuse d'arriver ici sans BACKUP_VERIFIED. ----
    assertMigrationTransition(state, 'APPLYING');
    state = 'APPLYING';
    await input.store.updateMigrationExecution(execution.id, { state });

    let committed = false;
    let appliedNames: string[] = [];

    try {
      const result = await input.applySql({
        connectionString: input.connectionString,
        migrations: input.migrations,
      });
      committed = result.committed;
      appliedNames = result.applied;
    } catch (error) {
      /*
       * L'applicateur annule la transaction avant de propager : la base est dans
       * son état d'avant. C'est un échec SÛR, distinct d'un état incertain.
       */
      const message = error instanceof Error ? error.message : String(error);
      assertMigrationTransition(state, 'FAILED_SAFE');
      await release('FAILED_SAFE', { error: message });

      return {
        ok: false,
        code: 'MIGRATION_FAILED_SAFE',
        error: `migration annulée, base inchangée : ${message}`,
        executionId: execution.id,
        state: 'FAILED_SAFE',
      };
    }

    if (!committed) {
      /*
       * L'applicateur a rendu la main sans confirmer le COMMIT : on ne SAIT pas
       * si les instructions ont pris. Annoncer FAILED_SAFE serait une affirmation
       * non fondée — on demande une reprise humaine.
       */
      assertMigrationTransition(state, 'MANUAL_RECOVERY');
      await release('MANUAL_RECOVERY', {
        error: 'COMMIT non confirmé — état de la base indéterminé, reprise manuelle requise',
      });

      return {
        ok: false,
        code: 'MIGRATION_MANUAL_RECOVERY',
        error: "COMMIT non confirmé : l'état du schéma est indéterminé, reprise manuelle requise",
        executionId: execution.id,
        state: 'MANUAL_RECOVERY',
      };
    }

    // ---- VALIDATING → COMMITTED ----
    assertMigrationTransition(state, 'VALIDATING');
    state = 'VALIDATING';
    await input.store.updateMigrationExecution(execution.id, {
      state,
      // Nombre RÉELLEMENT appliqué (les migrations déjà présentes au registre
      // sont sautées), pas le nombre planifié.
      appliedStatements: appliedNames.length,
    });

    assertMigrationTransition(state, 'COMMITTED');
    state = 'COMMITTED';
    await release('COMMITTED', { appliedStatements: appliedNames.length });

    return {
      ok: true,
      executionId: execution.id,
      state,
      replayed: false,
      appliedStatements: appliedNames.length,
    };
  } catch (error) {
    /*
     * Filet de sécurité : toute erreur inattendue libère le verrou. Un verrou
     * laissé pris bloquerait définitivement les migrations du projet.
     */
    const message = error instanceof Error ? error.message : String(error);
    await release(error instanceof LifecycleError ? 'MANUAL_RECOVERY' : 'FAILED_SAFE', { error: message });

    return {
      ok: false,
      code: error instanceof LifecycleError ? 'MIGRATION_MANUAL_RECOVERY' : 'MIGRATION_FAILED_SAFE',
      error: message,
      executionId: execution.id,
    };
  }
}
