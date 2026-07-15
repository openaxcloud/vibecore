import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULED_JOB_MACHINE_SIZE,
  readScheduledJobStatus,
  sanitizeK8sName,
  scheduledJobPod,
  scheduledJobPodName,
  scheduledJobResources,
  scheduledJobSecret,
  scheduledJobSecretName,
  type ScheduledJobInput,
} from './scheduled-job.js';

const input: ScheduledJobInput = {
  namespace: 'workspaces',
  orgId: 'org-1',
  projectId: 'project-1',
  taskId: 'sched_abc',
  runId: 'srun_9F3a',
  image: 'vibecore/workspace-agent:2026.04.0',
  pvcName: 'pvc-ws-1',
  command: 'npm run report',
  machineSize: 'dedicated-2',
  timeoutSeconds: 120,
  env: { REPORT_DAY: 'monday', PROJECT_ID: 'spoofed' },
  secretEnv: { API_KEY: 'API_KEY' },
};

describe('names', () => {
  it('produces DNS-1123 names from ids that contain underscores', () => {
    expect(scheduledJobPodName('srun_9F3a')).toBe('scheduled-run-srun-9f3a');
    expect(scheduledJobSecretName('srun_9F3a')).toBe('scheduled-secrets-srun-9f3a');
  });

  it('never exceeds 63 characters or ends in a dash', () => {
    const name = sanitizeK8sName('x'.repeat(120), 'scheduled-run-');

    expect(name.length).toBeLessThanOrEqual(63);
    expect(name.endsWith('-')).toBe(false);
  });
});

describe('scheduledJobResources', () => {
  it('maps a known size', () => {
    expect(scheduledJobResources('dedicated-2')).toEqual({ key: 'dedicated-2', cpuMillicores: 2000, ramMb: 8192 });
  });

  it('degrades an unknown size to the smallest tier', () => {
    expect(scheduledJobResources('gpu-9000').key).toBe(DEFAULT_SCHEDULED_JOB_MACHINE_SIZE);
    expect(scheduledJobResources(undefined).key).toBe(DEFAULT_SCHEDULED_JOB_MACHINE_SIZE);
  });
});

describe('scheduledJobPod', () => {
  const pod = scheduledJobPod(input);
  const spec = pod.spec as any;
  const container = spec.containers[0];

  it('is a disposable Pod that the kubelet may never retry', () => {
    expect(pod.kind).toBe('Pod');
    expect(spec.restartPolicy).toBe('Never');
  });

  it('carries a cluster-side deadline above the executor timeout', () => {
    expect(spec.activeDeadlineSeconds).toBe(150);
  });

  it('runs the command in a shell, in the project volume', () => {
    expect(container.command).toEqual(['sh', '-lc', 'npm run report']);
    expect(container.workingDir).toBe('/workspace');
    expect(spec.volumes[0].persistentVolumeClaim.claimName).toBe('pvc-ws-1');
    expect(container.volumeMounts[0].mountPath).toBe('/workspace');
  });

  it('gives the run exactly the machine size it is billed for (requests == limits)', () => {
    expect(container.resources.requests).toEqual({ cpu: '2000m', memory: '8192Mi' });
    expect(container.resources.limits).toEqual(container.resources.requests);
  });

  it('keeps the sandbox isolation of a workspace pod', () => {
    expect(spec.runtimeClassName).toBe('gvisor');
    expect(spec.automountServiceAccountToken).toBe(false);
    expect(container.securityContext.runAsNonRoot).toBe(true);
    expect(container.securityContext.capabilities.drop).toEqual(['ALL']);
  });

  it('injects project env but refuses to let a tenant var spoof a reserved name', () => {
    const names = container.env.map((entry: any) => entry.name);
    const projectId = container.env.filter((entry: any) => entry.name === 'PROJECT_ID');

    expect(names).toContain('REPORT_DAY');
    expect(projectId).toHaveLength(1);
    expect(projectId[0].value).toBe('project-1');
  });

  it('reads secrets from the per-run Secret, optionally', () => {
    const apiKey = container.env.find((entry: any) => entry.name === 'API_KEY');

    expect(apiKey.valueFrom.secretKeyRef).toEqual({
      name: 'scheduled-secrets-srun-9f3a',
      key: 'API_KEY',
      optional: true,
    });
  });

  it('labels the pod so a run can always be traced back to its task', () => {
    expect(pod.metadata.labels).toMatchObject({
      'vibecore.ai/component': 'scheduled-run',
      'vibecore.ai/scheduled-task': 'sched_abc',
      'vibecore.ai/scheduled-run': 'srun_9F3a',
    });
  });
});

describe('scheduledJobSecret', () => {
  it('holds the run values under the run-scoped name', () => {
    const secret = scheduledJobSecret(input, { API_KEY: 'sk-live-1' });

    expect(secret.metadata.name).toBe('scheduled-secrets-srun-9f3a');
    expect(secret.stringData).toEqual({ API_KEY: 'sk-live-1' });
  });
});

describe('readScheduledJobStatus', () => {
  it('reports a clean success', () => {
    const status = readScheduledJobStatus({
      ...scheduledJobPod(input),
      status: { phase: 'Succeeded', containerStatuses: [{ state: { terminated: { exitCode: 0 } } }] },
    } as any);

    expect(status).toMatchObject({ phase: 'Succeeded', finished: true, exitCode: 0 });
  });

  it('surfaces the real exit code of a failure', () => {
    const status = readScheduledJobStatus({
      ...scheduledJobPod(input),
      status: { phase: 'Failed', containerStatuses: [{ state: { terminated: { exitCode: 3 } } }] },
    } as any);

    expect(status).toMatchObject({ finished: true, exitCode: 3 });
  });

  it('recognises the cluster-side deadline kill', () => {
    const status = readScheduledJobStatus({
      ...scheduledJobPod(input),
      status: { phase: 'Failed', reason: 'DeadlineExceeded' },
    } as any);

    expect(status).toMatchObject({ finished: true, reason: 'DeadlineExceeded' });
  });

  it('is not finished while pending or running', () => {
    expect(readScheduledJobStatus({ ...scheduledJobPod(input), status: { phase: 'Pending' } } as any).finished).toBe(
      false,
    );
    expect(readScheduledJobStatus(undefined).phase).toBe('Unknown');
  });
});
