import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildWorkspaceAgentApp } from './app.js';

const workspaceId = 'snapshot-contract-fixture';
const tokenSecret = 'snapshot-contract-local-test-only';

describe('runtime snapshot contract over real local HTTP and disk', () => {
  let root: string;
  let app: ReturnType<typeof buildWorkspaceAgentApp>;
  let baseUrl: string;
  let headers: Record<string, string>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vibecore-snapshot-contract-'));
    app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId, tokenSecret });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    headers = {
      authorization: `Bearer ${signAgentToken({ workspaceId, secret: tokenSecret, expiresAt: Date.now() + 60_000 })}`,
      'content-type': 'application/json',
    };
  });

  afterEach(async () => {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

  it('does not present a file inventory as a restorable snapshot archive', async () => {
    await writeFile(join(root, 'README.md'), 'original content');

    const response = await post('/snapshots/create', {});

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'SNAPSHOT_ARCHIVE_UNAVAILABLE' });
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('original content');
  });

  it('does not report success for a snapshot id whose archive does not exist', async () => {
    await writeFile(join(root, 'README.md'), 'current content after the supposed snapshot');

    // This is the exact body sent by the runtime API and restore_snapshot AI tool.
    const response = await post('/snapshots/restore', { snapshotId: 'legacy-metadata-only-id' });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('current content after the supposed snapshot');
  });

  it('rejects an absent files payload before writing anything', async () => {
    const response = await post('/snapshots/restore', {});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not ignore a snapshot id while applying an unrelated files payload', async () => {
    await writeFile(join(root, 'README.md'), 'unchanged');

    const response = await post('/snapshots/restore', {
      snapshotId: 'unresolved-archive',
      files: [{ path: 'README.md', content: 'must not be applied' }],
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('unchanged');
  });

  it('preserves the real files restore contract, including binary bytes', async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xff, 0x80]);
    await writeFile(join(root, 'README.md'), 'changed');

    const response = await post('/snapshots/restore', {
      files: [
        { path: 'README.md', content: 'restored original text' },
        { path: 'assets/icon.png', content: binary.toString('base64'), encoding: 'base64' },
      ],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ restoredFiles: 2 });
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('restored original text');
    expect(await readFile(join(root, 'assets/icon.png'))).toEqual(binary);
  });

  it('keeps explicit empty file application honest and non-destructive', async () => {
    await writeFile(join(root, 'README.md'), 'retained');

    const response = await post('/snapshots/restore', { files: [] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ restoredFiles: 0 });
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('retained');
  });

  it('rejects a token for another workspace before any file restore', async () => {
    headers.authorization = `Bearer ${signAgentToken({
      workspaceId: 'other-workspace',
      secret: tokenSecret,
      expiresAt: Date.now() + 60_000,
    })}`;
    await writeFile(join(root, 'README.md'), 'tenant-owned content');

    const response = await post('/snapshots/restore', { files: [{ path: 'README.md', content: 'forbidden' }] });

    expect(response.status).toBe(401);
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('tenant-owned content');
  });
});
