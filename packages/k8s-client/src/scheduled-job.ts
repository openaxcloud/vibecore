/*
 * Ephemeral Pod for ONE scheduled-task run (the "Scheduled" deployment type).
 *
 * Deliberately a bare Pod with `restartPolicy: Never`, NOT a batch/v1 Job:
 *   - the Pod name is then fully deterministic (`scheduled-run-<runId>`), so the
 *     caller can poll its status and stream its logs with the WorkspaceK8sClient
 *     it already has (a Job's pod carries a random suffix, which would force a
 *     label-selector lookup and a new method on the shared client interface);
 *   - a scheduled run must NEVER be silently retried by the cluster, and a Job's
 *     backoffLimit is exactly that kind of hidden retry. Retry policy belongs to
 *     the scheduler (ScheduledTask.maxRetries), not to the kubelet.
 *
 * It is jetable: it runs the command, exits, and the caller deletes it once the
 * logs have been captured. Nothing durable is created — no Deployment, no
 * Service, no Ingress. This path is entirely separate from the `serverApp*`
 * durable-runtime work.
 *
 * Isolation is the same as a workspace pod: gVisor runtimeClass, sandbox node
 * pool, non-root, no service-account token, all capabilities dropped. It mounts
 * the PROJECT'S OWN PVC, so the job sees the real project files, and it receives
 * the project's env + secrets.
 */
// Type-only: a runtime import of index.js would make this module circular
// (index.ts re-exports it). The image allowlist is enforced by the caller
// (workspace-manager) via assertWorkspaceImageAllowed before the pod is applied.
import type { K8sObject } from './index.js';

/**
 * Machine sizes a scheduled run can be given. Kept here (rather than imported
 * from the billing package) so the manifest layer has no billing dependency; the
 * keys are the same strings the billing tiers use, and an unknown key degrades to
 * the smallest size rather than being rejected.
 */
export const SCHEDULED_JOB_MACHINE_SIZES = {
  'shared-0.5': { cpuMillicores: 500, ramMb: 2048 },
  'dedicated-1': { cpuMillicores: 1000, ramMb: 4096 },
  'dedicated-2': { cpuMillicores: 2000, ramMb: 8192 },
  'dedicated-4': { cpuMillicores: 4000, ramMb: 16_384 },
} as const;

export type ScheduledJobMachineSize = keyof typeof SCHEDULED_JOB_MACHINE_SIZES;

export const DEFAULT_SCHEDULED_JOB_MACHINE_SIZE: ScheduledJobMachineSize = 'shared-0.5';

export function scheduledJobResources(size: string | undefined): {
  key: ScheduledJobMachineSize;
  cpuMillicores: number;
  ramMb: number;
} {
  const key = (
    size && size in SCHEDULED_JOB_MACHINE_SIZES ? size : DEFAULT_SCHEDULED_JOB_MACHINE_SIZE
  ) as ScheduledJobMachineSize;

  return { key, ...SCHEDULED_JOB_MACHINE_SIZES[key] };
}

/*
 * Run ids look like `srun_9f3a…` — an underscore is NOT legal in a DNS-1123
 * object name, so an unsanitised name is rejected by the apiserver and the run
 * never starts. Lowercase, replace every illegal character, trim to 63 chars.
 * The mapping is deterministic, so status/logs/delete all resolve the same name.
 */
export function sanitizeK8sName(value: string, prefix: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${prefix}${cleaned}`.slice(0, 63).replace(/-+$/g, '');
}

export function scheduledJobPodName(runId: string): string {
  return sanitizeK8sName(runId, 'scheduled-run-');
}

export function scheduledJobSecretName(runId: string): string {
  return sanitizeK8sName(runId, 'scheduled-secrets-');
}

export interface ScheduledJobInput {
  namespace: string;
  orgId: string;
  projectId: string;
  taskId: string;

  /** The ScheduledTaskRun id — this run's identity, and the Pod's name. */
  runId: string;
  image: string;

  /** The project's existing workspace PVC, mounted at /workspace. */
  pvcName: string;
  command: string;
  machineSize?: string;

  /** Hard wall-clock ceiling; the kubelet kills the pod past it. */
  timeoutSeconds: number;
  env?: Record<string, string>;

  /** Env var name -> key inside the run's Secret. */
  secretEnv?: Record<string, string>;
  workingDir?: string;
}

/*
 * Platform-reserved names a tenant env var must not be able to shadow.
 */
const RESERVED_SCHEDULED_ENV = new Set(['PROJECT_ID', 'SCHEDULED_TASK_ID', 'SCHEDULED_RUN_ID', 'HOME']);

function scheduledJobLabels(input: ScheduledJobInput): Record<string, string> {
  return {
    'vibecore.ai/component': 'scheduled-run',
    'vibecore.ai/org': input.orgId,
    'vibecore.ai/project': input.projectId,
    'vibecore.ai/scheduled-task': input.taskId,
    'vibecore.ai/scheduled-run': input.runId,
  };
}

/** The run's project secrets, as a Secret the Pod references by key. */
export function scheduledJobSecret(input: ScheduledJobInput, values: Record<string, string>): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: scheduledJobSecretName(input.runId),
      namespace: input.namespace,
      labels: scheduledJobLabels(input),
    },
    type: 'Opaque',
    stringData: values,
  };
}

export function scheduledJobPod(input: ScheduledJobInput): K8sObject {
  const resources = scheduledJobResources(input.machineSize);
  const sandboxSchedulingEnabled = process.env.WORKSPACE_DISABLE_SANDBOX_SCHEDULING !== '1';

  /*
   * activeDeadlineSeconds is the cluster-side backstop for the executor's own
   * timeout: even if the api pod driving this run dies, the kubelet still kills
   * the container, so a runaway job cannot bill forever. Small slack so the
   * executor's timeout normally wins and can record a clean TIMED_OUT.
   */
  const deadlineSeconds = Math.max(30, Math.round(input.timeoutSeconds) + 30);

  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: scheduledJobPodName(input.runId),
      namespace: input.namespace,
      labels: scheduledJobLabels(input),
    },
    spec: {
      // Never let the kubelet re-run a scheduled command behind the scheduler's back.
      restartPolicy: 'Never',
      activeDeadlineSeconds: deadlineSeconds,
      hostNetwork: false,
      hostPID: false,
      hostIPC: false,
      ...(sandboxSchedulingEnabled
        ? {
            runtimeClassName: 'gvisor',
            nodeSelector: { 'vibecore.ai/node-pool': 'sandbox' },
            tolerations: [
              { key: 'vibecore.ai/sandbox', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
              { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
            ],
          }
        : {}),
      automountServiceAccountToken: false,
      securityContext: {
        runAsNonRoot: true,
        runAsUser: 1000,
        runAsGroup: 1000,
        fsGroup: 1000,
        seccompProfile: { type: 'RuntimeDefault' },
      },
      containers: [
        {
          name: 'scheduled-run',
          image: input.image,
          command: ['sh', '-lc', input.command],
          workingDir: input.workingDir ?? '/workspace',
          env: [
            { name: 'PROJECT_ID', value: input.projectId },
            { name: 'SCHEDULED_TASK_ID', value: input.taskId },
            { name: 'SCHEDULED_RUN_ID', value: input.runId },
            { name: 'HOME', value: '/workspace' },
            ...Object.entries(input.env ?? {})
              .filter(([name]) => !RESERVED_SCHEDULED_ENV.has(name))
              .map(([name, value]) => ({ name, value })),
            ...Object.entries(input.secretEnv ?? {})
              .filter(([name]) => !RESERVED_SCHEDULED_ENV.has(name))
              .map(([name, key]) => ({
                name,

                // optional: a key that is absent must not brick the pod with
                // CreateContainerConfigError — the run should fail on its own terms.
                valueFrom: { secretKeyRef: { name: scheduledJobSecretName(input.runId), key, optional: true } },
              })),
          ],
          volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
          resources: {
            requests: {
              cpu: `${resources.cpuMillicores}m`,
              memory: `${resources.ramMb}Mi`,
            },

            /*
             * requests == limits: the machine size the user PICKED is the machine
             * size they GET, and it is exactly what duration x size bills them for.
             * A burstable job would bill a size it never actually had.
             */
            limits: {
              cpu: `${resources.cpuMillicores}m`,
              memory: `${resources.ramMb}Mi`,
            },
          },
          securityContext: {
            allowPrivilegeEscalation: false,
            privileged: false,
            runAsNonRoot: true,
            runAsUser: 1000,
            capabilities: { drop: ['ALL'] },
            seccompProfile: { type: 'RuntimeDefault' },
          },
        },
      ],
      volumes: [{ name: 'workspace', persistentVolumeClaim: { claimName: input.pvcName } }],
    },
  };
}

export type ScheduledJobPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';

export interface ScheduledJobStatus {
  phase: ScheduledJobPhase;
  finished: boolean;
  exitCode: number | null;
  reason?: string;
}

/**
 * Read a run's outcome from the Pod object. Pure so the mapping (and especially
 * the deadline-exceeded case) is unit-testable without a cluster.
 */
export function readScheduledJobStatus(pod: K8sObject | undefined): ScheduledJobStatus {
  if (!pod) {
    return { phase: 'Unknown', finished: false, exitCode: null, reason: 'Pod not found' };
  }

  const status = (pod as any).status ?? {};
  const phase: ScheduledJobPhase = status.phase ?? 'Unknown';
  const container = (status.containerStatuses ?? [])[0];
  const terminated = container?.state?.terminated;

  if (phase === 'Succeeded' || phase === 'Failed') {
    return {
      phase,
      finished: true,
      exitCode: typeof terminated?.exitCode === 'number' ? terminated.exitCode : phase === 'Succeeded' ? 0 : null,

      // "DeadlineExceeded" is how the kubelet reports activeDeadlineSeconds.
      reason: status.reason ?? terminated?.reason,
    };
  }

  return { phase, finished: false, exitCode: null, reason: status.reason };
}
