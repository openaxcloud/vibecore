/**
 * PREUVE DE RESTORE RÉELLE + portée exacte de la barrière (P0-V3-09).
 *
 * Le refus expert portait sur deux choses : un niveau de cohérence revendiqué
 * au-dessus de ce qui est prouvé, et un « restore » qui n'en était pas un
 * (`restore-verify` recopie l'archive dans un projet JETABLE — ça montre qu'une
 * archive est relisible, pas qu'on sait ramener un projet cassé).
 *
 * Ce fichier prouve le cycle demandé, sur le PROJET LUI-MÊME :
 *   créer des données → checkpoint → casser → restore → données d'origine
 *   retrouvées, vérifiées par relecture du stockage.
 */
import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { NEVER_CLAIMED } from '../checkpoint-consistency.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/**
 * Stockage en mémoire aux sémantiques RÉELLES : `restoreSnapshot` remplace
 * l'arbre (comme `LocalProjectStorage`, qui vide puis réécrit), sinon le test
 * « restaure » sans rien remplacer et prouverait le contraire de ce qu'il dit.
 */
class MemoryProjectStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  readonly snapshots = new Map<string, ProjectFile[]>();
  private seq = 0;

  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    for (const file of files) bucket.set(file.path, file.content);
    this.files.set(projectId, bucket);

    return this.listFiles(projectId);
  }

  async listFiles(projectId: string): Promise<ProjectFile[]> {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    const updatedAt = new Date().toISOString();

    return [...bucket.entries()].map(([path, content]) => ({ path, content, updatedAt }));
  }

  async createSnapshot(input: { projectId: string; label?: string; files: ProjectFile[] }) {
    const storageKey = `ckpt-snap-${(this.seq += 1)}`;
    this.snapshots.set(
      storageKey,
      input.files.map((f) => ({ ...f })),
    );

    return { id: storageKey, storageKey, byteLength: 1, createdAt: new Date().toISOString() };
  }

  async getSnapshotFiles(storageKey: string): Promise<ProjectFile[]> {
    return (this.snapshots.get(storageKey) ?? []).map((f) => ({ ...f }));
  }

  /** REMPLACE l'arbre, comme le vrai stockage — pas une fusion. */
  async restoreSnapshot(input: { projectId: string; files: ProjectFile[] }) {
    const bucket = new Map<string, string>();
    for (const file of input.files) bucket.set(file.path, file.content);
    this.files.set(input.projectId, bucket);

    return this.listFiles(input.projectId);
  }

  async readFile() {
    return undefined;
  }
  async deleteFiles(projectId: string, paths: string[]) {
    const bucket = this.files.get(projectId);
    for (const p of paths) bucket?.delete(p);
  }
  async exportZip() {
    return { storageKey: 'export', byteLength: 0, base64: '', createdAt: new Date().toISOString() };
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

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const projectStorage = new MemoryProjectStorage();
  const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'restore@example.com',
    name: 'Restore',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'R Org', slug: 'r-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'r-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'R Project', slug: 'r-project' });

  return { app, store, projectStorage, org, project };
}

describe('P0-V3-09 — restore RÉEL prouvé par le contenu', () => {
  it('créer → checkpoint → casser → restore → les données D ORIGINE sont retrouvées', async () => {
    const { app, projectStorage, project } = await setup();

    // (1) CRÉER des données identifiables.
    await projectStorage.writeFiles(project.id, [
      { path: 'src/index.ts', content: 'export const ANSWER = 42;\n' },
      { path: 'data/seed.json', content: '{"rows":[1,2,3]}\n' },
      { path: 'README.md', content: '# original\n' },
    ]);

    // (2) CHECKPOINT.
    const created = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints`,
      headers: auth('r-token'),
    });
    expect(created.statusCode).toBe(201);
    const ckpt = created.json().checkpoint;
    expect(ckpt.state).toBe('COMMITTED');

    // (3) CASSER : une valeur modifiée, un fichier supprimé, un fichier parasite.
    await projectStorage.restoreSnapshot({
      projectId: project.id,
      files: [
        { path: 'src/index.ts', content: 'export const ANSWER = 0; // cassé\n', updatedAt: '' },
        { path: 'JUNK.txt', content: 'ne doit pas survivre au restore\n', updatedAt: '' },
      ],
    });
    const broken = await projectStorage.listFiles(project.id);
    expect(broken.find((f) => f.path === 'src/index.ts')?.content).toContain('ANSWER = 0');
    expect(broken.find((f) => f.path === 'data/seed.json')).toBeUndefined();

    // (4) RESTORE sur le projet lui-même.
    const restored = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints/${ckpt.id}/restore`,
      headers: auth('r-token'),
    });
    expect(restored.statusCode).toBe(200);
    const body = restored.json();
    expect(body.restored).toBe(true);
    // Le hash relu APRÈS restauration doit égaler celui du manifeste.
    expect(body.restoredHash).toBe(ckpt.manifest.contentHashes.files);
    expect(body.expectedHash).toBe(body.restoredHash);

    // (5) VÉRIFIER dans le stockage, pas seulement dans la réponse HTTP.
    const after = await projectStorage.listFiles(project.id);
    expect(after.find((f) => f.path === 'src/index.ts')?.content).toContain('ANSWER = 42');
    expect(after.find((f) => f.path === 'data/seed.json')?.content).toContain('"rows":[1,2,3]');
    expect(after.find((f) => f.path === 'README.md')?.content).toContain('# original');
    // Le fichier apparu après le checkpoint a disparu : c'est un remplacement,
    // pas une fusion qui laisserait traîner l'état cassé.
    expect(after.find((f) => f.path === 'JUNK.txt')).toBeUndefined();
  });

  it('le restore laisse un POINT DE RETOUR exploitable (on peut revenir à l état cassé)', async () => {
    const { app, projectStorage, project } = await setup();

    await projectStorage.writeFiles(project.id, [{ path: 'a.txt', content: 'v1\n' }]);
    const first = (
      await app.inject({ method: 'POST', url: `/projects/${project.id}/checkpoints`, headers: auth('r-token') })
    ).json().checkpoint;

    await projectStorage.restoreSnapshot({
      projectId: project.id,
      files: [{ path: 'a.txt', content: 'v2-travail-en-cours\n', updatedAt: '' }],
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints/${first.id}/restore`,
      headers: auth('r-token'),
    });
    const safetyId = restored.json().safetyCheckpointId;
    expect(safetyId).toBeTruthy();
    expect((await projectStorage.listFiles(project.id))[0].content).toBe('v1\n');

    // Le checkpoint de sûreté a bien capturé l'état d'AVANT restauration : le
    // restore est annulable, il ne détruit pas le travail non sauvegardé.
    const undo = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints/${safetyId}/restore`,
      headers: auth('r-token'),
    });
    expect(undo.statusCode).toBe(200);
    expect((await projectStorage.listFiles(project.id))[0].content).toBe('v2-travail-en-cours\n');
  });

  it('REFUSE de restaurer un checkpoint non COMMITTED (404) — jamais depuis un état partiel', async () => {
    const { app, store, projectStorage, project } = await setup();
    await projectStorage.writeFiles(project.id, [{ path: 'a.txt', content: 'v1\n' }]);

    const partial = await store.createProjectCheckpoint({ projectId: project.id });
    await store.updateProjectCheckpoint(partial.id, { state: 'VOLUME_SNAPSHOTTING' });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/checkpoints/${partial.id}/restore`,
      headers: auth('r-token'),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('CHECKPOINT_NOT_FOUND');
  });
});

describe('P0-V3-09 — le manifeste ne sur-revendique pas', () => {
  it('annonce crash-consistent, JAMAIS application/transaction-consistent', async () => {
    const { app, projectStorage, project } = await setup();
    await projectStorage.writeFiles(project.id, [{ path: 'a.txt', content: 'x\n' }]);

    const ckpt = (
      await app.inject({ method: 'POST', url: `/projects/${project.id}/checkpoints`, headers: auth('r-token') })
    ).json().checkpoint;

    expect(ckpt.consistencyLevel).toBe('crash-consistent');
    expect(ckpt.manifest.consistencyBasis).toBeTruthy();

    /*
     * Garde anti-sur-revendication : aucun niveau interdit ne doit apparaître
     * NULLE PART dans le manifeste sérialisé — ni comme niveau, ni glissé dans
     * un champ libre. `notClaimed` les cite pour les nier, donc il est exclu.
     */
    const { notClaimed, ...rest } = ckpt.manifest;
    const serialized = JSON.stringify(rest);
    for (const forbidden of NEVER_CLAIMED) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(notClaimed).toEqual([...NEVER_CLAIMED]);
  });

  it('déclare explicitement l ABSENCE d atomicité inter-composants', async () => {
    const { app, projectStorage, project } = await setup();
    await projectStorage.writeFiles(project.id, [{ path: 'a.txt', content: 'x\n' }]);

    const ckpt = (
      await app.inject({ method: 'POST', url: `/projects/${project.id}/checkpoints`, headers: auth('r-token') })
    ).json().checkpoint;

    // Partager un logicalBarrierId ORDONNE les étapes ; ça ne crée pas un instant
    // atomique. Le manifeste le dit au lieu de le laisser supposer.
    expect(ckpt.manifest.crossComponentAtomic).toBe(false);
    expect(ckpt.manifest.barrierScope.apiWritesFrozenAllReplicas).toBe(true);
  });

  it('la vérification du composant FILES nomme sa MÉTHODE (pas un booléen nu)', async () => {
    const { app, projectStorage, project } = await setup();
    await projectStorage.writeFiles(project.id, [{ path: 'a.txt', content: 'x\n' }]);

    const ckpt = (
      await app.inject({ method: 'POST', url: `/projects/${project.id}/checkpoints`, headers: auth('r-token') })
    ).json().checkpoint;

    const files = ckpt.manifest.components.find((c: { componentKind: string }) => c.componentKind === 'FILES');
    expect(files.verified).toBe(true);
    expect(files.verificationMethod).toBe('archive-reread-sha256-match');
  });
});

describe('P0-V3-09 — la barrière est PARTAGÉE et posée au point d étranglement', () => {
  it('une barrière posée par un replica gèle les écritures vues par un AUTRE replica', async () => {
    const { app, store, projectStorage, project } = await setup();
    await projectStorage.writeFiles(project.id, [{ path: 'a.txt', content: 'x\n' }]);

    /*
     * Deuxième instance d'app sur le MÊME store et le MÊME stockage : c'est le
     * modèle exact de la prod (2 replicas API → HPA 6, Filestore RWX partagé).
     * Avec une barrière en mémoire de processus, ce test passait à travers.
     */
    const replicaB = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

    const ckpt = await store.createProjectCheckpoint({ projectId: project.id });
    await store.updateProjectCheckpoint(ckpt.id, {
      state: 'BARRIER_ESTABLISHED',
      logicalBarrierId: 'bar_test_shared',
      barrierExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    });

    const write = await replicaB.inject({
      method: 'POST',
      url: `/projects/${project.id}/files/import/zip`,
      headers: auth('r-token'),
      payload: { zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' },
    });
    expect(write.statusCode).toBe(423);
    expect(write.json().code).toBe('CHECKPOINT_BARRIER_ACTIVE');

    // Bail relâché → dégel immédiat, sur ce replica aussi.
    await store.updateProjectCheckpoint(ckpt.id, { barrierExpiresAt: null });
    const after = await replicaB.inject({
      method: 'POST',
      url: `/projects/${project.id}/files/import/zip`,
      headers: auth('r-token'),
      payload: { zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' },
    });
    expect(after.statusCode).not.toBe(423);
  });

  it('un bail EXPIRÉ dégèle tout seul (le processus porteur peut mourir en vol)', async () => {
    const { app, store, projectStorage, project } = await setup();
    await projectStorage.writeFiles(project.id, [{ path: 'a.txt', content: 'x\n' }]);

    const ckpt = await store.createProjectCheckpoint({ projectId: project.id });
    await store.updateProjectCheckpoint(ckpt.id, {
      state: 'BARRIER_ESTABLISHED',
      logicalBarrierId: 'bar_expired',
      // Déjà expiré : simule le replica mort en tenant la barrière.
      barrierExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const write = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/files/import/zip`,
      headers: auth('r-token'),
      payload: { zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' },
    });
    expect(write.statusCode).not.toBe(423);
  });

  it('la barrière tient AUSSI sur une route qui n a jamais eu de garde explicite', async () => {
    const { app, store, projectStorage, project } = await setup();
    await projectStorage.writeFiles(project.id, [{ path: 'a.txt', content: 'x\n' }]);

    const ckpt = await store.createProjectCheckpoint({ projectId: project.id });
    await store.updateProjectCheckpoint(ckpt.id, {
      state: 'BARRIER_ESTABLISHED',
      logicalBarrierId: 'bar_chokepoint',
      barrierExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    });

    /*
     * `POST /projects/:id/snapshots/:id/restore` ÉCRASE l'arbre du projet
     * (`projectStorage.restoreSnapshot`) et n'a jamais appelé
     * `rejectIfCheckpointBarrier` : c'est exactement le genre d'écriture
     * destructive qui atterrissait au milieu d'un snapshot en cours. Le garde
     * étant désormais DANS le stockage, la route est couverte sans l'avoir
     * modifiée — ~35 routes mutent l'arbre, 2 seulement étaient gardées.
     */
    const archive = await projectStorage.createSnapshot({
      projectId: project.id,
      files: [{ path: 'a.txt', content: 'ancienne version\n', updatedAt: '' }],
    });
    const snap = await store.createSnapshot({
      projectId: project.id,
      kind: 'manual',
      manifest: { files: [] },
      storageKey: archive.storageKey,
      byteLength: archive.byteLength,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/snapshots/${snap.id}/restore`,
      headers: auth('r-token'),
    });
    expect(res.statusCode).toBe(423);
    expect(res.json().code).toBe('CHECKPOINT_BARRIER_ACTIVE');

    // Et l'arbre n'a PAS été touché : le refus arrive avant l'écrasement.
    expect((await projectStorage.listFiles(project.id))[0].content).toBe('x\n');
  });
});
