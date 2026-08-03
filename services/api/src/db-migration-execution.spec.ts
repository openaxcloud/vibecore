/**
 * P0-V3-11 — une migration au Publish ne doit JAMAIS corrompre les données.
 *
 * Ces tests prouvent la machine et ses REFUS. Le comportement transactionnel
 * réel (rollback d'un lot DDL partiel) est prouvé séparément sur un VRAI
 * PostgreSQL dans `db-migration-applier.integration.spec.ts` — un double en
 * mémoire ne peut pas prouver qu'un ROLLBACK défait un `ALTER TABLE`.
 */
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseProvisioner } from './database-provisioner.js';
import {
  hashStatements,
  isLockConflict,
  runPublishMigration,
  waitForVerifiedBackup,
  type DeclaredMigration,
  type MigrationExecutionStore,
} from './db-migration-execution.js';

/** Store en mémoire reproduisant les DEUX index uniques réels. */
class FakeStore implements MigrationExecutionStore {
  rows = new Map<string, any>();
  private seq = 0;

  async createMigrationExecution(input: any) {
    for (const row of this.rows.values()) {
      if (row.activeLock != null && row.activeLock === input.activeLock) {
        throw Object.assign(new Error('unique activeLock'), { code: 'P2002' });
      }

      if (row.projectId === input.projectId && row.idempotencyKey === input.idempotencyKey) {
        throw Object.assign(new Error('unique idempotencyKey'), { code: 'P2002' });
      }
    }

    const row = { ...input, id: `mig-${(this.seq += 1)}`, appliedStatements: 0 };
    this.rows.set(row.id, row);

    return { id: row.id, state: row.state };
  }

  async updateMigrationExecution(id: string, patch: any) {
    Object.assign(this.rows.get(id) ?? {}, patch);
  }

  async getMigrationExecutionByIdempotencyKey(projectId: string, idempotencyKey: string) {
    for (const row of this.rows.values()) {
      if (row.projectId === projectId && row.idempotencyKey === idempotencyKey) {
        return { id: row.id, state: row.state, appliedStatements: row.appliedStatements };
      }
    }

    return undefined;
  }
}

/** Provisionneur pilotable : phases de backup successives. */
const provisionerWith = (phases: Array<string | undefined>, applied = true): DatabaseProvisioner => {
  let index = 0;

  return {
    active: true,
    async takeSnapshot() {
      return { applied };
    },
    async backupStatus() {
      const phase = phases[Math.min(index++, phases.length - 1)];

      return { found: phase !== undefined, phase, completed: phase === 'completed' };
    },
  } as unknown as DatabaseProvisioner;
};

const MIGRATIONS: DeclaredMigration[] = [
  { name: '001_init.sql', sql: 'CREATE TABLE t (id int)' },
  { name: '002_add.sql', sql: 'ALTER TABLE t ADD COLUMN name text' },
];

const base = (store: FakeStore, overrides: Record<string, unknown> = {}) => ({
  store,
  provisioner: provisionerWith(['completed']),
  projectId: 'proj-1',
  organizationId: 'org-1',
  environment: 'production',
  idempotencyKey: 'key-1',
  migrations: MIGRATIONS,
  connectionString: 'postgres://ignored',
  applySql: vi.fn(async () => ({ committed: true, applied: MIGRATIONS.map((m) => m.name) })),
  sleep: async () => {},
  ...overrides,
});

describe('P0-V3-11 — chemin nominal', () => {
  it('exécute PLANNED→…→COMMITTED, vérifie le backup puis applique', async () => {
    const store = new FakeStore();
    const input = base(store);
    const result = await runPublishMigration(input as any);

    expect(result).toMatchObject({ ok: true, state: 'COMMITTED', replayed: false, appliedStatements: 2 });
    expect(input.applySql).toHaveBeenCalledTimes(1);

    const row = [...store.rows.values()][0];
    expect(row.state).toBe('COMMITTED');
    // Le verrou est RELÂCHÉ : une migration suivante doit pouvoir démarrer.
    expect(row.activeLock).toBeNull();
    // La vérification du backup nomme sa méthode, elle n'est pas un booléen nu.
    expect(row.backupVerificationMethod).toBe('cnpg-backup-cr-phase-completed');
    expect(row.backupVerifiedAt).toBeTruthy();
  });

  it("attend l'aboutissement du backup au lieu de se fier à la soumission", async () => {
    const store = new FakeStore();
    // running → running → completed : la vérification doit patienter.
    const input = base(store, { provisioner: provisionerWith(['running', 'running', 'completed']) });

    const result = await runPublishMigration(input as any);
    expect(result.ok).toBe(true);
    expect(input.applySql).toHaveBeenCalledTimes(1);
  });
});

describe('P0-V3-11 — NÉGATIF : sans backup vérifié, refus', () => {
  it("REFUSE d'appliquer quand le backup n'aboutit jamais (timeout)", async () => {
    const store = new FakeStore();
    const input = base(store, {
      provisioner: provisionerWith(['running']),
      backupTimeoutMs: 0, // deadline déjà dépassée
      backupPollIntervalMs: 0,
    });

    const result = await runPublishMigration(input as any);

    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_BACKUP_UNVERIFIED', state: 'FAILED_SAFE' });
    // LE point : AUCUNE instruction n'a été exécutée.
    expect(input.applySql).not.toHaveBeenCalled();
    expect([...store.rows.values()][0].activeLock).toBeNull();
  });

  it('REFUSE quand le backup part en échec (phase failed)', async () => {
    const store = new FakeStore();
    const input = base(store, { provisioner: provisionerWith(['failed']) });

    const result = await runPublishMigration(input as any);

    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_BACKUP_UNVERIFIED' });
    expect(input.applySql).not.toHaveBeenCalled();
  });

  it("REFUSE quand le backup ne peut même pas être lancé", async () => {
    const store = new FakeStore();
    const input = base(store, { provisioner: provisionerWith([undefined], false) });

    const result = await runPublishMigration(input as any);

    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_BACKUP_UNVERIFIED' });
    expect(input.applySql).not.toHaveBeenCalled();
  });

  it('le provisionneur INERTE ne vaut jamais un backup (garde anti-régression)', async () => {
    /*
     * NoopProvisioner renvoie `applied: false` et `completed: false`. Si un jour
     * quelqu'un le rendait « permissif » par commodité, ce test tomberait — c'est
     * exactement le chemin qui migrerait sans filet.
     */
    const { NoopProvisioner } = await import('./database-provisioner.js');
    const store = new FakeStore();
    const input = base(store, { provisioner: new NoopProvisioner() });

    const result = await runPublishMigration(input as any);
    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_BACKUP_UNVERIFIED' });
    expect(input.applySql).not.toHaveBeenCalled();
  });
});

describe('P0-V3-11 — NÉGATIF : concurrence', () => {
  it('REFUSE une 2e migration active sur le même (projet, environnement)', async () => {
    const store = new FakeStore();

    // 1re migration : bloquée sur un backup qui n'aboutit pas encore.
    let releaseBackup!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseBackup = resolve;
    });
    let polls = 0;
    const slowProvisioner = {
      active: true,
      async takeSnapshot() {
        return { applied: true };
      },
      async backupStatus() {
        polls += 1;

        if (polls > 1) {
          await gate;

          return { found: true, phase: 'completed', completed: true };
        }

        return { found: true, phase: 'running', completed: false };
      },
    } as unknown as DatabaseProvisioner;

    const first = runPublishMigration(
      base(store, { provisioner: slowProvisioner, idempotencyKey: 'key-A', backupPollIntervalMs: 1 }) as any,
    );

    // Laisser la 1re poser son verrou.
    await new Promise((r) => setTimeout(r, 20));

    const second = await runPublishMigration(base(store, { idempotencyKey: 'key-B' }) as any);

    expect(second).toMatchObject({ ok: false, code: 'MIGRATION_LOCK_HELD' });

    releaseBackup();
    expect((await first).ok).toBe(true);

    /*
     * Le verrou étant relâché, une migration ULTÉRIEURE passe : le refus était
     * bien temporaire, pas un blocage définitif du projet.
     */
    const third = await runPublishMigration(base(store, { idempotencyKey: 'key-C' }) as any);
    expect(third.ok).toBe(true);
  });

  it('un autre ENVIRONNEMENT n est pas bloqué par le verrou de production', async () => {
    const store = new FakeStore();
    await store.createMigrationExecution({
      projectId: 'proj-1',
      organizationId: 'org-1',
      environment: 'production',
      idempotencyKey: 'held',
      activeLock: 'proj-1:production',
      state: 'APPLYING',
      statementsSha256: 'x',
      statementCount: 1,
      backwardCompatible: 'UNKNOWN',
      forwardCompatible: 'UNKNOWN',
    });

    const dev = await runPublishMigration(
      base(store, { environment: 'development', idempotencyKey: 'dev-1' }) as any,
    );
    expect(dev.ok).toBe(true);
  });
});

describe('P0-V3-11 — idempotence', () => {
  it('rejouer la même clé ne ré-applique RIEN', async () => {
    const store = new FakeStore();
    const first = base(store);
    await runPublishMigration(first as any);

    const replay = base(store);
    const result = await runPublishMigration(replay as any);

    expect(result).toMatchObject({ ok: true, replayed: true });
    // Le second passage n'a exécuté aucune instruction.
    expect(replay.applySql).not.toHaveBeenCalled();
    expect(store.rows.size).toBe(1);
  });

  it('un lot MODIFIÉ produit une empreinte différente', () => {
    expect(hashStatements(MIGRATIONS)).not.toBe(
      hashStatements([{ name: '001_init.sql', sql: 'CREATE TABLE t (id bigint)' }]),
    );
  });
});

describe('P0-V3-11 — échec pendant l application', () => {
  it("échec applicatif → FAILED_SAFE, verrou libéré, base annoncée intacte", async () => {
    const store = new FakeStore();
    const input = base(store, {
      applySql: vi.fn(async () => {
        throw new Error('syntax error at or near "OOPS"');
      }),
    });

    const result = await runPublishMigration(input as any);

    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_FAILED_SAFE', state: 'FAILED_SAFE' });
    expect(result.ok === false && result.error).toMatch(/base inchangée/);
    expect([...store.rows.values()][0].activeLock).toBeNull();
  });

  it('COMMIT non confirmé → MANUAL_RECOVERY, jamais un FAILED_SAFE présumé', async () => {
    /*
     * Si l'applicateur rend la main sans confirmer le COMMIT, on ne SAIT pas si
     * le schéma a bougé. Annoncer « base inchangée » serait une affirmation non
     * fondée — le code demande une reprise humaine à la place.
     */
    const store = new FakeStore();
    const input = base(store, { applySql: vi.fn(async () => ({ committed: false, applied: [] })) });

    const result = await runPublishMigration(input as any);

    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_MANUAL_RECOVERY', state: 'MANUAL_RECOVERY' });
    expect([...store.rows.values()][0].activeLock).toBeNull();
  });
});

describe('P0-V3-11 — moteur', () => {
  it('REFUSE un moteur sans DDL transactionnel plutôt que de prétendre le supporter', async () => {
    const store = new FakeStore();
    const input = base(store, { engine: 'mysql' });

    const result = await runPublishMigration(input as any);

    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_ENGINE_UNSUPPORTED' });
    expect(input.applySql).not.toHaveBeenCalled();
    // Aucun verrou n'a été posé : le refus est antérieur.
    expect(store.rows.size).toBe(0);
  });
});

describe('P0-V3-11 — briques', () => {
  it('isLockConflict reconnaît Prisma P2002 et Postgres 23505', () => {
    expect(isLockConflict({ code: 'P2002' })).toBe(true);
    expect(isLockConflict({ code: '23505' })).toBe(true);
    expect(isLockConflict({ code: 'OTHER' })).toBe(false);
  });

  it('waitForVerifiedBackup ne conclut jamais au succès sur une phase inconnue', async () => {
    const result = await waitForVerifiedBackup({
      provisioner: provisionerWith(['weird-phase']),
      projectId: 'p',
      snapshotId: 's',
      timeoutMs: 0,
      pollIntervalMs: 0,
      sleep: async () => {},
      now: () => new Date(),
    });

    expect(result.verified).toBe(false);
  });
});
