import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Test teardown only, through the real manager's lifecycle. Never targets an external cluster. */
export async function cleanupEphemeralRuntimeWorkspaces(): Promise<void> {
  if (process.env.VIBECORE_CI_EPHEMERAL_RUNTIME !== '1') {
    return;
  }

  if (!process.env.RUNNER_TEMP || process.env.KUBECONFIG !== `${process.env.RUNNER_TEMP}/vibecore-runtime/kubeconfig`) {
    throw new Error('Runtime cleanup requires the disposable runner kubeconfig');
  }

  const secret = process.env.WORKSPACE_MANAGER_SHARED_SECRET;

  if (!secret || process.env.WORKSPACE_MANAGER_URL !== 'http://127.0.0.1:3010') {
    throw new Error('Runtime cleanup requires the local authenticated manager');
  }

  const { stdout } = await exec(
    'kubectl',
    ['-n', 'workspaces', 'get', 'pods', '-o', 'jsonpath={.items[*].metadata.name}'],
    {
      timeout: 15_000,
      maxBuffer: 64 * 1024,
    },
  );

  for (const name of stdout
    .trim()
    .split(/\s+/)
    .filter((value) => value.startsWith('workspace-'))) {
    const workspaceId = name.slice('workspace-'.length);

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(workspaceId)) {
      throw new Error('Unexpected workspace pod identifier in disposable namespace');
    }

    const response = await fetch(`http://127.0.0.1:3010/workspaces/${workspaceId}/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Disposable workspace cleanup failed: HTTP ${response.status}`);
    }
  }
}
