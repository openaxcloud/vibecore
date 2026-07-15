import { describe, expect, it } from 'vitest';
import { appBuildPod, appBuildPodName, appBuildScript, type AppBuildInput } from './app-build';

const input: AppBuildInput = {
  namespace: 'workspaces',
  deploymentId: 'DEP_123',
  orgId: 'org1',
  projectId: 'proj1',
  image: 'vibecore/workspace-agent:2026.04.0',
  revisionUrl: 'https://storage.googleapis.com/vc-proj1/revisions/dep_123.tgz?sig=abc',
  revisionSha256: 'a'.repeat(64),
  artifactUrl: 'https://storage.googleapis.com/vc-proj1/tmp/dep_123-context.tgz?sig=def',
  artifactHeaders: { 'Content-Type': 'application/gzip', Host: 'storage.googleapis.com' },
  buildCommand: 'npm install --include=dev && npm run build',
  timeoutSeconds: 600,
};

describe('appBuildPodName', () => {
  it('is deterministic and DNS-1123 safe', () => {
    expect(appBuildPodName('DEP_123')).toBe('app-build-dep-123');
    expect(appBuildPodName('DEP_123')).toBe(appBuildPodName('DEP_123'));
  });
});

describe('appBuildScript', () => {
  it('fetches, verifies, builds, packages, uploads — in that order', () => {
    const script = appBuildScript(input.artifactHeaders);
    const order = [
      'curl -fsS -o revision.tgz "$REVISION_URL"',
      'sha256sum -c -',
      'tar xzf revision.tgz -C app',
      'sh -c "$ECODE_BUILD_COMMAND"',
      'tar czf /work/context.tgz .',
      '--upload-file /work/context.tgz "$ARTIFACT_PUT_URL"',
    ];
    let last = -1;

    for (const marker of order) {
      const at = script.indexOf(marker);
      expect(at, marker).toBeGreaterThan(last);
      last = at;
    }
  });

  it('sends the signed PUT headers verbatim (V4 signature binds them)', () => {
    const script = appBuildScript(input.artifactHeaders);
    expect(script).toContain("-H 'Content-Type: application/gzip'");
    expect(script).toContain("-H 'Host: storage.googleapis.com'");
  });
});

describe('appBuildPod', () => {
  it('is a bare never-restart gVisor pod with no workspace PVC (emptyDir only)', () => {
    const pod = appBuildPod(input) as any;

    expect(pod.kind).toBe('Pod');
    expect(pod.metadata.name).toBe('app-build-dep-123');
    expect(pod.spec.restartPolicy).toBe('Never');
    expect(pod.spec.activeDeadlineSeconds).toBe(630);
    expect(pod.spec.runtimeClassName).toBe('gvisor');
    expect(pod.spec.automountServiceAccountToken).toBe(false);

    // Isolation invariant: the build must NOT be able to touch the workspace.
    expect(JSON.stringify(pod.spec.volumes)).not.toContain('persistentVolumeClaim');
    expect(pod.spec.volumes).toEqual([{ name: 'work', emptyDir: { sizeLimit: '8Gi' } }]);
  });

  it('carries the server-deploy label the egress NetworkPolicy matches', () => {
    const pod = appBuildPod(input) as any;
    expect(pod.metadata.labels['vibecore.ai/server-deploy']).toBe('DEP_123');
    expect(pod.metadata.labels['vibecore.ai/component']).toBe('app-build');
  });

  it('threads revision/artifact/build inputs as env vars (no shell quoting of user strings)', () => {
    const pod = appBuildPod(input) as any;
    const env = Object.fromEntries(pod.spec.containers[0].env.map((e: any) => [e.name, e.value]));

    expect(env.REVISION_URL).toBe(input.revisionUrl);
    expect(env.REVISION_SHA256).toBe(input.revisionSha256);
    expect(env.ARTIFACT_PUT_URL).toBe(input.artifactUrl);
    expect(env.ECODE_BUILD_COMMAND).toBe(input.buildCommand);
    expect(env.ECODE_DEPLOYMENT).toBe('1');
    expect(env.HOME).toBe('/work');
  });

  it('satisfies the restricted PSS at the container level', () => {
    const c = (appBuildPod(input) as any).spec.containers[0];
    expect(c.securityContext.allowPrivilegeEscalation).toBe(false);
    expect(c.securityContext.capabilities.drop).toEqual(['ALL']);
    expect(c.securityContext.seccompProfile).toEqual({ type: 'RuntimeDefault' });
  });

  it('mounts /nix RO only when a store PVC is given (kill-switch contract)', () => {
    const off = appBuildPod(input) as any;
    expect(JSON.stringify(off.spec)).not.toContain('/nix');

    const on = appBuildPod({ ...input, nixStorePvcName: 'nix-store-v2-pvc' }) as any;
    expect(on.spec.containers[0].volumeMounts).toContainEqual({
      name: 'nix-store',
      mountPath: '/nix',
      readOnly: true,
    });
    expect(on.spec.volumes).toContainEqual({
      name: 'nix-store',
      persistentVolumeClaim: { claimName: 'nix-store-v2-pvc', readOnly: true },
    });
  });

  it('omits sha verification and build command when absent', () => {
    const pod = appBuildPod({ ...input, revisionSha256: undefined, buildCommand: undefined }) as any;
    const names = pod.spec.containers[0].env.map((e: any) => e.name);
    expect(names).not.toContain('REVISION_SHA256');
    expect(names).not.toContain('ECODE_BUILD_COMMAND');
  });
});
