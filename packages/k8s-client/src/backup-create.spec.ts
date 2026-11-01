/** Exercises command construction with a local executable fixture, never kubectl/cloud. */
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KubectlWorkspaceK8sClient } from './index.js';

afterEach(() => vi.unstubAllEnvs());
describe('atomic Kubernetes resource creation command', () => {
  it('uses create, returns the observed UID, refuses an existing object and cleans temporary manifests', async () => {
    vi.stubEnv('KUBERNETES_SERVICE_HOST', '');

    const directory = await mkdtemp(join(tmpdir(), 'backup-create-command-'));
    const binary = join(directory, 'kubectl-fixture');
    const saved = join(directory, 'saved.json');
    const calls = join(directory, 'calls.jsonl');

    const source = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args)+'\\n');
if(args[0] !== 'create' || args.includes('apply') || args.includes('replace') || args.includes('delete')) process.exit(2);
if(fs.existsSync(${JSON.stringify(saved)})) process.exit(1);
const object = JSON.parse(fs.readFileSync(args[args.indexOf('-f')+1], 'utf8'));
object.metadata.uid='server-assigned-fixture-uid';
fs.writeFileSync(${JSON.stringify(saved)}, JSON.stringify(object));
process.stdout.write(JSON.stringify(object));
`;
    await writeFile(binary, source, { mode: 0o700 });

    const client = new KubectlWorkspaceK8sClient(binary);

    const object = {
      apiVersion: 'postgresql.cnpg.io/v1',
      kind: 'Backup',
      metadata: { name: `bkp-v2-${'a'.repeat(40)}`, namespace: 'project-databases' },
      spec: { cluster: { name: 'db-test' } },
    };

    try {
      expect((await client.createResource(object)).metadata.uid).toBe('server-assigned-fixture-uid');
      await expect(
        client.createResource({ ...object, spec: { cluster: { name: 'must-not-replace' } } }),
      ).rejects.toThrow();
      expect(JSON.parse(await readFile(saved, 'utf8')).spec.cluster.name).toBe('db-test');

      const requests = (await readFile(calls, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[]);
      expect(requests).toHaveLength(2);

      for (const args of requests) {
        expect(args[0]).toBe('create');
        expect(args.slice(args.indexOf('-o'), args.indexOf('-o') + 2)).toEqual(['-o', 'json']);
        await expect(access(dirname(args[args.indexOf('-f') + 1]))).rejects.toThrow();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
