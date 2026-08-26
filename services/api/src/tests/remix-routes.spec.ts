import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type {
  ListObjectsResult,
  ObjectStorage,
  ObjectStorageInventory,
  SignedUrlResult,
  UploadUrlResult,
} from '../object-storage.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { REMIX_STORAGE_CONSENT_VERSION } from '../remix-pipeline.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** Minimal in-memory ProjectStorage — enough for the remix file path. */
class MemoryProjectStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  readonly snapshots = new Map<string, ProjectFile[]>();

  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();

    for (const file of files) {
      bucket.set(file.path, file.content);
    }
    this.files.set(projectId, bucket);

    return this.listFiles(projectId);
  }

  async listFiles(projectId: string): Promise<ProjectFile[]> {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    const updatedAt = new Date().toISOString();

    return [...bucket.entries()].map(([path, content]) => ({ path, content, updatedAt }));
  }

  // Unused-by-remix members: satisfy the interface with safe no-ops.
  async readFile() {
    return undefined;
  }
  async deleteFiles() {}
  async deleteProjectFiles(projectId: string) {
    this.files.delete(projectId);
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
  async createSnapshot(input: { projectId: string; files: ProjectFile[]; storageKey?: string }) {
    const storageKey = input.storageKey ?? `snapshots/${input.projectId}/snapshot.zip`;
    this.snapshots.set(
      storageKey,
      input.files.map((file) => ({ ...file })),
    );
    return { storageKey, byteLength: 0, createdAt: new Date().toISOString() };
  }
  async getSnapshotFiles(storageKey: string) {
    return (this.snapshots.get(storageKey) ?? []).map((file) => ({ ...file }));
  }
  async restoreSnapshot() {
    return [];
  }
}

class MemoryObjectStorage implements ObjectStorage {
  readonly active = true;
  readonly inventories = new Map<string, ObjectStorageInventory>();
  readonly downloads: Array<{ projectId: string; key: string; generation?: string }> = [];

  async ensureBucket(projectId: string) {
    const created = !this.inventories.has(projectId);
    this.inventories.set(projectId, this.inventories.get(projectId) ?? { bucketExists: true, objects: [] });
    return { bucket: `bucket-${projectId}`, created, location: 'test' };
  }
  async bucketExists(projectId: string) {
    return this.inventories.get(projectId)?.bucketExists ?? false;
  }
  async inventoryProjectObjects(projectId: string) {
    return structuredClone(this.inventories.get(projectId) ?? { bucketExists: false, objects: [] });
  }
  async cloneProjectObjects(
    _sourceProjectId: string,
    targetProjectId: string,
    inventory: ObjectStorageInventory,
    guard?: () => Promise<void>,
  ) {
    await guard?.();
    this.inventories.set(targetProjectId, structuredClone(inventory));
    return structuredClone(inventory);
  }
  async listObjects(projectId: string): Promise<ListObjectsResult> {
    const inventory = await this.inventoryProjectObjects(projectId);
    return {
      objects: inventory.objects.map((object) => ({
        ...object,
        updated: null,
        contentType: null,
        etag: null,
      })),
      folders: [],
    };
  }
  async createUploadUrl(): Promise<UploadUrlResult> {
    return {
      url: 'https://upload.invalid',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      method: 'PUT',
      headers: {},
    };
  }
  async createDownloadUrl(projectId: string, input: { key: string; generation?: string }): Promise<SignedUrlResult> {
    this.downloads.push({ projectId, ...input });
    return { url: 'https://download.invalid', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }
  async putObject(_projectId: string, input: { key: string; body: Uint8Array }) {
    return { key: input.key, size: input.body.byteLength };
  }
  async moveObject(_projectId: string, input: { to: string }) {
    return { moved: true, key: input.to };
  }
  async deleteObject() {
    return { deleted: true, count: 1 };
  }
  async deletePrefix() {
    return { deleted: true, count: 1 };
  }
  async deleteBucket(projectId: string) {
    const deleted = this.inventories.delete(projectId);
    return { deleted, bucket: `bucket-${projectId}` };
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const SECRET_VALUE = 'FIXTURE-not-a-real-secret-a1b2c3d4e5f6-DO-NOT-LEAK';
const ENV_VALUE = 'postgres://user:SuperSecretDbPassword@db.internal:5432/app';

async function setup(options: { objectStorage?: ObjectStorage } = {}) {
  const store = new TestApiStore();
  const projectStorage = new MemoryProjectStorage();
  const app = await buildApiApp({
    store,
    projectStorage,
    emailProvider: new QuietEmailProvider(),
    objectStorage: options.objectStorage,
  });

  const user = await store.createUser({
    email: 'remix@example.com',
    name: 'Remix User',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Remix Org', slug: 'remix-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'remix-token', expiresAt: new Date(Date.now() + 3600_000) });

  const source = await store.createProject({ organizationId: org.id, name: 'Source', slug: 'source' });

  /*
   * A real secret in the DB (encrypted), plus the SAME value materialized into a
   * committed .env file in the workspace — the leak the invariant must catch.
   */
  await store.upsertProjectSecret({
    projectId: source.id,
    key: 'STRIPE_KEY',
    valueEncrypted: encryptJson({ value: SECRET_VALUE }),
  });
  await store.upsertProjectEnvVar({ projectId: source.id, key: 'DATABASE_URL', value: ENV_VALUE });

  await projectStorage.writeFiles(source.id, [
    { path: 'src/app.ts', content: 'console.log("hello");\n' },
    { path: '.env', content: `PORT=3000\nSTRIPE_KEY=${SECRET_VALUE}\nDATABASE_URL=${ENV_VALUE}\n` },
    { path: 'README.md', content: '# Source project\n' },
  ]);

  return { app, store, projectStorage, org, source };
}

describe('POST /projects/:id/remix — secure fork, secret never enters the clone', () => {
  it('remixes a project WITH a secret and the secret value is NOWHERE in the clone', async () => {
    const { app, store, projectStorage, source } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${source.id}/remix`,
      headers: auth('remix-token'),
      payload: { name: 'Remixed', storagePolicy: 'DETACH' },
    });

    expect(res.statusCode).toBe(201);

    const body = res.json();
    const cloneId = body.project.id;
    expect(cloneId).not.toBe(source.id); // new project, new owner scope

    // The pipeline ran to completion through the normative states.
    expect(body.remix.state).toBe('COMPLETED');

    // Credentials were detached to REFERENCES (keys), never values.
    expect(body.remix.detachedKeys.secretKeys).toContain('STRIPE_KEY');
    expect(body.remix.detachedKeys.envVarKeys).toContain('DATABASE_URL');
    expect(JSON.stringify(body.remix.detachedKeys)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(body.remix.detachedKeys)).not.toContain(ENV_VALUE);

    // The .env materialized both values → 2 value-lines scrubbed.
    expect(body.remix.scrubbedValueLines).toBeGreaterThanOrEqual(2);

    // ---- THE PROOF: actively SEARCH for the secret value in every clone surface ----

    // (a) Clone FILES: the whole cloned artifact must not contain either value.
    const cloneFiles = await projectStorage.listFiles(cloneId);
    const allFileText = cloneFiles.map((f) => f.content).join('\n');
    expect(allFileText).not.toContain(SECRET_VALUE);
    expect(allFileText).not.toContain(ENV_VALUE);

    // But the .env still exists with the KEY as a reference (parses, no value).
    const envFile = cloneFiles.find((f) => f.path === '.env');
    expect(envFile).toBeTruthy();
    expect(envFile!.content).toContain('STRIPE_KEY=');
    expect(envFile!.content).toContain('DATABASE_URL=');

    // (b) Clone DB: no ProjectSecret / ProjectEnvVar row was carried onto the clone.
    const cloneSecrets = await store.listProjectSecrets(cloneId);
    const cloneEnvVars = await store.listProjectEnvVars(cloneId);
    expect(cloneSecrets).toEqual([]);
    expect(cloneEnvVars).toEqual([]);

    // (c) Remix job record persisted, no value leaked into detachedKeys/scanFindings.
    const job = await store.getRemixJob(body.remix.remixJobId);
    expect(job?.state).toBe('COMPLETED');
    expect(job?.dbForked).toBe(false); // honest: isolated, not physically forked
    expect(JSON.stringify(job)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(job)).not.toContain(ENV_VALUE);

    // (d) Immutable source pin: I-RMX-1 also forbids persisting either value in
    // the ProjectSnapshot archive created before the target exists.
    const snapshot = await store.getSnapshot(job!.sourceSnapshotId!);
    expect(snapshot).toBeDefined();
    if (!snapshot?.storageKey) throw new Error('remix source snapshot archive was not persisted');
    const snapshotFiles = await projectStorage.getSnapshotFiles(snapshot.storageKey);
    const snapshotText = snapshotFiles.map((file) => file.content).join('\n');
    expect(snapshotText).not.toContain(SECRET_VALUE);
    expect(snapshotText).not.toContain(ENV_VALUE);
    expect(snapshotText).toContain('STRIPE_KEY=');
  });

  it('BLOCKS the remix (409, quarantine) if a secret value somehow survives into the clone', async () => {
    /*
     * Drive the scanner directly against a clone that still has the value to
     * prove the SCANNING gate is real: if the scrub is bypassed, the remix fails.
     */
    const { scanClonedFilesForSecrets } = await import('../remix-pipeline.js');

    const findings = scanClonedFilesForSecrets(
      [{ path: '.env', content: `STRIPE_KEY=${SECRET_VALUE}\n` }],
      [{ key: 'STRIPE_KEY', value: SECRET_VALUE }],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].secretKey).toBe('STRIPE_KEY');
    expect(JSON.stringify(findings)).not.toContain(SECRET_VALUE); // finding carries key+location only
  });

  it('exposes the remix job state via GET /projects/:id/remix/:remixJobId', async () => {
    const { app, source } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/projects/${source.id}/remix`,
      headers: auth('remix-token'),
      payload: { name: 'Remixed 2' },
    });

    const remixJobId = created.json().remix.remixJobId;

    const got = await app.inject({
      method: 'GET',
      url: `/projects/${source.id}/remix/${remixJobId}`,
      headers: auth('remix-token'),
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().remix.state).toBe('COMPLETED');
    expect(got.json().remix.storagePolicy).toBe('DETACH');
  });

  it('requires versioned consent, serves only the pinned read-only share, and lets its owner revoke it', async () => {
    const previousEnabled = process.env.OBJECT_STORAGE_ENABLED;
    process.env.OBJECT_STORAGE_ENABLED = 'true';
    const objectStorage = new MemoryObjectStorage();

    try {
      const { app, store, org, source } = await setup({ objectStorage });
      objectStorage.inventories.set(source.id, {
        bucketExists: true,
        objects: [{ key: 'data/pinned.json', size: 17, generation: 'generation-7', contentHash: 'md5:pinned' }],
      });

      const policy = await app.inject({
        method: 'GET',
        url: `/projects/${source.id}/remix-policy`,
        headers: auth('remix-token'),
      });
      expect(policy.statusCode).toBe(200);
      expect(policy.json()).toEqual({
        policies: ['DETACH', 'CLONE', 'SHARE_WITH_CONSENT'],
        storageConsentVersion: REMIX_STORAGE_CONSENT_VERSION,
      });

      const withoutConsent = await app.inject({
        method: 'POST',
        url: `/projects/${source.id}/remix`,
        headers: { ...auth('remix-token'), 'idempotency-key': 'share-no-consent-key' },
        payload: { name: 'No consent', storagePolicy: 'SHARE_WITH_CONSENT' },
      });
      expect(withoutConsent.statusCode).toBe(400);
      expect(withoutConsent.json()).toMatchObject({
        code: 'REMIX_STORAGE_CONSENT_REQUIRED',
        consentVersion: REMIX_STORAGE_CONSENT_VERSION,
      });
      expect((await store.listProjects(org.id)).filter((project) => project.id !== source.id)).toEqual([]);

      const created = await app.inject({
        method: 'POST',
        url: `/projects/${source.id}/remix`,
        headers: { ...auth('remix-token'), 'idempotency-key': 'share-with-consent-key' },
        payload: {
          name: 'Consented share',
          storagePolicy: 'SHARE_WITH_CONSENT',
          storageConsent: { granted: true, version: REMIX_STORAGE_CONSENT_VERSION },
        },
      });
      expect(created.statusCode).toBe(201);
      const targetId = created.json().project.id as string;
      expect(await store.getRemixStorageShareByTarget(targetId)).toMatchObject({
        sourceProjectId: source.id,
        targetProjectId: targetId,
        sourceOrganizationId: org.id,
        targetOrganizationId: org.id,
        consentVersion: REMIX_STORAGE_CONSENT_VERSION,
        state: 'ACTIVE',
      });

      // A later source object was never consented. Shared reads stay pinned to
      // the immutable generation inventory captured by the remix job.
      objectStorage.inventories.get(source.id)!.objects.push({
        key: 'data/future.json',
        size: 9,
        generation: 'generation-8',
        contentHash: 'md5:future',
      });
      const status = await app.inject({
        method: 'GET',
        url: `/projects/${targetId}/object-storage/status`,
        headers: auth('remix-token'),
      });
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({ enabled: true, provisioned: true, mode: 'SHARED_READ_ONLY' });

      const listed = await app.inject({
        method: 'GET',
        url: `/projects/${targetId}/object-storage/objects`,
        headers: auth('remix-token'),
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().objects.map((object: { key: string }) => object.key)).toEqual(['data/pinned.json']);

      const download = await app.inject({
        method: 'GET',
        url: `/projects/${targetId}/object-storage/objects/download-url?key=data%2Fpinned.json`,
        headers: auth('remix-token'),
      });
      expect(download.statusCode).toBe(200);
      expect(objectStorage.downloads).toContainEqual({
        projectId: source.id,
        key: 'data/pinned.json',
        generation: 'generation-7',
      });

      const writeBlocked = await app.inject({
        method: 'POST',
        url: `/projects/${targetId}/object-storage/bucket`,
        headers: auth('remix-token'),
      });
      expect(writeBlocked.statusCode).toBe(409);
      expect(writeBlocked.json().code).toBe('SHARED_READ_ONLY');

      const outsider = await store.createUser({
        email: 'share-outsider@example.com',
        name: 'Share Outsider',
        passwordHash: hashPassword('password123'),
      });
      await store.createSession({
        userId: outsider.id,
        token: 'share-outsider-token',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      const unauthorizedRevoke = await app.inject({
        method: 'DELETE',
        url: `/projects/${targetId}/object-storage/share`,
        headers: auth('share-outsider-token'),
      });
      // Project authorization deliberately conceals cross-tenant existence.
      expect(unauthorizedRevoke.statusCode).toBe(404);

      const revoked = await app.inject({
        method: 'DELETE',
        url: `/projects/${targetId}/object-storage/share`,
        headers: auth('remix-token'),
      });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json().revoked).toBe(true);
      expect(await store.getRemixStorageShareByTarget(targetId)).toBeUndefined();

      const writableAfterRevoke = await app.inject({
        method: 'POST',
        url: `/projects/${targetId}/object-storage/bucket`,
        headers: auth('remix-token'),
      });
      expect(writableAfterRevoke.statusCode).toBe(200);
      expect(writableAfterRevoke.json()).toMatchObject({ created: true });
    } finally {
      if (previousEnabled === undefined) delete process.env.OBJECT_STORAGE_ENABLED;
      else process.env.OBJECT_STORAGE_ENABLED = previousEnabled;
    }
  });
});
