import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const container = process.env.OUTBOUND_PROOF_CONTAINER;

describe.skipIf(!container)('Git/libcurl real TCP and smart-HTTP import', () => {
  it('clones the public repository despite a loopback hosts entry, and refuses its redirect', async () => {
    if (!container || !/^vibecore-[a-z0-9-]+-20261011$/u.test(container)) {
      throw new Error('An explicitly owned isolated proof container is required');
    }

    const local = mkdtempSync(join(tmpdir(), 'vibecore-git-outbound-'));
    const remote = `/tmp/vibecore-git-outbound-${randomUUID()}`;
    const node = '/tmp/vibecore-proof-node';

    const docker = (args: string[]) =>
      execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    try {
      await build({
        entryPoints: [fileURLToPath(new URL('../project-storage.ts', import.meta.url))],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile: join(local, 'git-provider-proof.cjs'),
      });
      docker(['exec', container, node, '-e', 'require("node:fs").mkdirSync(process.argv[1])', remote]);
      docker(['cp', join(local, 'git-provider-proof.cjs'), `${container}:${remote}/git-provider-proof.cjs`]);
      docker([
        'cp',
        fileURLToPath(new URL('./git-outbound.socket-proof.mjs', import.meta.url)),
        `${container}:${remote}/git-outbound.socket-proof.mjs`,
      ]);

      const result = JSON.parse(docker(['exec', container, node, `${remote}/git-outbound.socket-proof.mjs`]));
      expect(result).toMatchObject({ realClone: true, privateHits: 0, directPrivateWitness: 1, resolutions: 2 });
      expect(result.publicHits).toBeGreaterThanOrEqual(2);
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
