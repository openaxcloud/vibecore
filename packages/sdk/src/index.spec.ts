import { describe, expect, it, vi } from 'vitest';

import { Client, ObjectStorageClient, ObjectStorageError, getDatabaseUrl, getSecret } from './index.js';
import { signObjectStorageAccessToken, verifyObjectStorageAccessToken } from './token.js';

const SECRET = 'unit-test-object-storage-secret';

describe('object-storage access token', () => {
  it('round-trips a valid token', () => {
    const token = signObjectStorageAccessToken({
      payload: {
        projectId: 'proj_1',
        organizationId: 'org_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        expiresAt: Date.now() + 60_000,
      },
      secret: SECRET,
    });

    const result = verifyObjectStorageAccessToken({
      token,
      secret: SECRET,
      expectedProjectId: 'proj_1',
      expectedOrganizationId: 'org_1',
    });
    expect(result.ok).toBe(true);
    expect(result.payload).toMatchObject({ projectId: 'proj_1', userId: 'user_1' });
  });

  it('rejects a tampered signature, wrong project, expiry and missing token', () => {
    const token = signObjectStorageAccessToken({
      payload: { projectId: 'proj_1', organizationId: 'org_1', expiresAt: Date.now() + 60_000 },
      secret: SECRET,
    });

    expect(verifyObjectStorageAccessToken({ token: `${token}x`, secret: SECRET }).reason).toBe('invalid_signature');
    expect(verifyObjectStorageAccessToken({ token, secret: 'other-secret' }).reason).toBe('invalid_signature');
    expect(verifyObjectStorageAccessToken({ token, secret: SECRET, expectedProjectId: 'proj_2' }).reason).toBe(
      'project_mismatch',
    );
    expect(verifyObjectStorageAccessToken({ token, secret: SECRET, expectedOrganizationId: 'org_2' }).reason).toBe(
      'organization_mismatch',
    );
    expect(verifyObjectStorageAccessToken({ token: undefined, secret: SECRET }).reason).toBe('missing');

    const expired = signObjectStorageAccessToken({
      payload: { projectId: 'p', organizationId: 'org', expiresAt: Date.now() - 1 },
      secret: SECRET,
    });
    expect(verifyObjectStorageAccessToken({ token: expired, secret: SECRET }).reason).toBe('expired');
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ObjectStorageClient', () => {
  const opts = { apiUrl: 'https://api.test', accessToken: 'tok_abc', projectId: 'proj_1' };

  it('lists objects with the bearer token and correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ objects: [{ key: 'a.txt' }], folders: ['src/'] }));
    const client = new ObjectStorageClient({ ...opts, fetch: fetchMock as unknown as typeof fetch });

    const res = await client.listObjects({ prefix: 'src/', delimiter: '/' });
    expect(res.folders).toEqual(['src/']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/projects/proj_1/object-storage/objects?prefix=src%2F&delimiter=%2F');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok_abc');
  });

  it('requests an upload URL and a download URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ url: 'https://signed/put', method: 'PUT', headers: {}, expiresAt: 'x' }))
      .mockResolvedValueOnce(jsonResponse({ url: 'https://signed/get', expiresAt: 'y' }));
    const client = new ObjectStorageClient({ ...opts, fetch: fetchMock as unknown as typeof fetch });

    expect((await client.getUploadUrl({ key: 'k', contentType: 'text/plain' })).url).toBe('https://signed/put');
    expect((await client.getDownloadUrl({ key: 'k' })).url).toBe('https://signed/get');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/projects/proj_1/object-storage/objects/upload-url');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.test/projects/proj_1/object-storage/objects/download-url?key=k',
    );
  });

  it('uploads bytes through the signed URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          url: 'https://signed/put',
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          expiresAt: 'x',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = new ObjectStorageClient({ ...opts, fetch: fetchMock as unknown as typeof fetch });

    await client.upload({ key: 'hello.txt', data: 'hi', contentType: 'text/plain' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://signed/put');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
  });

  it('throws ObjectStorageError on a non-2xx API response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope', code: 'INVALID_KEY' }, 400));
    const client = new ObjectStorageClient({ ...opts, fetch: fetchMock as unknown as typeof fetch });

    await expect(client.delete({ key: '../escape', idempotencyKey: 'object-delete-test-0001' })).rejects.toMatchObject({
      name: 'ObjectStorageError',
      code: 'INVALID_KEY',
      status: 400,
    });
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)['idempotency-key']).toBe(
      'object-delete-test-0001',
    );
  });

  it('requires apiUrl/accessToken/projectId', () => {
    expect(() => new ObjectStorageClient({ accessToken: 't', projectId: 'p' })).toThrow(/apiUrl/);
    expect(() => new ObjectStorageClient({ apiUrl: 'u', projectId: 'p' })).toThrow(/accessToken/);
    expect(() => new ObjectStorageClient({ apiUrl: 'u', accessToken: 't' })).toThrow(/projectId/);
  });
});

describe('unified Client + helpers', () => {
  it('reads the injected database url + secrets from env', () => {
    const prev = { ...process.env };
    process.env.DATABASE_URL = 'postgres://dev';
    process.env.PROD_DATABASE_URL = 'postgres://prod';
    process.env.MY_SECRET = 's3cr3t';

    expect(getDatabaseUrl('development')).toBe('postgres://dev');
    expect(getDatabaseUrl('production')).toBe('postgres://prod');
    expect(getSecret('MY_SECRET')).toBe('s3cr3t');

    const client = new Client({
      objectStorage: { apiUrl: 'u', accessToken: 't', projectId: 'p', fetch: vi.fn() as unknown as typeof fetch },
    });
    expect(client.database.url).toBe('postgres://dev');
    expect(client.database.productionUrl).toBe('postgres://prod');
    expect(client.secrets.get('MY_SECRET')).toBe('s3cr3t');

    process.env = prev;
  });
});
