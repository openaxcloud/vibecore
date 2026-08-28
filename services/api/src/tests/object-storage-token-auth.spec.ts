import { hashPassword } from '@vibecore/auth';
import { signObjectStorageAccessToken } from '@e-code/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { projectBucketName, type ObjectStorage } from '../object-storage.js';
import type { ProjectPhysicalMutationScope } from '../store.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class PausingPhysicalAccessStore extends TestApiStore {
  private pause?: {
    point: 'before' | 'inside';
    entered: ReturnType<typeof deferred>;
    release: ReturnType<typeof deferred>;
  };

  pauseNextPhysicalAccess(point: 'before' | 'inside') {
    const pause = { point, entered: deferred(), release: deferred() };
    this.pause = pause;
    return pause;
  }

  override async withProjectPhysicalAccess<T>(
    scope: ProjectPhysicalMutationScope,
    effect: () => Promise<T>,
  ): Promise<T> {
    const pause = this.pause;
    this.pause = undefined;

    if (pause?.point === 'before') {
      pause.entered.resolve();
      await pause.release.promise;
    }

    return super.withProjectPhysicalAccess(scope, async () => {
      if (pause?.point === 'inside') {
        pause.entered.resolve();
        await pause.release.promise;
      }
      return effect();
    });
  }
}

const SECRET = 'unit-object-storage-token-secret';

/** Fake ObjectStorage so the routes never touch real GCS. */
const fakeStorage = {
  active: true,
  async ensureBucket(projectId: string) {
    return { bucket: `vc-${projectId}`, created: true, location: 'EU' };
  },
  async bucketExists() {
    return true;
  },
  async listObjects() {
    return { objects: [{ key: 'a.txt', size: 3, updated: null, contentType: null, etag: null }], folders: ['src/'] };
  },
  async createUploadUrl() {
    return {
      url: 'https://signed/put',
      method: 'PUT' as const,
      headers: {},
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  },
  async createDownloadUrl() {
    return { url: 'https://signed/get', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  },
  async moveObject(_p: string, input: { to: string }) {
    return { moved: true, key: input.to };
  },
  async deleteObject() {
    return { deleted: true, count: 1 };
  },
  async deletePrefix() {
    return { deleted: true, count: 2 };
  },
};

const ORIGINAL = {
  enabled: process.env.OBJECT_STORAGE_ENABLED,
  secret: process.env.OBJECT_STORAGE_ACCESS_TOKEN_SECRET,
};

beforeEach(() => {
  process.env.OBJECT_STORAGE_ENABLED = 'true';
  process.env.OBJECT_STORAGE_ACCESS_TOKEN_SECRET = SECRET;
});

afterEach(() => {
  for (const [key, val] of [
    ['OBJECT_STORAGE_ENABLED', ORIGINAL.enabled],
    ['OBJECT_STORAGE_ACCESS_TOKEN_SECRET', ORIGINAL.secret],
  ] as const) {
    if (val === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      process.env[key] = val;
    }
  }
});

async function setup(options: { store?: TestApiStore; objectStorage?: ObjectStorage } = {}) {
  const store = options.store ?? new TestApiStore();
  const app = await buildApiApp({
    store,
    emailProvider: new QuietEmailProvider(),
    objectStorage:
      options.objectStorage ??
      (fakeStorage as unknown as Parameters<typeof buildApiApp>[0] extends { objectStorage?: infer T } ? T : never),
  });

  const user = await store.createUser({
    email: 'os@example.com',
    name: 'OS',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'OS Org', slug: 'os-org', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'OS Project', slug: 'os-project' });

  const token = signObjectStorageAccessToken({
    payload: {
      projectId: project.id,
      organizationId: org.id,
      userId: user.id,
      workspaceId: 'ws_1',
      expiresAt: Date.now() + 60_000,
    },
    secret: SECRET,
  });

  return { app, store, project, token };
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe('object-storage routes — workspace token auth', () => {
  it('authorizes a workspace token scoped to the project (no user session)', async () => {
    const { app, project, token } = await setup();

    const list = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/object-storage/objects?delimiter=/`,
      headers: bearer(token),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().folders).toEqual(['src/']);

    const bucket = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/object-storage/bucket`,
      headers: bearer(token),
      payload: {},
    });
    expect(bucket.statusCode).toBe(200);
    expect(bucket.json().bucket).toBe(projectBucketName(project.id));

    const upload = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/object-storage/objects/upload-url`,
      headers: bearer(token),
      payload: { key: 'hello.txt', contentType: 'text/plain' },
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().url).toBe('https://signed/put');
  });

  it('rejects a token scoped to a DIFFERENT project (401)', async () => {
    const { app, project } = await setup();
    const otherToken = signObjectStorageAccessToken({
      payload: { projectId: 'some-other-project', organizationId: 'some-org', expiresAt: Date.now() + 60_000 },
      secret: SECRET,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/object-storage/objects`,
      headers: bearer(otherToken),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token signed with the wrong secret (401)', async () => {
    const { app, project } = await setup();
    const forged = signObjectStorageAccessToken({
      payload: { projectId: project.id, organizationId: project.organizationId, expiresAt: Date.now() + 60_000 },
      secret: 'wrong-secret',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/object-storage/objects`,
      headers: bearer(forged),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects no token (401)', async () => {
    const { app, project } = await setup();

    const res = await app.inject({ method: 'GET', url: `/projects/${project.id}/object-storage/objects` });
    expect(res.statusCode).toBe(401);
  });

  it('requires a stable mutation key and replays a completed MOVE before reading live provider state', async () => {
    const objects = new Map([
      [
        'source.txt',
        {
          key: 'source.txt',
          size: 5,
          updated: null,
          contentType: 'text/plain',
          etag: 'source-etag',
          generation: '7',
          contentHash: 'sha256:source',
        },
      ],
    ]);
    let listCalls = 0;
    let moveCalls = 0;
    const storage: ObjectStorage = {
      ...(fakeStorage as unknown as ObjectStorage),
      async listObjects(_projectId, query = {}) {
        listCalls += 1;
        return {
          objects: [...objects.values()].filter((object) => object.key.startsWith(query.prefix ?? '')),
          folders: [],
        };
      },
      async moveObject(_projectId, input) {
        moveCalls += 1;
        const source = objects.get(input.from);
        if (!source) throw new Error('SOURCE_MISSING');
        objects.delete(input.from);
        objects.set(input.to, { ...source, key: input.to, generation: '8' });
        return { moved: true, key: input.to, generation: '8' };
      },
    };
    const { app, project, token } = await setup({ objectStorage: storage });
    const url = `/projects/${project.id}/object-storage/objects/move`;

    const missingKey = await app.inject({
      method: 'POST',
      url,
      headers: bearer(token),
      payload: { from: 'source.txt', to: 'target.txt' },
    });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json()).toMatchObject({ code: 'OBJECT_STORAGE_IDEMPOTENCY_KEY_REQUIRED' });

    const headers = { ...bearer(token), 'idempotency-key': 'move-response-loss-0001' };
    const first = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { from: 'source.txt', to: 'target.txt' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ moved: true, key: 'target.txt', generation: '8' });
    const listCallsAfterCommit = listCalls;

    const replay = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { from: 'source.txt', to: 'target.txt' },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(moveCalls).toBe(1);
    expect(listCalls).toBe(listCallsAfterCommit);

    const conflicting = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { from: 'source.txt', to: 'different-target.txt' },
    });
    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json()).toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT' });
    expect(moveCalls).toBe(1);
    expect(listCalls).toBe(listCallsAfterCommit);
  });

  it('linearizes provider list reads with transfer and never returns B metadata to an A-authorized request', async () => {
    const store = new PausingPhysicalAccessStore();
    const listedObjects = new Map<string, string>();
    let providerLists = 0;
    const storage = {
      ...fakeStorage,
      async listObjects(projectId: string) {
        providerLists += 1;
        return {
          objects: [
            {
              key: listedObjects.get(projectId) ?? 'missing',
              size: 1,
              updated: null,
              contentType: null,
              etag: null,
            },
          ],
          folders: [],
        };
      },
    };
    const app = await buildApiApp({
      store,
      emailProvider: new QuietEmailProvider(),
      objectStorage: storage as unknown as Parameters<typeof buildApiApp>[0] extends { objectStorage?: infer T }
        ? T
        : never,
    });
    const user = await store.createUser({
      email: 'object-list-transfer@example.test',
      name: 'Object list transfer owner',
      passwordHash: hashPassword('password123'),
    });
    const source = await store.createOrganization({
      name: 'Object list transfer source',
      slug: 'object-list-transfer-source',
      ownerUserId: user.id,
    });
    const target = await store.createOrganization({
      name: 'Object list transfer target',
      slug: 'object-list-transfer-target',
      ownerUserId: user.id,
    });
    const tokenFor = (projectId: string) =>
      signObjectStorageAccessToken({
        payload: {
          projectId,
          organizationId: source.id,
          userId: user.id,
          workspaceId: `workspace-${projectId}`,
          expiresAt: Date.now() + 60_000,
        },
        secret: SECRET,
      });
    const transfer = (projectId: string) =>
      store.transferProject({
        projectId,
        expectedOrganizationId: source.id,
        expectedOwnershipEpoch: 0,
        targetOrganizationId: target.id,
        idempotencyKey: `object-list-transfer-${projectId}`,
        actorUserId: user.id,
        assertExternalStorageDetached: async () => undefined,
        validateTargetAdmission: async () => undefined,
      });
    let readFirstPause: ReturnType<PausingPhysicalAccessStore['pauseNextPhysicalAccess']> | undefined;
    let transferFirstPause: ReturnType<PausingPhysicalAccessStore['pauseNextPhysicalAccess']> | undefined;

    try {
      const readFirstProject = await store.createProject({
        organizationId: source.id,
        name: 'Object list read first',
        slug: 'object-list-read-first',
      });
      listedObjects.set(readFirstProject.id, 'source-a-object');
      readFirstPause = store.pauseNextPhysicalAccess('inside');
      const reading = app.inject({
        method: 'GET',
        url: `/projects/${readFirstProject.id}/object-storage/objects`,
        headers: bearer(tokenFor(readFirstProject.id)),
      });
      await readFirstPause.entered.promise;

      let transferSettled = false;
      const transferring = transfer(readFirstProject.id).finally(() => {
        transferSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(transferSettled).toBe(false);
      readFirstPause.release.resolve();

      const readFirstResponse = await reading;
      expect(readFirstResponse.statusCode).toBe(200);
      expect(readFirstResponse.json().objects).toEqual([expect.objectContaining({ key: 'source-a-object' })]);
      await expect(transferring).resolves.toMatchObject({ organizationId: target.id });

      const transferFirstProject = await store.createProject({
        organizationId: source.id,
        name: 'Object list transfer first',
        slug: 'object-list-transfer-first',
      });
      listedObjects.set(transferFirstProject.id, 'target-b-object');
      transferFirstPause = store.pauseNextPhysicalAccess('before');
      const staleReading = app.inject({
        method: 'GET',
        url: `/projects/${transferFirstProject.id}/object-storage/objects`,
        headers: bearer(tokenFor(transferFirstProject.id)),
      });
      await transferFirstPause.entered.promise;
      await transfer(transferFirstProject.id);
      const listsBeforeStaleResume = providerLists;
      transferFirstPause.release.resolve();

      const staleResponse = await staleReading;
      expect(staleResponse.statusCode).toBe(409);
      expect(staleResponse.json().code).toBe('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION');
      expect(providerLists).toBe(listsBeforeStaleResume);
    } finally {
      readFirstPause?.release.resolve();
      transferFirstPause?.release.resolve();
      await app.close();
    }
  });
});
