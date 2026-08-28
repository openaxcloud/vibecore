import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { projectCheckpointAdmissible } from '../lifecycle-state-machines.js';
import type { ProjectManifest } from '../project-manifest.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/**
 * In-memory storage with REAL snapshot semantics (archive + re-read), plus two
 * test hooks: an optional deferred gate inside createSnapshot (to observe the
 * write barrier WHILE a checkpoint is mid-flight) and an optional failure
 * injection (to prove the guaranteed thaw on the failure path).
 */
class CheckpointStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  readonly snapshots = new Map<string, ProjectFile[]>();
  private seq = 0;

  /** Test hook: resolved by the test to let a mid-flight snapshot finish. */
  snapshotGate: Promise<void> | null = null;

  /** Test hook: next createSnapshot throws (failure-path proof). */
  failNextSnapshot = false;

  async writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string }>,
    _scope: { expectedOrganizationId: string; workspaceId?: string },
  ) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    for (const file of files) bucket.set(file.path, file.content);
    this.files.set(projectId, bucket);
    return this.listFiles(projectId, _scope);
  }

  async listFiles(
    projectId: string,
    scope: { expectedOrganizationId: string; workspaceId?: string },
  ): Promise<ProjectFile[]> {
    return this.listFilesWithinPhysicalAccess(projectId, scope.workspaceId);
  }

  async listFilesWithinPhysicalAccess(projectId: string, _workspaceId?: string): Promise<ProjectFile[]> {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    const updatedAt = new Date().toISOString();
    return [...bucket.entries()].map(([path, content]) => ({ path, content, updatedAt }));
  }

  async createSnapshot(input: {
    projectId: string;
    expectedOrganizationId: string;
    label?: string;
    files: ProjectFile[];
  }) {
    if (this.failNextSnapshot) {
      this.failNextSnapshot = false;
      throw new Error('injected snapshot failure');
    }

    if (this.snapshotGate) {
      await this.snapshotGate;
    }

    const storageKey = `ckpt-snap-${(this.seq += 1)}`;
    this.snapshots.set(
      storageKey,
      input.files.map((f) => ({ ...f })),
    );
    return { id: storageKey, storageKey, byteLength: 1, createdAt: new Date().toISOString() };
  }

  async getSnapshotFiles(
    projectId: string,
    storageKey: string,
    _scope: { expectedOrganizationId: string; workspaceId?: string },
  ): Promise<ProjectFile[]> {
    return this.getSnapshotFilesWithinPhysicalAccess(projectId, storageKey);
  }

  async getSnapshotFilesWithinPhysicalAccess(_projectId: string, storageKey: string): Promise<ProjectFile[]> {
    return (this.snapshots.get(storageKey) ?? []).map((f) => ({ ...f }));
  }

  async readFile() {
    return undefined;
  }
  async deleteFiles() {}
  async deleteProjectFiles(projectId: string, _scope: { expectedOrganizationId: string; workspaceId?: string }) {
    this.files.delete(projectId);
  }
  async eraseProjectDataWithinPhysicalAccess(projectId: string) {
    this.files.delete(projectId);
  }
  async exportZip(_projectId: string, _scope: { expectedOrganizationId: string; workspaceId?: string }) {
    return { storageKey: 'export', byteLength: 0, base64: '', createdAt: new Date().toISOString() };
  }
  async importZip(
    _projectId: string,
    _base64: string,
    _scope: { expectedOrganizationId: string; workspaceId?: string },
    _options?: { replaceExisting?: boolean },
  ) {
    return [];
  }
  async writeObject() {}
  async readObject() {
    return undefined;
  }
  async deleteObject() {}
  async restoreSnapshot(
    _input: {
      projectId: string;
      expectedOrganizationId: string;
      workspaceId?: string;
      files: ProjectFile[];
    },
    _guard?: () => Promise<void>,
  ) {
    return [];
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const projectStorage = new CheckpointStorage();
  const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'ckpt@example.com',
    name: 'Ckpt',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Ckpt Org', slug: 'ckpt-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'ckpt-token', expiresAt: new Date(Date.now() + 3600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'Ckpt Project', slug: 'ckpt-project' });
  await projectStorage.writeFiles(
    project.id,
    [
      { path: 'src/app.ts', content: 'export const V = 1;\n' },
      { path: 'README.md', content: '# checkpoint me\n' },
    ],
    { expectedOrganizationId: org.id },
  );

  return { app, store, projectStorage, org, project };
}

describe('Checkpoint PROJET coordonné — câblage réel (plan §15, CTR-CHECKPOINT)', () => {
  it('exécute la machine complète et produit un manifeste COMPLET et vérifié', async () => {
    const { app, store, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints`,
      headers: auth('ckpt-token'),
    });
    expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
    const ckpt = res.json().checkpoint;

    expect(ckpt.state).toBe('COMMITTED');
    expect(ckpt.logicalBarrierId).toMatch(/^bar_/);
    /*
     * Ce test exigeait `application-consistent` — c'était précisément la
     * sur-revendication refusée en P0-V3-09 : la barrière ne gèle pas les
     * écrivains in-pod, donc le jeu de fichiers vaut une coupure de courant.
     * Le niveau honnête est crash-consistent (checkpoint-consistency.ts).
     */
    expect(ckpt.consistencyLevel).toBe('crash-consistent');
    expect(ckpt.manifest.crossComponentAtomic).toBe(false);
    const manifest = ckpt.manifest;
    // Manifeste exigé par la directive : consistencyLevel, logicalBarrierId,
    // snapshots + hashes, compat restore, expiration.
    expect(manifest.logicalBarrierId).toBe(ckpt.logicalBarrierId);
    expect(manifest.contentHashes.files).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.restoreCompatibility.files).toBe('project-files-v1');
    expect(manifest.projectManifest).toEqual({
      schemaVersion: 1,
      manifestVersion: 1,
      digest: (await store.getLatestProjectManifest(project.id))?.digest,
    });
    expect(new Date(manifest.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const filesComp = manifest.components.find((c: { componentKind: string }) => c.componentKind === 'FILES');
    expect(filesComp.verified).toBe(true);
    expect(filesComp.logicalBarrierId).toBe(ckpt.logicalBarrierId);

    // Persisté et relisible.
    const got = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/checkpoints/${ckpt.id}`,
      headers: auth('ckpt-token'),
    });
    expect(got.json().checkpoint.state).toBe('COMMITTED');
    expect(store.projectCheckpoints.size).toBe(1);
  });

  it('GÈLE les écritures pendant la barrière (423) et les DÉGÈLE après', async () => {
    const { app, projectStorage, project } = await setup();
    const currentManifest = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/manifest`,
      headers: auth('ckpt-token'),
    });
    const nextManifest = {
      ...(currentManifest.json().manifest as ProjectManifest),
      manifestVersion: 2,
      scopes: ['checkpoint:race'],
    };

    // Retenir le snapshot en vol pour observer la barrière active.
    let release!: () => void;
    projectStorage.snapshotGate = new Promise((r) => {
      release = r;
    });

    const inflight = app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints`,
      headers: auth('ckpt-token'),
    });

    // Laisser l'orchestrateur atteindre la barrière puis tenter une écriture.
    await new Promise((r) => setTimeout(r, 50));
    const during = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/files/import/zip`,
      headers: auth('ckpt-token'),
      payload: { zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' }, // zip vide valide
    });
    expect(during.statusCode).toBe(423);
    expect(during.json().code).toBe('CHECKPOINT_BARRIER_ACTIVE');
    const manifestWrite = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: auth('ckpt-token'),
      payload: { expectedDigest: currentManifest.json().digest, manifest: nextManifest },
    });
    expect(manifestWrite.statusCode).toBe(423);
    expect(manifestWrite.json().code).toBe('CHECKPOINT_BARRIER_ACTIVE');

    release();
    projectStorage.snapshotGate = null;
    const done = await inflight;
    expect(done.statusCode).toBe(201);

    // Après COMMITTED : dégel — la même écriture passe.
    const after = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/files/import/zip`,
      headers: auth('ckpt-token'),
      payload: { zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' },
    });
    expect(after.statusCode).not.toBe(423);
  });

  it("DÉGEL GARANTI sur le chemin d'échec : snapshot qui explose → CLEANED + barrière levée", async () => {
    const { app, store, projectStorage, project } = await setup();

    projectStorage.failNextSnapshot = true;
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints`,
      headers: auth('ckpt-token'),
    });
    expect(res.statusCode).toBe(500);

    const ckpt = [...store.projectCheckpoints.values()][0];
    expect(ckpt.state).toBe('CLEANED'); // ABORTING → CLEANED, jamais bloqué

    // La barrière est levée : une écriture passe immédiatement.
    const write = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/files/import/zip`,
      headers: auth('ckpt-token'),
      payload: { zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' },
    });
    expect(write.statusCode).not.toBe(423);
  });

  it('RESTORE VÉRIFIÉ : le contenu restauré re-hash exactement le manifeste, dans un projet JETABLE', async () => {
    const { app, projectStorage, project } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints`,
      headers: auth('ckpt-token'),
    });
    const ckpt = created.json().checkpoint;

    // Modifier le projet APRÈS le checkpoint : le snapshot doit rester figé.
    await projectStorage.writeFiles(project.id, [{ path: 'src/app.ts', content: 'export const V = 999;\n' }], {
      expectedOrganizationId: project.organizationId,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints/${ckpt.id}/restore-verify`,
      headers: auth('ckpt-token'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.restoreVerified).toBe(true);
    expect(body.restoredHash).toBe(ckpt.manifest.contentHashes.files);
    expect(body.targetProjectId).not.toBe(project.id); // jamais d'écrasement du source

    // Le projet jetable contient la version DU CHECKPOINT (V=1), pas la V=999.
    const restored = await projectStorage.listFiles(body.targetProjectId, {
      expectedOrganizationId: project.organizationId,
    });
    expect(restored.find((f) => f.path === 'src/app.ts')?.content).toContain('V = 1');
  });

  it('refuse un restore si la topologie du ProjectManifest a changé après le checkpoint', async () => {
    const { app, store, project } = await setup();
    const created = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints`,
      headers: auth('ckpt-token'),
    });
    expect(created.statusCode).toBe(201);
    const checkpoint = created.json().checkpoint;
    const current = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/manifest`,
      headers: auth('ckpt-token'),
    });
    const changed = {
      ...(current.json().manifest as ProjectManifest),
      manifestVersion: 2,
      scopes: ['api:changed-after-checkpoint'],
    };
    const update = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: auth('ckpt-token'),
      payload: { expectedDigest: current.json().digest, manifest: changed },
    });
    expect(update.statusCode).toBe(200);
    const projectCount = store.projects.size;

    const restore = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints/${checkpoint.id}/restore-verify`,
      headers: auth('ckpt-token'),
    });
    expect(restore.statusCode).toBe(409);
    expect(restore.json().code).toBe('CHECKPOINT_PROJECT_MANIFEST_CHANGED');
    expect(store.projects.size).toBe(projectCount);
  });

  it("un snapshot de POD seul n'est JAMAIS un checkpoint projet (admissibilité)", () => {
    const pod = {
      componentKind: 'POD' as const,
      snapshotId: 'p',
      logicalBarrierId: 'b',
      startedAt: 'now',
      consistencyLevel: 'crash-consistent' as const,
      encryptionKeyVersion: 'k',
      restoreCompatibility: 'v',
      verified: true,
    };
    expect(projectCheckpointAdmissible([pod], { databaseProvisioned: false }).admissible).toBe(false);

    // Base provisionnée sans composant DATABASE ni dépendance déclarée → refus.
    const files = { ...pod, componentKind: 'FILES' as const };
    expect(projectCheckpointAdmissible([files], { databaseProvisioned: true }).admissible).toBe(false);
    // …mais admissible si la dépendance est DÉCLARÉE (infra dormante, dit tel quel).
    expect(
      projectCheckpointAdmissible([files], { databaseProvisioned: true, databaseDependencyDeclared: true }).admissible,
    ).toBe(true);
  });
});
