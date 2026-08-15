import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * RR-08 #1 / reserve #3 — ROUTE-LEVEL freeze barrier. While an account purge has
 * frozen a project's object storage, EVERY write route must refuse (403) so a
 * bucket/object can't be recreated after the purge's zero-check. This suite locks
 * that in for the thumbnail signed-upload route the reviewer flagged, plus the
 * generic upload-url for parity, and proves reads stay allowed and the block
 * lifts once the freeze is cleared.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const SECRET = 'unit-object-storage-freeze-secret';

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
    return { objects: [{ key: 'a.txt', size: 3, updated: null, contentType: null, etag: null }], folders: [] };
  },
  async createUploadUrl() {
    return { url: 'https://signed/put', method: 'PUT' as const, headers: {}, expiresAt: 'x' };
  },
  async createDownloadUrl() {
    return { url: 'https://signed/get', expiresAt: 'y' };
  },
  async putObject() {
    return { key: 'thumbnail.png', size: 10 };
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
  async deleteBucket(projectId: string) {
    return { deleted: true, bucket: `vc-${projectId}` };
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
    objectStorage: fakeStorage as unknown as Parameters<typeof buildApiApp>[0] extends { objectStorage?: infer T }
      ? T
      : never,
  });

  const user = await store.createUser({
    email: 'freeze@example.com',
    name: 'Freeze',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Freeze Org', slug: 'freeze-org', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'Freeze Project', slug: 'freeze-project' });

  // Thumbnail is a normal user-session route (the workspace object-storage grant
  // only covers /object-storage/*), so authenticate the owner with a session.
  const token = 'freeze-user-session';
  await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, project, token };
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe('object-storage routes — purge freeze barrier', () => {
  it('thumbnail/upload-url returns 403 OBJECT_STORAGE_PURGE_FROZEN while the project is frozen (RR-08 #1)', async () => {
    const { app, store, project, token } = await setup();

    // Not frozen yet → the signed upload is minted.
    const before = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/thumbnail/upload-url`,
      headers: bearer(token),
      payload: {},
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().url).toBe('https://signed/put');

    // Freeze the project (what the account-purge guarantee does: a PurgeFreeze row).
    store.setObjectStoragePurgeFrozen(project.id, true);

    const blocked = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/thumbnail/upload-url`,
      headers: bearer(token),
      payload: {},
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('OBJECT_STORAGE_PURGE_FROZEN');

    // Unfreeze → the route works again (the block is conditional, not a wall).
    store.setObjectStoragePurgeFrozen(project.id, false);
    const after = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/thumbnail/upload-url`,
      headers: bearer(token),
      payload: {},
    });
    expect(after.statusCode).toBe(200);
  });

  /*
   * The 403 body is sent straight to the client, so it only gets localized if its
   * English text is a catalogue entry the preSerialization hook can look up. It used
   * to be a hardcoded literal — the one user-visible message in the whole purge-freeze
   * path that stayed English for a French client.
   */
  it('localizes the frozen-storage 403 for a French client (and stays English otherwise)', async () => {
    const { app, store, project, token } = await setup();
    store.setObjectStoragePurgeFrozen(project.id, true);

    const french = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/thumbnail/upload-url`,
      headers: { ...bearer(token), 'accept-language': 'fr-FR;q=0.9, en;q=0.4' },
      payload: {},
    });

    expect(french.statusCode).toBe(403);
    expect(french.json().code).toBe('OBJECT_STORAGE_PURGE_FROZEN');
    expect(french.headers['content-language']).toBe('fr');
    expect(french.json().error).toBe('Le stockage d’objets est gelé pendant la suppression de ce compte.');

    const english = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/thumbnail/upload-url`,
      headers: { ...bearer(token), 'accept-language': 'en-US' },
      payload: {},
    });

    expect(english.statusCode).toBe(403);
    expect(english.json().error).toBe('Object storage is frozen while this account is being deleted.');
  });

  it('a frozen project blocks the generic upload-url write too, but still allows reads', async () => {
    const { app, store, project, token } = await setup();
    store.setObjectStoragePurgeFrozen(project.id, true);

    // Write path → 403.
    const upload = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/object-storage/objects/upload-url`,
      headers: bearer(token),
      payload: { key: 'hello.txt', contentType: 'text/plain' },
    });
    expect(upload.statusCode).toBe(403);
    expect(upload.json().code).toBe('OBJECT_STORAGE_PURGE_FROZEN');

    // Read path → still allowed (the freeze bars writes, not reads).
    const list = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/object-storage/objects`,
      headers: bearer(token),
    });
    expect(list.statusCode).toBe(200);
  });
});
