import { hashPassword } from '@vibecore/auth';
import { signObjectStorageAccessToken } from '@e-code/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * AUDX-022 — the workspace object-storage token carried NO scope.
 *
 * `requireObjectStorageProject(request, permission)` took a permission argument
 * and then ignored it entirely on the token path:
 *
 *     if (request.objectStorageGrant?.projectId === projectId) {
 *       return project;          // <- `permission` never consulted
 *     }
 *
 * So one token authorised read AND write AND delete AND destroying the bucket.
 * That token is injected into the workspace pod as OBJECT_STORAGE_ACCESS_TOKEN,
 * and the workspace pod runs USER-AUTHORED code — so a generated app could wipe
 * the project's entire object storage with a single request.
 */
class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const SECRET = 'unit-object-storage-scope-secret';

const calls: string[] = [];

const fakeStorage = {
  active: true,
  async ensureBucket(projectId: string) {
    calls.push('ensureBucket');

    return { bucket: `vc-${projectId}`, created: true, location: 'EU' };
  },
  async bucketExists() {
    return true;
  },
  async listObjects() {
    calls.push('listObjects');

    return { objects: [], folders: [] };
  },
  async listAllObjects() {
    return { objects: [], totalBytes: 0, pages: 1 };
  },
  async createUploadUrl() {
    calls.push('createUploadUrl');

    return { url: 'https://signed/put', method: 'PUT' as const, headers: {}, expiresAt: 'x' };
  },
  async createDownloadUrl() {
    calls.push('createDownloadUrl');

    return { url: 'https://signed/get', expiresAt: 'y' };
  },
  async moveObject(_p: string, input: { to: string }) {
    calls.push('moveObject');

    return { moved: true, key: input.to };
  },
  async putObject() {
    return { key: 'k', size: 1 };
  },
  async deleteObject() {
    calls.push('deleteObject');

    return { deleted: true, count: 1 };
  },
  async deletePrefix() {
    calls.push('deletePrefix');

    return { deleted: true, count: 2 };
  },
  async deleteBucket() {
    calls.push('deleteBucket');

    return { deleted: true, bucket: 'vc-x' };
  },
};

const ORIGINAL = {
  enabled: process.env.OBJECT_STORAGE_ENABLED,
  secret: process.env.OBJECT_STORAGE_ACCESS_TOKEN_SECRET,
};

beforeEach(() => {
  calls.length = 0;
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
    objectStorage: fakeStorage as never,
  });

  const user = await store.createUser({
    email: 'scope@example.com',
    name: 'Scope',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Scope Org', slug: 'scope-org', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });

  const mint = (scopes?: string[]) =>
    signObjectStorageAccessToken({
      payload: {
        projectId: project.id,
        userId: user.id,
        workspaceId: 'ws_1',
        expiresAt: Date.now() + 60_000,
        ...(scopes ? { scopes } : {}),
      } as never,
      secret: SECRET,
    });

  return { app, project, mint };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('AUDX-022 object-storage token scopes', () => {
  it('refuses a read-only token that tries to delete objects', async () => {
    const { app, project, mint } = await setup();
    const token = mint(['read']);

    const response = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/object-storage/objects`,
      headers: bearer(token),
      payload: { prefix: 'data/' },
    });

    expect(response.statusCode).toBe(403);
    // The backend must never have been reached.
    expect(calls).not.toContain('deletePrefix');
  });

  it('refuses a read-only token that tries to write', async () => {
    const { app, project, mint } = await setup();

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/object-storage/objects/upload-url`,
      headers: bearer(mint(['read'])),
      payload: { key: 'a.txt' },
    });

    expect(response.statusCode).toBe(403);
    expect(calls).not.toContain('createUploadUrl');
  });

  it('still lets a read-only token read', async () => {
    const { app, project, mint } = await setup();

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/object-storage/objects`,
      headers: bearer(mint(['read'])),
    });

    expect(response.statusCode).toBe(200);
    expect(calls).toContain('listObjects');
  });

  it('refuses a read+write token that tries to destroy the bucket', async () => {
    const { app, project, mint } = await setup();

    const response = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/object-storage/bucket`,
      headers: bearer(mint(['read', 'write'])),
    });

    expect(response.statusCode).toBe(403);
    expect(calls).not.toContain('deleteBucket');
  });

  it('lets a delete-scoped token delete', async () => {
    const { app, project, mint } = await setup();

    const response = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/object-storage/objects`,
      headers: bearer(mint(['read', 'write', 'delete'])),
      payload: { prefix: 'data/' },
    });

    expect(response.statusCode).toBe(200);
    expect(calls).toContain('deletePrefix');
  });

  describe('legacy tokens minted before scopes existed', () => {
    /*
     * A token already in a running workspace carries no `scopes` claim. It keeps
     * read+write so live workspaces are not broken by the deploy, but LOSES the
     * destructive verbs it should never have had. Fail-closed on the dangerous
     * operations, backwards-compatible on the ordinary ones.
     */
    it('keeps read and write', async () => {
      const { app, project, mint } = await setup();

      const read = await app.inject({
        method: 'GET',
        url: `/projects/${project.id}/object-storage/objects`,
        headers: bearer(mint()),
      });
      const write = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/object-storage/objects/upload-url`,
        headers: bearer(mint()),
        payload: { key: 'a.txt' },
      });

      expect(read.statusCode).toBe(200);
      expect(write.statusCode).toBe(200);
    });

    it('loses delete and bucket destruction', async () => {
      const { app, project, mint } = await setup();

      const del = await app.inject({
        method: 'DELETE',
        url: `/projects/${project.id}/object-storage/objects`,
        headers: bearer(mint()),
        payload: { prefix: 'data/' },
      });
      const bucket = await app.inject({
        method: 'DELETE',
        url: `/projects/${project.id}/object-storage/bucket`,
        headers: bearer(mint()),
      });

      expect(del.statusCode).toBe(403);
      expect(bucket.statusCode).toBe(403);
      expect(calls).not.toContain('deletePrefix');
      expect(calls).not.toContain('deleteBucket');
    });
  });
});
