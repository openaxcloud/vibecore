import { hashPassword } from '@vibecore/auth';
import { signObjectStorageAccessToken } from '@e-code/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const SECRET = 'unit-object-storage-token-secret';

/** Fake ObjectStorage so the routes never touch real GCS. */
const fakeStorage = {
  active: true,
  async ensureBucket(projectId: string) {
    return { bucket: `vc-${projectId}`, created: true, location: 'EU' };
  },
  async listObjects() {
    return { objects: [{ key: 'a.txt', size: 3, updated: null, contentType: null, etag: null }], folders: ['src/'] };
  },
  async createUploadUrl() {
    return { url: 'https://signed/put', method: 'PUT' as const, headers: {}, expiresAt: 'x' };
  },
  async createDownloadUrl() {
    return { url: 'https://signed/get', expiresAt: 'y' };
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

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({
    store,
    emailProvider: new QuietEmailProvider(),
    objectStorage: fakeStorage as unknown as Parameters<typeof buildApiApp>[0] extends { objectStorage?: infer T } ? T : never,
  });

  const user = await store.createUser({
    email: 'os@example.com',
    name: 'OS',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'OS Org', slug: 'os-org', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'OS Project', slug: 'os-project' });

  const token = signObjectStorageAccessToken({
    payload: { projectId: project.id, userId: user.id, workspaceId: 'ws_1', expiresAt: Date.now() + 60_000 },
    secret: SECRET,
  });

  return { app, project, token };
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
    expect(bucket.json().bucket).toBe(`vc-${project.id}`);

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
      payload: { projectId: 'some-other-project', expiresAt: Date.now() + 60_000 },
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
      payload: { projectId: project.id, expiresAt: Date.now() + 60_000 },
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
});
