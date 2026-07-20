/*
 * Ephemeral Pod for ONE isolated server-deploy build (reproducible pipeline).
 *
 * The Phase-A snapshot-image path tars the LIVE workspace pod (deps included) as
 * the docker-build context — non-replayable by construction (caches, mutable
 * state, whatever the dev pod accumulated). This pod is the replacement build
 * stage: it starts from the project REVISION (source only, content-hashed),
 * installs dependencies and runs the declared build in a throwaway sandbox, and
 * uploads the resulting full artifact (deps included) as the docker-build
 * context. Same inputs ⇒ same artifact; the dev pod is never the source of truth.
 *
 * Deliberately a bare Pod with `restartPolicy: Never`, NOT a batch/v1 Job — the
 * same reasoning as scheduled-job.ts: deterministic name (`app-build-<id>`) so
 * the caller polls/streams/deletes with the client it already has, and no hidden
 * kubelet-level retry (retry policy belongs to the deploy flow).
 *
 * Isolation: gVisor runtimeClass + sandbox pool, non-root, no SA token, all caps
 * dropped — and NO workspace PVC: the build works on an emptyDir copy, so it is
 * structurally impossible for an install/build to trash the user's workspace.
 * The pod carries the `vibecore.ai/server-deploy` label because that is what the
 * `server-deploy-egress` NetworkPolicy matches (DNS + 443 — GCS and package
 * registries; the metadata server stays blocked).
 *
 * The optional shared RO Nix store mounts at /nix (same kill-switch contract as
 * workspace + app pods): absent PVC ⇒ the pod spec carries no /nix at all.
 */
import { nixStoreGuardInitContainer, type K8sObject } from './index.js';
import { sanitizeK8sName } from './scheduled-job.js';

export function appBuildPodName(deploymentId: string): string {
  return sanitizeK8sName(deploymentId, 'app-build-');
}

export interface AppBuildInput {
  namespace: string;

  /** The deployment this build belongs to — also the pod's identity. */
  deploymentId: string;
  orgId?: string;
  projectId?: string;

  /** Toolchain image the build runs in (workspace-agent runtime today). */
  image: string;

  /** Signed GET of the revision tarball (source only). */
  revisionUrl: string;

  /** sha256 of the revision tarball; verified before anything runs. */
  revisionSha256?: string;

  /** Signed PUT for the built artifact (docker-build context, deps included). */
  artifactUrl: string;

  /** The signed headers the PUT is bound to — sent verbatim, nothing else. */
  artifactHeaders: Record<string, string>;

  /**
   * Install + build as ONE shell command (composed by the api from the detected
   * package manager and/or `.ecode/deploy.json` build). Empty ⇒ package only.
   */
  buildCommand?: string;

  /** Hard wall-clock ceiling; the kubelet kills the pod past it. */
  timeoutSeconds: number;

  /** Shared RO Nix store PVC (kill-switch: absent ⇒ no /nix in the spec). */
  nixStorePvcName?: string;

  /** D3 multi-zone: pin the build pod to the zone of the store clone it mounts. */
  nixStoreZone?: string;

  /** D3 drift guard: expected sha256 of /nix/ecode/catalog.json (blocks the pod on mismatch). */
  nixStoreGenerationHash?: string;
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;

  /**
   * emptyDir ceiling for the build workspace (source + deps + artifact). Bounded
   * so one build cannot fill a sandbox node's boot disk (regional SSD quota is
   * the current capacity wall).
   */
  workVolumeSizeLimit?: string;
}

function appBuildLabels(input: AppBuildInput): Record<string, string> {
  return {
    'vibecore.ai/component': 'app-build',

    // Matched by the `server-deploy-egress` NetworkPolicy (DNS + 443 egress).
    'vibecore.ai/server-deploy': input.deploymentId,
    ...(input.orgId ? { 'vibecore.ai/org': input.orgId } : {}),
    ...(input.projectId ? { 'vibecore.ai/project': input.projectId } : {}),
  };
}

/**
 * The build script, exported pure so the exact contract (fetch → verify → build
 * → package → upload) is unit-testable. URLs/commands travel as env vars, so the
 * script needs no shell-quoting of caller-controlled strings; only the signed
 * PUT headers (content-type/host — not secrets) are inlined, exactly as signed.
 */
export function appBuildScript(artifactHeaders: Record<string, string>): string {
  const headerFlags = Object.entries(artifactHeaders)
    .map(([name, value]) => `-H '${name}: ${value}'`)
    .join(' ');

  return [
    'set -eu',
    'cd /work',
    'echo "[build] fetching revision"',
    'curl -fsS -o revision.tgz "$REVISION_URL"',
    'if [ -n "${REVISION_SHA256:-}" ]; then',
    '  echo "$REVISION_SHA256  revision.tgz" | sha256sum -c - >/dev/null',
    '  echo "[build] revision sha256 verified"',
    'fi',
    'mkdir -p app',
    'tar xzf revision.tgz -C app',
    'rm revision.tgz',
    'cd app',
    'if [ -n "${ECODE_BUILD_COMMAND:-}" ]; then',
    '  echo "[build] running: $ECODE_BUILD_COMMAND"',
    '  sh -c "$ECODE_BUILD_COMMAND"',
    'fi',
    'echo "[build] packaging artifact"',
    'tar czf /work/context.tgz .',
    'ARTIFACT_BYTES=$(wc -c < /work/context.tgz)',
    'echo "[build] artifact: $ARTIFACT_BYTES bytes (deps included)"',
    `curl -fsS -X PUT ${headerFlags} --upload-file /work/context.tgz "$ARTIFACT_PUT_URL" > /dev/null`,
    'echo "[build] uploaded artifact"',
  ].join('\n');
}

export function appBuildPod(input: AppBuildInput): K8sObject {
  const sandboxSchedulingEnabled = process.env.WORKSPACE_DISABLE_SANDBOX_SCHEDULING !== '1';

  // Cluster-side backstop for the caller's own timeout (same slack contract as
  // scheduled-job.ts): a runaway build cannot hold a sandbox node forever.
  const deadlineSeconds = Math.max(30, Math.round(input.timeoutSeconds) + 30);

  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: appBuildPodName(input.deploymentId),
      namespace: input.namespace,
      labels: appBuildLabels(input),
    },
    spec: {
      restartPolicy: 'Never',
      activeDeadlineSeconds: deadlineSeconds,
      hostNetwork: false,
      hostPID: false,
      hostIPC: false,
      ...(sandboxSchedulingEnabled
        ? {
            runtimeClassName: 'gvisor',
            nodeSelector: {
              'vibecore.ai/node-pool': 'sandbox',
              // D3 multi-zone: pin to the zone of the mounted store clone.
              ...(input.nixStorePvcName && input.nixStoreZone
                ? { 'topology.kubernetes.io/zone': input.nixStoreZone }
                : {}),
            },
            tolerations: [
              { key: 'vibecore.ai/sandbox', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
              { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
            ],
          }
        : input.nixStorePvcName && input.nixStoreZone
          ? { nodeSelector: { 'topology.kubernetes.io/zone': input.nixStoreZone } }
          : {}),
      // D3 drift guard: wrong-generation clone ⇒ init fails ⇒ build never runs.
      ...(input.nixStorePvcName && input.nixStoreGenerationHash
        ? { initContainers: [nixStoreGuardInitContainer(input.image, input.nixStoreGenerationHash)] }
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
          name: 'app-build',
          image: input.image,
          command: ['sh', '-lc', appBuildScript(input.artifactHeaders)],
          workingDir: '/work',
          env: [
            { name: 'HOME', value: '/work' },

            // Package-manager caches must land in the bounded work volume, not /.
            { name: 'npm_config_cache', value: '/work/.npm-cache' },
            { name: 'XDG_CACHE_HOME', value: '/work/.cache' },

            // Build-time parity with the runtime image (ENV ECODE_DEPLOYMENT=1):
            // a build that bakes env (e.g. vite) sees the same deployment marker.
            { name: 'ECODE_DEPLOYMENT', value: '1' },
            { name: 'REVISION_URL', value: input.revisionUrl },
            ...(input.revisionSha256 ? [{ name: 'REVISION_SHA256', value: input.revisionSha256 }] : []),
            { name: 'ARTIFACT_PUT_URL', value: input.artifactUrl },
            ...(input.buildCommand ? [{ name: 'ECODE_BUILD_COMMAND', value: input.buildCommand }] : []),
          ],
          volumeMounts: [
            { name: 'work', mountPath: '/work' },
            ...(input.nixStorePvcName ? [{ name: 'nix-store', mountPath: '/nix', readOnly: true }] : []),
          ],
          resources: {
            requests: { cpu: input.cpuRequest ?? '1', memory: input.memoryRequest ?? '2Gi' },
            limits: { cpu: input.cpuLimit ?? '2', memory: input.memoryLimit ?? '4Gi' },
          },

          // Container-level hardening — required by the `restricted` Pod Security
          // Standard enforced on the workspaces namespace (same as app pods).
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
      volumes: [
        { name: 'work', emptyDir: { sizeLimit: input.workVolumeSizeLimit ?? '8Gi' } },
        ...(input.nixStorePvcName
          ? [{ name: 'nix-store', persistentVolumeClaim: { claimName: input.nixStorePvcName, readOnly: true } }]
          : []),
      ],
    },
  };
}
