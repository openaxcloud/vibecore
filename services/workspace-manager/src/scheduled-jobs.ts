/*
 * Runs ONE scheduled task in a disposable Pod, and reports what happened.
 *
 * Lifecycle, per run:
 *   1. apply a Secret holding the project's secret values (if any)
 *   2. apply Pod `scheduled-run-<runId>` (gVisor, project PVC, machine size,
 *      restartPolicy: Never, activeDeadlineSeconds backstop)
 *   3. poll until it terminates (or the caller's timeout expires)
 *   4. capture the FULL logs
 *   5. delete Pod + Secret
 *
 * Step 5 always runs, including on timeout — a scheduled job that outlives its
 * budget must not keep burning a sandbox node.
 *
 * This is intentionally NOT the durable server-deployment path (Deployment +
 * Service + Ingress): a scheduled run has no URL, no replicas and no lifetime
 * beyond its own exit. It shares no symbols with it.
 */
import {
  assertWorkspaceImageAllowed,
  readScheduledJobStatus,
  scheduledJobPod,
  scheduledJobPodName,
  scheduledJobSecret,
  scheduledJobSecretName,
  type ScheduledJobInput,
  type WorkspaceK8sClient,
} from '@vibecore/k8s-client';

export interface RunScheduledJobResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
  phase: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Drain the pod's logs into a single string (the run row stores them verbatim). */
async function collectLogs(k8s: WorkspaceK8sClient, namespace: string, podName: string): Promise<string> {
  const chunks: string[] = [];

  try {
    for await (const chunk of k8s.streamPodLogs(namespace, podName)) {
      chunks.push(chunk);
    }
  } catch (error) {
    /*
     * A pod that never scheduled (no node, image pull failure) has no logs at
     * all. Surface WHY rather than an empty run — an empty log box is the most
     * useless possible failure report.
     */
    chunks.push(`\n[no container logs available: ${error instanceof Error ? error.message : String(error)}]\n`);
  }

  return chunks.join('');
}

export async function runScheduledJob(
  k8s: WorkspaceK8sClient,
  input: ScheduledJobInput & { secretValues?: Record<string, string>; pollIntervalMs?: number },
  assertAuthority: () => Promise<void> = async () => undefined,
): Promise<RunScheduledJobResult> {
  // The manifest builder is dependency-free, so the allowlist is enforced here.
  assertWorkspaceImageAllowed(input.image);

  /*
   * Fail FAST on a missing project volume. A pod referencing a nonexistent PVC
   * is unschedulable forever (Pending, never started, activeDeadline never
   * arms) — proven live 2026-07-15: a legacy-derived pvcName left the run pod
   * Pending while the run row mis-reported a manager failure. A clear, typed
   * failure beats an eternal hang.
   */
  const pvc = await k8s.get('pvc', input.namespace, input.pvcName).catch(() => undefined);

  if (!pvc) {
    return {
      exitCode: 1,
      output: `[scheduled] project volume not found: PersistentVolumeClaim "${input.pvcName}" does not exist in namespace "${input.namespace}" — the run cannot see the project files.`,
      timedOut: false,
      phase: 'Failed',
    };
  }

  const podName = scheduledJobPodName(input.runId);
  const secretName = scheduledJobSecretName(input.runId);
  const pollIntervalMs = input.pollIntervalMs ?? 1500;
  const hasSecrets = Object.keys(input.secretValues ?? {}).length > 0;

  const cleanup = async () => {
    await k8s.delete('pod', input.namespace, podName).catch(() => undefined);

    if (hasSecrets) {
      await k8s.delete('secret', input.namespace, secretName).catch(() => undefined);
    }
  };

  /*
   * A previous run of the same runId can only exist if we crashed mid-run and are
   * being replayed; start from a clean slate so `apply` can't collide with an
   * immutable, already-terminated pod.
   */
  await cleanup();

  if (hasSecrets) {
    await assertAuthority();
    await k8s.apply(scheduledJobSecret(input, input.secretValues!));
    await assertAuthority();
  }

  await assertAuthority();
  await k8s.apply(scheduledJobPod(input));
  await assertAuthority();

  const deadline = Date.now() + input.timeoutSeconds * 1000;

  try {
    for (;;) {
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
        // Capture whatever the job managed to print before we kill it.
        const output = await collectLogs(k8s, input.namespace, podName);

        return { exitCode: 124, output, timedOut: true, phase: status.phase };
      }

      await sleep(pollIntervalMs);
    }
  } finally {
    await cleanup();
  }
}
