/*
 * Runs ONE isolated server-deploy build in a disposable Pod and reports what
 * happened (exit code + full logs). Same lifecycle contract as scheduled-jobs:
 *
 *   1. apply Pod `app-build-<deploymentId>` (gVisor, emptyDir work volume,
 *      restartPolicy: Never, activeDeadlineSeconds backstop)
 *   2. poll until it terminates (or the caller's timeout expires)
 *   3. capture the FULL logs
 *   4. delete the Pod — always, including on timeout
 *
 * Unlike a scheduled run it mounts NO project PVC: the build fetches the
 * project revision over a signed URL and uploads its artifact the same way, so
 * a broken install/build can never touch the user's workspace.
 */
import {
  appBuildPod,
  appBuildPodName,
  assertWorkspaceImageAllowed,
  readScheduledJobStatus,
  type AppBuildInput,
  type WorkspaceK8sClient,
} from '@vibecore/k8s-client';

export interface RunAppBuildResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
  phase: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Drain the pod's logs into a single string (surfaced in the deploy build log). */
async function collectLogs(k8s: WorkspaceK8sClient, namespace: string, podName: string): Promise<string> {
  const chunks: string[] = [];

  try {
    for await (const chunk of k8s.streamPodLogs(namespace, podName)) {
      chunks.push(chunk);
    }
  } catch (error) {
    // A pod that never scheduled has no logs; surface WHY instead of silence.
    chunks.push(`\n[no build logs available: ${error instanceof Error ? error.message : String(error)}]\n`);
  }

  return chunks.join('');
}

export async function runAppBuild(
  k8s: WorkspaceK8sClient,
  input: AppBuildInput & { pollIntervalMs?: number },
  assertAuthority: () => Promise<void> = async () => undefined,
): Promise<RunAppBuildResult> {
  // The manifest builder is dependency-free, so the allowlist is enforced here.
  assertWorkspaceImageAllowed(input.image);

  const podName = appBuildPodName(input.deploymentId);
  const pollIntervalMs = input.pollIntervalMs ?? 2000;

  const cleanup = async () => {
    await k8s.delete('pod', input.namespace, podName).catch(() => undefined);
  };

  // A leftover pod of the same deployment id can only be a crashed/replayed
  // attempt; start clean so `apply` can't collide with a terminated pod.
  await cleanup();

  await assertAuthority();
  await k8s.apply(appBuildPod(input));
  await assertAuthority();

  const deadline = Date.now() + input.timeoutSeconds * 1000;

  try {
    for (;;) {
      // Pod-terminal status mapping is shared with scheduled runs (same shape).
      const status = readScheduledJobStatus(await k8s.getPod(input.namespace, podName));

      if (status.finished) {
        const output = await collectLogs(k8s, input.namespace, podName);

        return {
          exitCode: status.exitCode ?? (status.phase === 'Succeeded' ? 0 : 1),
          output,
          timedOut: status.reason === 'DeadlineExceeded',
          phase: status.phase,
        };
      }

      if (Date.now() >= deadline) {
        const output = await collectLogs(k8s, input.namespace, podName);

        return { exitCode: 124, output, timedOut: true, phase: status.phase };
      }

      await sleep(pollIntervalMs);
    }
  } finally {
    await cleanup();
  }
}
