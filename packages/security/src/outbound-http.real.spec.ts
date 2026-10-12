import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const container = process.env.OUTBOUND_PROOF_CONTAINER;

describe.skipIf(!container)('isolated real TCP proof, with a reachable forbidden listener', () => {
  it('uses the approved public endpoint even when a second lookup would return loopback', async () => {
    if (!container || !/^vibecore-[a-z0-9-]+-20261011$/u.test(container)) {
      throw new Error('An explicitly owned isolated proof container is required');
    }

    const local = mkdtempSync(join(tmpdir(), 'vibecore-outbound-'));
    const remote = `/tmp/vibecore-outbound-${randomUUID()}`;
    const node = '/tmp/vibecore-proof-node';
    const docker = (args: string[]) => execFileSync('docker', args, { encoding: 'utf8' });

    try {
      await build({
        entryPoints: [fileURLToPath(new URL('./outbound-http.ts', import.meta.url))],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: join(local, 'outbound-http-proof.mjs'),
      });
      docker(['exec', container, node, '-e', 'require("node:fs").mkdirSync(process.argv[1])', remote]);
      docker(['cp', join(local, 'outbound-http-proof.mjs'), `${container}:${remote}/outbound-http-proof.mjs`]);
      docker([
        'cp',
        fileURLToPath(new URL('./outbound-http.socket-proof.mjs', import.meta.url)),
        `${container}:${remote}/outbound-http.socket-proof.mjs`,
      ]);

      const result = JSON.parse(docker(['exec', container, node, `${remote}/outbound-http.socket-proof.mjs`]));
      expect(result).toEqual({ publicHits: 2, privateHits: 0, defaultDnsCalls: 0, directPrivateWitness: 1 });
    } finally {
      docker([
        'exec',
        container,
        node,
        '-e',
        'require("node:fs").rmSync(process.argv[1], {recursive:true, force:true})',
        remote,
      ]);
      rmSync(local, { recursive: true, force: true });
    }
  });
});
