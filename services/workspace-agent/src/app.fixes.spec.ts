import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildWorkspaceAgentApp } from './app.js';

const tokenSecret = 'test-secret';
const workspaceId = 'workspace_fixes';

describe('workspace-agent fix batch', () => {
  let root: string;
  let token: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'workspace-agent-fixes-'));
    token = signAgentToken({ workspaceId, expiresAt: Date.now() + 60_000, secret: tokenSecret });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /*
   * BUG-IDE-008: ext4 creates `lost+found` at the root of every formatted
   * volume, so it surfaced at the top of the file tree on every PVC-backed
   * workspace — and reading it then returned 400 (root-owned). An entry the
   * user can neither use nor open must not be listed at all.
   */
  it('/files/tree does not list the ext4 lost+found directory', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    await mkdir(join(root, 'lost+found'), { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'index.ts'), 'export const ok = true;\n');

    const response = await app.inject({ method: 'GET', url: '/files/tree?path=.', headers });

    expect(response.statusCode).toBe(200);

    const names = (JSON.parse(response.body) as Array<{ path: string }>).map((node) => node.path);

    expect(names).not.toContain('lost+found');
    expect(names).toContain('src');

    await app.close();
  });

  // Bug 1: /files/create must decode base64 binary content, not write the literal base64 text.
  it('/files/create decodes base64 content losslessly', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    // PNG magic + bytes that are NOT valid utf8 on their own (0xff 0xfe), proving raw byte fidelity.
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x01]);
    const pngBase64 = pngBytes.toString('base64');

    const create = await app.inject({
      method: 'POST',
      url: '/files/create',
      headers,
      payload: { path: 'assets/icon.png', content: pngBase64, encoding: 'base64' },
    });
    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({ type: 'file' });

    // Read directly off disk: the on-disk bytes must equal the original, not the base64 ASCII.
    const onDisk = await readFile(join(root, 'assets/icon.png'));
    expect(Array.from(onDisk)).toEqual(Array.from(pngBytes));

    // And it must NOT be the literal base64 string written as text.
    expect(onDisk.toString('utf8')).not.toBe(pngBase64);
  });

  it('/files/create still writes utf8 content verbatim', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    const create = await app.inject({
      method: 'POST',
      url: '/files/create',
      headers,
      payload: { path: 'src/index.ts', content: 'export const ok = true;' },
    });
    expect(create.statusCode).toBe(200);

    const onDisk = await readFile(join(root, 'src/index.ts'), 'utf8');
    expect(onDisk).toBe('export const ok = true;');
  });

  // Bug 2: /commands/run must not corrupt multibyte UTF-8 split across chunk boundaries.
  it('/commands/run preserves multibyte UTF-8 output split across stdout chunks', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    /*
     * Force a multibyte char to straddle two 'data' events: write the first
     * raw byte of a 3-byte sequence (✓ U+2713 = e2 9c 93), let the pipe flush,
     * then write the remaining two bytes plus more multibyte glyphs. With the
     * old chunk.toString('utf8') the first chunk decodes the lone 0xe2 to
     * U+FFFD; with a StringDecoder the tail is buffered and reassembled.
     */
    const script = [
      'const out = process.stdout;',
      'out.write(Buffer.from([0xe2]));',
      "setTimeout(() => { out.write(Buffer.from([0x9c, 0x93])); out.write('✅ 完了 build done\\n'); }, 50);",
    ].join('');

    const response = await app.inject({
      method: 'POST',
      url: '/commands/run',
      headers,
      payload: { command: 'node', args: ['-e', script] },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.code).toBe(0);
    expect(body.stdout).toContain('✓');
    expect(body.stdout).toContain('✅');
    expect(body.stdout).toContain('完了');
    expect(body.stdout).toContain('build done');

    // No replacement chars must appear anywhere in the captured output.
    expect(body.stdout).not.toContain('�');
  });

  /*
   * Bug 3 (preview '?'/'#' path re-encoding) was reverted: the re-encode shim
   * 500'd on Linux/CI due to a cross-platform Fastify splat-decoding difference,
   * which is worse than the original low-severity truncation. Deferred for a
   * platform-correct fix; the original behaviour is restored.
   */
});
