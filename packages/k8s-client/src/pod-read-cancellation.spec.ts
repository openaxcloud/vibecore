import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { KubectlWorkspaceK8sClient } from './index.js';

it('cancels a hung diagnostic kubectl process rather than waiting for the default timeout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pod-read-cancellation-'));
  const pidFile = join(dir, 'pid');
  const bin = join(dir, 'kubectl');

  let pid: number | undefined;

  try {
    // Local synthetic executable; no Kubernetes, network or external program.
    await writeFile(
      bin,
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);\n`,
      { mode: 0o700 },
    );

    const controller = new AbortController();
    const read = new KubectlWorkspaceK8sClient(bin).getPod('unused', 'unused', { signal: controller.signal });
    const failure = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    const deadline = Date.now() + 2000;

    while (pid === undefined && Date.now() < deadline) {
      try {
        pid = Number(await readFile(pidFile, 'utf8'));
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    controller.abort();
    await failure;
    expect(pid).toBeGreaterThan(0);

    let exited = false;

    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        process.kill(pid!, 0);
      } catch {
        exited = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(exited).toBe(true);
  } finally {
    if (pid) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* Already reaped. */
      }
    }

    await rm(dir, { recursive: true, force: true });
  }
});
