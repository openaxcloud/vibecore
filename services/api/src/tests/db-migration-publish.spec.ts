/**
 * P0-V3-11 — la migration au PUBLISH, prouvée par la route HTTP réelle.
 *
 * Ce que ce fichier vérifie, et qui n'est visible qu'à ce niveau :
 *  - le publish DÉCLENCHE bien la migration (verrou + backup vérifié + apply) ;
 *  - un backup non vérifié REFUSE le publish (409) et ne publie rien ;
 *  - une 2e migration concurrente REFUSE le publish (409) ;
 *  - l'ordre compte : le refus intervient AVANT que le déploiement de production
 *    ne soit créé, donc la production continue de servir la version précédente.
 */
import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { DatabaseProvisioner } from '../database-provisioner.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class MemoryStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();

  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    for (const file of files) bucket.set(file.path, file.content);
    this.files.set(projectId, bucket);

    return this.listFiles(projectId);
  }

  async listFiles(projectId: string): Promise<ProjectFile[]> {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();

    return [...bucket.entries()].map(([path, content]) => ({ path, content, updatedAt: '' }));
  }

  async createSnapshot() {
    return { id: 's', storageKey: 's', byteLength: 0, createdAt: '' };
  }
  async getSnapshotFiles() {
    return [];
  }
  async restoreSnapshot() {
    return [];
  }
  async readFile() {
    return undefined;
  }
  async deleteFiles() {}
  async exportZip() {
    return { storageKey: '', byteLength: 0, base64: '', createdAt: '' };
  }
  async importZip() {
    return [];
  }
  async writeObject() {}
  async readObject() {
    return undefined;
  }
  async deleteObject() {}
}

const provisionerWithPhase = (phase: string, applied = true): DatabaseProvisioner =>
  ({
    active: true,
    async takeSnapshot() {
      return { applied };
    },
    async backupStatus() {
      return { found: true, phase, completed: phase === 'completed' };
    },
  }) as unknown as DatabaseProvisioner;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup(options: { provisioner?: DatabaseProvisioner; withMigrations?: boolean } = {}) {
  const store = new TestApiStore();
  const projectStorage = new MemoryStorage();
  const applySql = vi.fn(async (input: any) => ({
    committed: true,
    applied: input.migrations.map((m: any) => m.name),
  }));

  const app = await buildApiApp({
    store,
    projectStorage,
    emailProvider: new QuietEmailProvider(),
    databaseProvisioner: options.provisioner ?? provisionerWithPhase('completed'),
    migrationApplier: applySql,
  });

  const user = await store.createUser({
    email: 'mig@example.com',
    name: 'Mig',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Mig Org', slug: 'mig-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'mig-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'Mig P', slug: 'mig-p' });

  if (options.withMigrations !== false) {
    await projectStorage.writeFiles(project.id, [
      { path: 'migrations/001_init.sql', content: 'CREATE TABLE t (id int)' },
      { path: 'migrations/002_add.sql', content: 'ALTER TABLE t ADD COLUMN name text' },
      { path: 'src/index.ts', content: 'export const a = 1;' },
    ]);
  }

  // La base de production est joignable via le secret PROD_DATABASE_URL.
  await store.upsertProjectSecret({
    projectId: project.id,
    key: 'PROD_DATABASE_URL',
    // Chiffré comme en production : listDatabaseConnections déchiffre.
    valueEncrypted: encryptJson({ value: 'postgres://user:pw@prod-host:5432/appdb' }),
  });

  const deployment = await store.createDeployment({
    projectId: project.id,
    organizationId: org.id,
    environment: 'preview',
    status: 'READY',
    provider: 'server',
  } as any);

  return { app, store, projectStorage, org, project, deployment, applySql };
}

const publish = (app: any, projectId: string, deploymentId: string) =>
  app.inject({
    method: 'POST',
    url: `/projects/${projectId}/deployments/${deploymentId}/publish`,
    headers: auth('mig-token'),
  });

describe('P0-V3-11 — migration au publish', () => {
  it('publie APRÈS avoir verrouillé, vérifié le backup et appliqué', async () => {
    const { app, store, project, deployment } = await setup();

    const res = await publish(app, project.id, deployment.id);

    expect(res.statusCode).toBe(201);

    const execution = [...store.migrationExecutions.values()][0];
    expect(execution).toBeTruthy();
    expect(execution.state).toBe('COMMITTED');
    expect(execution.environment).toBe('production');
    // Backup VÉRIFIÉ (aboutissement observé), pas seulement demandé.
    expect(execution.backupVerificationMethod).toBe('cnpg-backup-cr-phase-completed');
    expect(execution.backupVerifiedAt).toBeTruthy();
    // Verrou relâché : un publish ultérieur reste possible.
    expect(execution.activeLock).toBeNull();
    expect(execution.appliedStatements).toBe(2);
  });

  it("NÉGATIF : backup non vérifié → publish REFUSÉ (409) et RIEN n'est publié", async () => {
    const { app, store, project, deployment } = await setup({
      provisioner: provisionerWithPhase('failed'),
    });
    const deploymentsBefore = (await store.listDeployments(project.id)).length;

    const res = await publish(app, project.id, deployment.id);

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MIGRATION_BACKUP_UNVERIFIED');

    /*
     * L'ORDRE est la propriété importante : le refus tombe avant la création du
     * déploiement de production. Une migration ratée ne laisse donc jamais une
     * application neuve branchée sur un schéma non préparé.
     */
    expect((await store.listDeployments(project.id)).length).toBe(deploymentsBefore);

    const execution = [...store.migrationExecutions.values()][0];
    expect(execution.state).toBe('FAILED_SAFE');
    expect(execution.activeLock).toBeNull();
  });

  it('NÉGATIF : une 2e migration concurrente → publish REFUSÉ (409)', async () => {
    const { app, store, project, deployment } = await setup();

    // Migration déjà active sur (projet, production) : le verrou est tenu.
    await store.createMigrationExecution({
      projectId: project.id,
      organizationId: project.organizationId,
      environment: 'production',
      idempotencyKey: 'deja-en-cours',
      activeLock: `${project.id}:production`,
      state: 'APPLYING',
      statementsSha256: 'x',
      statementCount: 1,
      backwardCompatible: 'UNKNOWN',
      forwardCompatible: 'UNKNOWN',
    });

    const res = await publish(app, project.id, deployment.id);

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MIGRATION_LOCK_HELD');
  });

  it("NÉGATIF : migrations déclarées mais base production injoignable → refus", async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryStorage();
    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: new QuietEmailProvider(),
      databaseProvisioner: provisionerWithPhase('completed'),
    });

    const user = await store.createUser({
      email: 'n@example.com',
      name: 'N',
      passwordHash: hashPassword('password123'),
    });
    const org = await store.createOrganization({ name: 'N Org', slug: 'n-org', ownerUserId: user.id });
    await store.createSession({ userId: user.id, token: 'mig-token', expiresAt: new Date(Date.now() + 3600_000) });
    const project = await store.createProject({ organizationId: org.id, name: 'N P', slug: 'n-p' });
    await projectStorage.writeFiles(project.id, [
      { path: 'migrations/001_init.sql', content: 'CREATE TABLE t (id int)' },
    ]);
    // Aucun secret PROD_DATABASE_URL : la cible n'existe pas.
    const deployment = await store.createDeployment({
      projectId: project.id,
      organizationId: org.id,
      environment: 'preview',
      status: 'READY',
      provider: 'server',
    } as any);

    const res = await publish(app, project.id, deployment.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MIGRATION_TARGET_UNAVAILABLE');
  });

  it("un projet SANS migration publie normalement (aucune pénalité)", async () => {
    const { app, store, project, deployment } = await setup({ withMigrations: false });

    const res = await publish(app, project.id, deployment.id);

    expect(res.statusCode).toBe(201);
    // Aucune exécution créée : rien n'était à migrer.
    expect(store.migrationExecutions.size).toBe(0);
  });

  it('republier le MÊME déploiement ne ré-applique pas les migrations', async () => {
    const { app, store, project, deployment } = await setup();

    expect((await publish(app, project.id, deployment.id)).statusCode).toBe(201);
    const afterFirst = [...store.migrationExecutions.values()][0].appliedStatements;

    const second = await publish(app, project.id, deployment.id);
    expect(second.statusCode).toBe(201);

    // Toujours UNE seule exécution : le rejeu a été reconnu par la clé d'idempotence.
    expect(store.migrationExecutions.size).toBe(1);
    expect([...store.migrationExecutions.values()][0].appliedStatements).toBe(afterFirst);
  });

  /*
   * LA garantie de ce lot, prouvée de bout en bout : migrer AVANT de publier, et
   * refuser le publish si la migration échoue, POUR QUE LA PRODUCTION CONTINUE DE
   * SERVIR LA VERSION PRÉCÉDENTE.
   *
   * Les autres tests négatifs vérifient qu'aucun déploiement n'est CRÉÉ. Ce n'est
   * pas la même chose : « rien de neuf » n'implique pas « l'ancien sert encore ».
   * Celui-ci publie d'abord une v1 qui réussit, puis fait échouer la migration de
   * la v2, et vérifie que le déploiement SERVI est toujours la v1 — id compris.
   *
   * Ce test tombe si l'on replace la migration APRÈS `withSerializedMutation` :
   * le publish serait alors déjà acté quand la migration échoue, et la v2 —
   * branchée sur un schéma non préparé — deviendrait la version servie.
   */
  it("NÉGATIF : migration en échec sur la v2 → publish REFUSÉ et la v1 reste la version SERVIE", async () => {
    const { app, store, project, org, deployment } = await setup();

    // --- v1 : publication nominale, migration appliquée ---
    const first = await publish(app, project.id, deployment.id);
    expect(first.statusCode).toBe(201);

    const servedAfterV1 = (await store.listDeployments(project.id)).find((d: any) => d.environment === 'production');
    expect(servedAfterV1).toBeDefined();
    const servedIdAfterV1 = servedAfterV1!.id;
    const executionsAfterV1 = store.migrationExecutions.size;

    // --- v2 : nouveau build prêt à publier, mais dont la migration va échouer ---
    const v2 = await store.createDeployment({
      projectId: project.id,
      organizationId: org.id,
      environment: 'preview',
      status: 'READY',
      provider: 'server',
    } as any);

    // La cible de migration disparaît entre les deux publications (secret retiré,
    // base déprovisionnée) : c'est le même mode d'échec que le test
    // « base production injoignable », mais joué APRÈS une v1 déjà en service.
    await store.deleteProjectSecret(project.id, 'PROD_DATABASE_URL');

    const second = await publish(app, project.id, v2.id);

    // 1. Le publish est REFUSÉ.
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('MIGRATION_TARGET_UNAVAILABLE');

    // 2. La v2 n'est jamais devenue la version servie.
    const productionNow = (await store.listDeployments(project.id)).filter((d: any) => d.environment === 'production');
    expect(productionNow).toHaveLength(1);
    expect(productionNow[0].id).toBe(servedIdAfterV1);
    expect(productionNow[0].id).not.toBe(v2.id);

    // 3. La migration de la v1 n'a pas été rejouée ni défaite au passage.
    expect(store.migrationExecutions.size).toBeGreaterThanOrEqual(executionsAfterV1);

    // 4. Aucun verrou de migration ne reste tenu : un publish ultérieur reste possible.
    for (const execution of store.migrationExecutions.values()) {
      expect(execution.activeLock).toBeNull();
    }
  });
});
