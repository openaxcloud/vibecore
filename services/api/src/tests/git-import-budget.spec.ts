import { createServer as createTlsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { checkImportTree, withImportTransfer } from '../git-import-budget.js';

it('bounds the tree before expanding files and counts repeated blob references', () => {
  const blob = (size: number) => `100644 blob ${'a'.repeat(40)} ${size}\tfile\0`;
  expect(checkImportTree(blob(12))).toHaveLength(1);
  for (const listing of [blob(26 * 1024 * 1024), blob(17 * 1024 * 1024).repeat(2), blob(0).repeat(5001)]) {
    expect(() => checkImportTree(listing)).toThrow('resource limit');
  }
});

it('meters actual bytes across connections to a disposable origin', async () => {
  let hits = 0;
  const server = createServer((_request, response) => {
    hits++;
    response.end(Buffer.alloc(4096));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = new URL(`https://fixture.invalid:${port}/repo.git`);
  // curl uses CONNECT to the synthetic hostname. The fixture inside the tunnel
  // speaks plain HTTP so this test needs no certificate or credential store.
  const read = (proxy: string) =>
    promisify(execFile)('curl', [
      '--silent',
      '--fail',
      '--max-time',
      '5',
      '--noproxy',
      '',
      '--proxytunnel',
      '--proxy-basic',
      '--proxy',
      proxy,
      `http://fixture.invalid:${port}/ordinary-data`,
    ]);
  try {
    await expect(
      withImportTransfer(
        origin,
        ['127.0.0.1'],
        async (proxy) => {
          expect((await read(proxy)).stdout.length).toBe(4096);
          await read(proxy);
        },
        7000,
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_TOO_LARGE' });
    expect(hits).toBe(2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('passes Git HTTPS through the byte meter with the original TLS name and no external access', async () => {
  const run = promisify(execFile);
  const root = await mkdtemp(join(tmpdir(), 'git-import-tls-'));
  const certificate = join(root, 'ephemeral.crt');
  const key = join(root, 'ephemeral.key');
  const sha = '1234567890abcdef1234567890abcdef12345678';
  try {
    await run('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=fixture.invalid',
      '-addext',
      'subjectAltName=DNS:fixture.invalid',
      '-keyout',
      key,
      '-out',
      certificate,
    ]);
    const server = createTlsServer({ key: await readFile(key), cert: await readFile(certificate) }, (req, reply) => {
      if (req.headers['proxy-authorization']) {
        reply.writeHead(400).end();
        return;
      }
      if (req.url?.startsWith('/repo.git/info/refs')) {
        reply.writeHead(200, { 'content-type': 'text/plain' }).end(sha + '\trefs/heads/main\n');
      } else if (req.url === '/repo.git/HEAD') {
        reply.end('ref: refs/heads/main\n');
      } else {
        reply.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = new URL(`https://fixture.invalid:${(server.address() as AddressInfo).port}/repo.git`);
    try {
      const result = await withImportTransfer(origin, ['127.0.0.1'], (proxy) =>
        run('git', ['-c', `http.proxy=${proxy}`, '-c', 'http.proxyAuthMethod=basic', 'ls-remote', origin.href], {
          cwd: root,
          timeout: 5000,
          env: {
            PATH: process.env.PATH,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_SSL_CAINFO: certificate,
            GIT_TERMINAL_PROMPT: '0',
            no_proxy: '',
          },
        }),
      );
      expect(result.stdout).toContain(sha + '\trefs/heads/main');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
