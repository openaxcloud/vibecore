import { hashPassword } from '@vibecore/auth';
import { signObjectStorageAccessToken } from '@e-code/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * AUDX-020 at its CALL SITE.
 *
 * A quota module that nobody calls enforces nothing, and the pre-fix route
 * called nothing: `POST /object-storage/objects/upload-url` signed a URL with no
 * check of any kind. These tests exercise the HTTP route, not the helper, so the
 * wiring itself is what is under test.
 */
class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const SECRET = 'unit-quota-route-secret';
const signed: Array<Record<string, unknown>> = [];

const fakeStorage = {
  active: true,
  async ensureBucket(projectId: string) {
    return { bucket: `vc-${projectId}`, created: true, location: 'EU' };
  },
  async bucketExists() {
    return true;
  },
  async listObjects() {
    return { objects: [], folders: [] };
  },
  // Reality of the bucket, independent of what the store has recorded.
  liveBytes: 0,
  async listAllObjects() {
    return { objects: [], totalBytes: fakeStorage.liveBytes, pages: 1 };
  },
  async createUploadUrl(projectId: string, input: Record<string, unknown>) {
    signed.push({ projectId, ...input });

    return {
      url: 'https://signed/put',
      method: 'PUT' as const,
      headers: {},
      maxBytes: 1,
      expiresAt: 'x',
    };
  },
  async createDownloadUrl() {
    return { url: 'https://signed/get', expiresAt: 'y' };
  },
  async moveObject(_p: string, input: { to: string }) {
    return { moved: true, key: input.to };
  },
  async putObject() {
    return { key: 'k', size: 1 };
  },
  async deleteObject() {
    return { deleted: true, count: 1 };
  },
  async deletePrefix() {
    return { deleted: true, count: 0 };
  },
  async deleteBucket() {
    return { deleted: true, bucket: 'b' };
  },
};

const ENV = ['OBJECT_STORAGE_ENABLED', 'OBJECT_STORAGE_ACCESS_TOKEN_SECRET', 'OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT'];
const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  signed.length = 0;
  fakeStorage.liveBytes = 0;

  for (const key of ENV) {
    ORIGINAL[key] = process.env[key];
  }

  process.env.OBJECT_STORAGE_ENABLED = 'true';
  process.env.OBJECT_STORAGE_ACCESS_TOKEN_SECRET = SECRET;
});

afterEach(() => {
  for (const key of ENV) {
    if (ORIGINAL[key] === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      process.env[key] = ORIGINAL[key];
    }
  }
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({
    store,
    emailProvider: new QuietEmailProvider(),
    objectStorage: fakeStorage as never,
  });

  const user = await store.createUser({
    email: 'quota@example.com',
    name: 'Q',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Q Org', slug: 'q-org', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });

  const token = signObjectStorageAccessToken({
    payload: {
      projectId: project.id,
      userId: user.id,
      expiresAt: Date.now() + 60_000,
      scopes: ['read', 'write'],
    } as never,
    secret: SECRET,
  });

  return { app, store, project, token };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('AUDX-020 upload-url route enforces the storage quota', () => {
  it('refuses with 507 when the project is already at its ceiling', async () => {
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';

    const { app, store, project, token } = await setup();
    await store.recordProjectObjectStorageUsage({
      projectId: project.id,
      bytes: 990,
      objectCount: 1,
      measuredAt: new Date(),
    });
    fakeStorage.liveBytes = 990;

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/object-storage/objects/upload-url`,
      headers: bearer(token),
      payload: { key: 'big.bin', maxBytes: 100 },
    });

    expect(response.statusCode).toBe(507);
    expect(response.json().code).toBe('OBJECT_STORAGE_QUOTA_EXCEEDED');

    // Decided BEFORE signing: no URL was ever minted.
    expect(signed).toHaveLength(0);
  });

  it('signs the URL when the upload fits', async () => {
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '10000';

    const { app, store, project, token } = await setup();
    await store.recordProjectObjectStorageUsage({
      projectId: project.id,
      bytes: 100,
      objectCount: 1,
      measuredAt: new Date(),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/object-storage/objects/upload-url`,
      headers: bearer(token),
      payload: { key: 'ok.bin', maxBytes: 100 },
    });

    expect(response.statusCode).toBe(200);
    expect(signed).toHaveLength(1);
  });

  it('judges against the ceiling SIGNED into the URL, not an optimistic guess', async () => {
    /*
     * The holder of the URL can upload up to `maxBytes`. Checking anything
     * smaller would let a project cross the ceiling with one legitimate PUT.
     */
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';

    const { app, store, project, token } = await setup();
    await store.recordProjectObjectStorageUsage({
      projectId: project.id,
      bytes: 500,
      objectCount: 1,
      measuredAt: new Date(),
    });
    fakeStorage.liveBytes = 500;

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/object-storage/objects/upload-url`,
      headers: bearer(token),
      payload: { key: 'x.bin', maxBytes: 600 },
    });

    expect(response.statusCode).toBe(507);
    expect(signed).toHaveLength(0);
  });

  it('is inert when no ceiling is configured', async () => {
    // Default: no quota set. The route must behave exactly as before.
    delete (process.env as Record<string, string | undefined>).OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT;

    const { app, project, token } = await setup();

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/object-storage/objects/upload-url`,
      headers: bearer(token),
      payload: { key: 'a.bin' },
    });

    expect(response.statusCode).toBe(200);
    expect(signed).toHaveLength(1);
  });
});
