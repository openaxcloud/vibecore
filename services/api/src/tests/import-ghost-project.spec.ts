import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

/*
 * AUDX-015 — pas de projet fantôme après un import échoué.
 *
 * Le bloc `catch` du commit annonce « full rollback — no partial target ».
 * C'était faux dès que la panne survenait APRÈS `store.createProject` :
 *
 *     const project = await store.createProject(...)      // projet CRÉÉ
 *     await projectStorage.writeFiles(...)                // peut échouer
 *     await persistProjectFileManifest(...)               // peut échouer
 *     await recordUsage(...)                              // peut échouer
 *     ...
 *   } catch (error) {
 *     await cleanupImport(importJobId, 'ROLLING_BACK', message)  // NE supprime
 *     throw error                                                // PAS le projet
 *   }
 *
 * `cleanupImport` jette le staging et compense les crédits ; il ne touche jamais
 * au projet. Une écriture de fichiers qui échoue (disque, quota, hoquet de
 * stockage) laissait donc un projet vide dans l'organisation, que rien ne
 * référençait — `targetProjectId` n'est écrit qu'à COMMITTED.
 */
class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** ProjectStorage dont l'écriture échoue, comme un disque plein. */
function failingStorage(): ProjectStorage {
  return {
    async writeFiles() {
      throw new Error('disk is full');
    },
    async listFiles() {
      return [];
    },
    async exportZip() {
      throw new Error('not used');
    },
    async importZip() {
      return [];
    },
    async createSnapshot() {
      throw new Error('not used');
    },
    async getSnapshotFiles() {
      return [];
    },
    async restoreSnapshot() {
      return [];
    },
  } as unknown as ProjectStorage;
}

async function setup(projectStorage?: ProjectStorage) {
  const store = new TestApiStore();
  const app = await buildApiApp({
    store,
    emailProvider: new QuietEmailProvider(),
    ...(projectStorage ? { projectStorage } : {}),
  });

  const user = await store.createUser({
    email: 'ghost@example.com',
    name: 'G',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'G Org', slug: 'g-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'ghost-token', expiresAt: new Date(Date.now() + 3_600_000) });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });

  return { app, store, org, auth: { authorization: 'Bearer ghost-token' } };
}

describe('AUDX-015 no ghost project when an import fails mid-commit', () => {
  it('leaves no project behind when writing the files fails', async () => {
    const { app, store, org, auth } = await setup(failingStorage());

    const before = (await store.listProjects(org.id)).length;

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth,
      payload: { provider: 'zip', idempotencyKey: 'ghost-1', files: [{ path: 'a.ts', content: 'x' }] },
    });
    const importJobId = created.json().import.importJobId;

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth,
      payload: { consent: {} },
    });

    expect(committed.statusCode).toBeGreaterThanOrEqual(400);

    /*
     * Le point du test. Pré-correctif, un projet vide restait dans l'org : créé,
     * jamais rempli, référencé par rien, invisible dans l'import — un fantôme
     * que seul un opérateur pouvait retrouver.
     */
    const after = await store.listProjects(org.id);
    expect(after).toHaveLength(before);

    const job = await store.getImportJob(importJobId);
    expect(job?.state).toBe('ROLLING_BACK');
    // Le contrat d'origine : la cible n'est jamais publiée si le commit échoue.
    expect(job?.targetProjectId).toBeUndefined();
    // Et le staging est disposé même sur ce chemin.
    expect(await store.getImportStagedFiles(importJobId)).toBeUndefined();
  });

  it('keeps the project when the commit succeeds', async () => {
    /*
     * GARDE ANTI-RÉGRESSION ASSUMÉE, verte des deux côtés, annotée comme telle :
     * un nettoyage trop zélé qui supprimerait le projet du chemin heureux serait
     * bien pire que le fantôme qu'il corrige.
     */
    const { app, store, org, auth } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth,
      payload: { provider: 'zip', idempotencyKey: 'ok-1', files: [{ path: 'a.ts', content: 'x' }] },
    });
    const importJobId = created.json().import.importJobId;

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth,
      payload: { consent: {} },
    });

    expect(committed.statusCode).toBe(201);
    expect(await store.listProjects(org.id)).toHaveLength(1);

    const job = await store.getImportJob(importJobId);
    expect(job?.state).toBe('COMMITTED');
    expect(job?.targetProjectId).toBe(committed.json().project.id);
  });
});
