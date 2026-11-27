import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { chromium, expect } from '@playwright/test';
import { checkCalculation } from './probe';

// Give only a fresh Chromium process a temporary trust store, for the one host returned by Publish.
export async function checkLocalPublication(origin: string, version: string, factor: number, upstreamPort = 3020) {
  const host = new URL(origin).hostname;
  if (!/^d-[a-z0-9]+\.localhost$/.test(host) || origin !== 'https://' + host)
    throw Error('Expected dedicated local origin');
  const home = mkdtempSync(join(tmpdir(), 'dynamic-browser-'));
  const cmd = (name: string, args: string[]) => execFileSync(name, args, { cwd: home, stdio: 'pipe' });
  try {
    cmd('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=Local recipe CA',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
    ]);
    cmd('openssl', [
      'req',
      '-new',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=' + host,
      '-addext',
      'subjectAltName=DNS:' + host,
      '-keyout',
      'leaf.key',
      '-out',
      'leaf.csr',
    ]);
    cmd('openssl', [
      'x509',
      '-req',
      '-in',
      'leaf.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-days',
      '1',
      '-copy_extensions',
      'copy',
      '-out',
      'leaf.pem',
    ]);
    // Chromium M146+ uses XDG_DATA_HOME/pki/nssdb; earlier builds use ~/.pki/nssdb.
    for (const path of ['.pki/nssdb', '.local/share/pki/nssdb']) {
      const db = join(home, path);
      mkdirSync(db, { recursive: true });
      cmd('certutil', ['-N', '--empty-password', '-d', 'sql:' + db]);
      cmd('certutil', ['-A', '-d', 'sql:' + db, '-n', 'local recipe CA', '-t', 'C,,', '-i', 'ca.pem']);
    }
    const relay = createServer(
      { cert: readFileSync(join(home, 'leaf.pem')), key: readFileSync(join(home, 'leaf.key')) },
      (req, res) => {
        if (req.method !== 'GET' || req.headers.host !== host) {
          res.writeHead(404).end();
          return;
        }
        get({ hostname: '127.0.0.1', port: upstreamPort, path: req.url, headers: { host } }, (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        }).on('error', () => res.destroy());
      },
    );
    relay.listen(0, '127.0.0.1');
    await once(relay, 'listening');
    try {
      const address = relay.address();
      if (!address || typeof address === 'string') throw Error('Missing local TLS port');
      const browser = await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
        env: {
          ...process.env,
          HOME: home,
          XDG_DATA_HOME: join(home, '.local/share'),
          XDG_CONFIG_HOME: join(home, '.config'),
        },
        args: [`--host-resolver-rules=MAP ${host}:443 127.0.0.1:${address.port}`],
      });
      try {
        const ctx = await browser.newContext({ serviceWorkers: 'block' });
        expect(await ctx.cookies()).toEqual([]);
        await ctx.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
        await checkCalculation(await ctx.newPage(), origin, version, factor);
      } finally {
        await browser.close();
      }
    } finally {
      relay.closeAllConnections();
      await new Promise<void>((resolve) => relay.close(() => resolve()));
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}
