import assert from 'node:assert/strict';
import {
  readScheduledJobStatus,
  scheduledJobPod,
  scheduledJobPodName,
  scheduledJobResources,
  scheduledJobSecretName,
} from '../packages/k8s-client/src/scheduled-job.ts';

const input: any = {
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

const pod: any = scheduledJobPod(input);
const container = pod.spec.containers[0];

assert.equal(scheduledJobPodName('srun_9F3a'), 'scheduled-run-srun-9f3a'); // DNS-1123
assert.equal(scheduledJobSecretName('srun_9F3a'), 'scheduled-secrets-srun-9f3a');
assert.equal(pod.kind, 'Pod');
assert.equal(pod.spec.restartPolicy, 'Never'); // the kubelet must never retry a cron
assert.equal(pod.spec.activeDeadlineSeconds, 150); // timeout + 30s backstop
assert.equal(pod.spec.runtimeClassName, 'gvisor');
assert.equal(pod.spec.automountServiceAccountToken, false);
assert.deepEqual(container.command, ['sh', '-lc', 'npm run report']);
assert.equal(pod.spec.volumes[0].persistentVolumeClaim.claimName, 'pvc-ws-1');
assert.deepEqual(container.resources.requests, { cpu: '2000m', memory: '8192Mi' });
assert.deepEqual(container.resources.limits, container.resources.requests); // billed size == real size
assert.deepEqual(container.securityContext.capabilities.drop, ['ALL']);

const projectId = container.env.filter((e: any) => e.name === 'PROJECT_ID');
assert.equal(projectId.length, 1); // a tenant env var cannot spoof it
assert.equal(projectId[0].value, 'project-1');
assert.ok(container.env.some((e: any) => e.name === 'REPORT_DAY'));
assert.deepEqual(container.env.find((e: any) => e.name === 'API_KEY').valueFrom.secretKeyRef, {
  name: 'scheduled-secrets-srun-9f3a',
  key: 'API_KEY',
  optional: true,
});

assert.equal(scheduledJobResources('gpu-9000').key, 'shared-0.5'); // never bill zero
assert.deepEqual(
  readScheduledJobStatus({ status: { phase: 'Failed', containerStatuses: [{ state: { terminated: { exitCode: 3 } } }] } } as any),
  { phase: 'Failed', finished: true, exitCode: 3, reason: undefined },
);
assert.equal(readScheduledJobStatus({ status: { phase: 'Failed', reason: 'DeadlineExceeded' } } as any).reason, 'DeadlineExceeded');
assert.equal(readScheduledJobStatus({ status: { phase: 'Running' } } as any).finished, false);

console.log('pod manifest: 18 checks passed');
console.log(JSON.stringify(pod, null, 2).split('\n').slice(0, 14).join('\n'), '\n  …');
