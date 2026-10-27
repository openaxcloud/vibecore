import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('requests source timestamps from the actual kubectl process boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'runtime-log-kubectl-'));
  const executable = join(directory, 'kubectl-fixture');

  try {
    await writeFile(
      executable,
      '#!/bin/sh\ncase " $* " in *" --timestamps "*) printf "%s\\n" "2026-10-27T14:00:00.123456789Z retained failure";; *) exit 42;; esac\n',
      { mode: 0o700 },
    );

    const modulePath = fileURLToPath(new URL('./index.ts', import.meta.url));
    const loader = createRequire(import.meta.url).resolve('tsx');

    const script = `import(${JSON.stringify(modulePath)}).then(async ({ KubectlWorkspaceK8sClient }) => {
      const client = new KubectlWorkspaceK8sClient(${JSON.stringify(executable)});
      const lines = [];
      for await (const line of client.streamPodLogs('fixture-namespace', 'fixture-pod')) lines.push(line);
      process.stdout.write(JSON.stringify(lines));
    });`;

    // Run source in Node so the root browser Vite config cannot polyfill util.promisify.
    const lines = JSON.parse(execFileSync(process.execPath, ['--import', loader, '-e', script], { encoding: 'utf8' }));
    expect(lines).toEqual(['2026-10-27T14:00:00.123456789Z retained failure']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
