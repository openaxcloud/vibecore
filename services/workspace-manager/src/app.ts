import { createHash, timingSafeEqual } from 'node:crypto';
import { getClusterCapacity } from '@vibecore/k8s-client';
import Fastify from 'fastify';
import { z } from 'zod';
import { runAppBuild } from './app-builds.js';
import { WorkspaceManager } from './manager.js';
import {
  localizeWorkspaceManagerMessage,
  workspaceManagerLocaleFromHeader,
  workspaceManagerMessage,
  workspaceManagerMessageKeyForEnglish,
} from './public-i18n.js';
import { runScheduledJob } from './scheduled-jobs.js';

/*
 * One disposable run of a scheduled task. `secretValues` are the project's
 * decrypted secrets; they are written to a per-run Secret that is deleted with
 * the pod, so they never outlive the run.
 */
const scheduledJobSchema = z.object({
  orgId: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  image: z.string().min(1),
  pvcName: z.string().min(1),
  command: z.string().min(1),
  machineSize: z.string().optional(),
  timeoutSeconds: z.number().int().positive().max(3600).default(900),
  env: z.record(z.string()).optional(),
  secretEnv: z.record(z.string()).optional(),
  secretValues: z.record(z.string()).optional(),
  workingDir: z.string().optional(),
});

const startSchema = z.object({
  namespace: z.string().default('workspaces'),
  orgId: z.string(),
  projectId: z.string(),
  workspaceId: z.string(),
  image: z.string().default('vibecore/workspace-agent:2026.04.0'),
  plan: z.enum(['free', 'pro', 'team', 'enterprise']).default('free'),
  storageClassName: z.string().min(1).optional(),
  env: z.record(z.string()).default({}),
  allowedSecretKeys: z.array(z.string()).default([]),
  allowedSecrets: z.record(z.string()).optional(),
  resourceLimits: z
    .object({
      cpuMillicores: z.number().int().positive().optional(),
      ramMb: z.number().int().positive().optional(),
      storageGb: z.number().int().positive().optional(),
    })
    .optional(),

  /*
   * Per-request shared RO Nix store opt-in (candidate E rollout gate). The api
   * decides WHICH workspaces get /nix (project allowlist) without flipping the
   * cluster-wide NIX_STORE_PVC_NAME kill switch. Omitted ⇒ manager default.
   */
  nixStorePvcName: z.string().min(1).optional(),
});

const accountPurgeLeaseSchema = z.object({
  planId: z.string().min(1).max(200),
  ownerToken: z.string().min(16).max(512),
});

const accountPurgeWorkspaceCompletionSchema = accountPurgeLeaseSchema.extend({
  volumeReceipt: z.object({
    schemaVersion: z.literal('project-volume-erasure-receipt-v1'),
    operationId: z.string().min(1).max(512),
    projectId: z.string().min(1).max(200),
    organizationId: z.string().min(1).max(200),
    inventoryHash: z.string().regex(/^[0-9a-f]{64}$/u),
    verificationHash: z.string().regex(/^[0-9a-f]{64}$/u),
    finalScanHash: z.string().regex(/^[0-9a-f]{64}$/u),
    quiescenceHash: z.string().regex(/^[0-9a-f]{64}$/u),
    entryCount: z.number().int().nonnegative(),
    erasedEntryCount: z.number().int().nonnegative(),
    alreadyAbsentEntryCount: z.number().int().nonnegative(),
    persistentVolumeClaimsAbsent: z.literal(true),
    persistentVolumesAbsent: z.literal(true),
    providerVolumesAbsent: z.literal(true),
  }),
});

const projectDeletionLeaseSchema = z.object({
  operationId: z.string().min(1).max(200),
  ownerToken: z.string().min(16).max(512),
  fencingToken: z.string().regex(/^[1-9][0-9]{0,39}$/),
  requestHash: z.string().regex(/^[0-9a-f]{64}$/),
  scopeHash: z.string().regex(/^[0-9a-f]{64}$/),
  projectId: z.string().min(1).max(200),
  expectedOrganizationId: z.string().min(1).max(200),
});

/*
 * Body for POST /app-builds/run — ONE isolated server-deploy build (reproducible
 * pipeline): fetch the project revision, install+build in a throwaway gVisor
 * pod, upload the artifact. Synchronous like /scheduled-jobs/run: the api owns
 * the deployment row and needs the exit code + full logs back to proceed.
 */
const appBuildSchema = z.object({
  deploymentId: z.string().min(1),
  orgId: z.string().min(1),
  projectId: z.string().min(1),
  image: z.string().min(1),
  revisionUrl: z.string().min(1),
  revisionSha256: z.string().length(64).optional(),
  artifactUrl: z.string().min(1),
  artifactHeaders: z.record(z.string()),
  buildCommand: z.string().min(1).optional(),
  timeoutSeconds: z.number().int().positive().max(3600).default(600),

  // Same /nix RO mount contract as workspaces + app pods (kill-switch gated).
  nixStorePvcName: z.string().min(1).optional(),

  // CTR-RUNTIME-NIX: ecode.lock pin (generation id or catalog hash), resolved
  // through the registry's revocation gate — REVOKED/unknown throws typed.
  nixGenerationRef: z.string().min(1).optional(),
});

/** Body for POST /server-deployments/start (Replit-parity durable runtime). */
const serverStartSchema = z
  .object({
    deploymentId: z.string().min(1),
    orgId: z.string().min(1),
    projectId: z.string().min(1),
    image: z.string().min(1),
    command: z.array(z.string()).optional(),
    args: z.array(z.string()).optional(),
    port: z.number().int().positive().default(3000),
    host: z.string().min(1),
    tlsSecretName: z.string().default('vibecore-preview-wildcard-tls'),
    env: z.record(z.string()).optional(),
    secrets: z.record(z.string()).optional(),
    replicas: z.number().int().positive().optional(),
    healthPath: z.string().optional(),
    readyTimeoutMs: z.number().int().positive().optional(),
    createIngress: z.boolean().optional(),

    // Same /nix RO mount as the workspace the app was snapshotted from (see startSchema).
    nixStorePvcName: z.string().min(1).optional(),

    // Same ecode.lock generation pin as app-builds (CTR-RUNTIME-NIX).
    nixGenerationRef: z.string().min(1).optional(),

    /*
     * Machine size resources (rate-card catalogue, resolved by the api):
     * k8s quantity strings, applied verbatim as the container requests/limits.
     */
    cpuRequest: z.string().min(1).optional(),
    cpuLimit: z.string().min(1).optional(),
    memoryRequest: z.string().min(1).optional(),
    memoryLimit: z.string().min(1).optional(),
    runtimeKind: z.enum(['autoscale', 'reserved-vm']).default('autoscale'),
    reservedVmTier: z.enum(['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4']).optional(),
    operationId: z.string().min(1).max(128).optional(),
    fencingToken: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, context) => {
    if (value.runtimeKind === 'reserved-vm' && !value.reservedVmTier) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reservedVmTier'],
        message: workspaceManagerMessage('reservedVmTierRequired', 'en'),
      });
    }
    if (value.runtimeKind === 'reserved-vm' && (!value.operationId || value.fencingToken === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operationId'],
        message: workspaceManagerMessage('reservedVmFenceRequired', 'en'),
      });
    }
  });

const serverReconfigureSchema = z
  .object({
    runtimeKind: z.enum(['autoscale', 'reserved-vm']),
    reservedVmTier: z.enum(['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4']).optional(),
    image: z.string().trim().min(1).max(2048).optional(),
    command: z.array(z.string().max(4096)).max(128).optional(),
    args: z.array(z.string().max(4096)).max(128).optional(),
    env: z
      .record(z.string().max(32_768))
      .refine((value) => Object.keys(value).length <= 256, 'At most 256 environment variables are allowed')
      .optional(),
    healthPath: z.string().min(1).max(2048).regex(/^\//, 'Health path must start with /').optional(),
    nixGenerationRef: z.string().trim().min(1).max(256).optional(),
    cpuRequest: z.string().min(1).optional(),
    cpuLimit: z.string().min(1).optional(),
    memoryRequest: z.string().min(1).optional(),
    memoryLimit: z.string().min(1).optional(),
    readyTimeoutMs: z
      .number()
      .int()
      .positive()
      .max(10 * 60_000)
      .optional(),
    operationId: z.string().min(1).max(128),
    fencingToken: z.number().int().nonnegative(),
  })
  .superRefine((value, context) => {
    if (value.runtimeKind === 'reserved-vm' && !value.reservedVmTier) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reservedVmTier'],
        message: workspaceManagerMessage('reservedVmTierRequired', 'en'),
      });
    }
  });

const serverSuspendSchema = z.object({
  operationId: z.string().min(1).max(128),
  fencingToken: z.number().int().nonnegative(),
  readyTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(10 * 60_000)
    .optional(),
});

const serverStorageDecommissionSchema = z.object({
  persistentVolumeClaimName: z.string().min(1).max(253),
  operationId: z.string().min(1).max(128),
  fencingToken: z.number().int().nonnegative(),
  mode: z.enum(['autoscale-decommission', 'failed-create']),
  readyTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(10 * 60_000)
    .optional(),
});

function runtimeNamespace() {
  return process.env.WORKSPACE_RUNTIME_NAMESPACE ?? 'workspaces';
}

/*
 * Default GC windows for the /workspaces/gc route when the caller omits them.
 * Read the SAME env vars the worker uses (WORKSPACE_IDLE_STOP_MINUTES /
 * WORKSPACE_DELETE_STOPPED_HOURS) with the same 30m / 24h built-in fallback,
 * so the manager and worker agree on the tuned window regardless of which side
 * supplies it. Parsed defensively: a malformed or non-positive override falls
 * back to the built-in rather than yielding a bogus (NaN / 0 / negative) window.
 */
function defaultIdleStopMs(): number {
  const parsed = Number(process.env.WORKSPACE_IDLE_STOP_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60_000 : 30 * 60_000;
}

function defaultDeleteStoppedMs(): number {
  const parsed = Number(process.env.WORKSPACE_DELETE_STOPPED_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60 * 60_000 : 24 * 60 * 60_000;
}

/*
 * Idle window before a deployed server app is scaled to 0 (Replit-parity: apps
 * sleep when idle, wake on request). Defaults to 15 min — tighter than the
 * workspace idle-stop (30 min) because a server app wakes far faster than a
 * workspace reprovision (scale 0→1 vs pod+PVC provisioning).
 */
const SERVER_DEPLOY_IDLE_MS = (() => {
  const parsed = Number(process.env.SERVER_DEPLOY_IDLE_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60_000 : 15 * 60_000;
})();

function agentBaseUrl(workspaceId: string) {
  const template = process.env.WORKSPACE_AGENT_URL_TEMPLATE ?? process.env.WORKSPACE_AGENT_BASE_URL;

  if (template) {
    return template
      .replaceAll('{workspaceId}', workspaceId)
      .replaceAll('{namespace}', runtimeNamespace())
      .replace(/\/+$/, '');
  }

  return `http://workspace-${workspaceId}.${runtimeNamespace()}.svc.cluster.local:8080`;
}

function requirePreviewProxyAuth(request: { headers: Record<string, string | string[] | undefined> }) {
  const expected = normalizeSharedSecret(process.env.PREVIEW_PROXY_SHARED_SECRET);

  if (!expected) {
    throw Object.assign(new Error(workspaceManagerMessage('previewProxyNotConfigured', 'en')), {
      statusCode: 503,
      code: 'PREVIEW_PROXY_NOT_CONFIGURED',
    });
  }

  const authorization = request.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = normalizeSharedSecret(value?.replace(/^Bearer\s+/i, ''));

  if (!token || !secretsMatch(token, expected)) {
    throw Object.assign(new Error(workspaceManagerMessage('previewProxyUnauthorized', 'en')), {
      statusCode: 401,
      code: 'PREVIEW_PROXY_UNAUTHORIZED',
    });
  }
}

function normalizeSharedSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/*
 * Constant-time comparison for the control-plane shared secret. A plain `!==`
 * leaks length/prefix timing that can be used to recover the secret byte by byte;
 * compare over fixed-length digests so timing is independent of the inputs.
 */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();

  return timingSafeEqual(ha, hb);
}

/**
 * Control-plane auth for the manager's mutating/sensitive routes. The manager can mint
 * agent tokens (cross-tenant workspace access), start/stop/delete arbitrary workspaces
 * and trigger GC — so when a shared secret is configured every non-health route must
 * present it as a bearer. The secret is `WORKSPACE_MANAGER_SHARED_SECRET`, falling back
 * to `PREVIEW_PROXY_SHARED_SECRET` (already wired between api↔manager) so existing
 * deployments are protected the moment either is set. In production an unset secret is a
 * hard misconfiguration and is rejected (fail-closed); outside production it is allowed
 * so local/dev and tests keep working without a secret.
 */
function controlPlaneSecret(): string | undefined {
  /*
   * Control plane requires a DEDICATED WORKSPACE_MANAGER_SHARED_SECRET. The old
   * fallback to PREVIEW_PROXY_SHARED_SECRET meant the (more widely-shared) preview
   * secret could mint agent tokens / start/stop/delete workspaces. The distinct
   * secret is now provisioned in the cluster secret, so the fallback is removed.
   */
  return normalizeSharedSecret(process.env.WORKSPACE_MANAGER_SHARED_SECRET);
}

export function buildWorkspaceManagerApp(manager: WorkspaceManager) {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (request, reply) => {
    const locale = workspaceManagerLocaleFromHeader(request.headers['accept-language']);
    reply.header('content-language', locale);
    reply.header('vary', 'Accept-Language');
  });

  app.addHook('preSerialization', async (request, _reply, payload) => {
    const locale = workspaceManagerLocaleFromHeader(request.headers['accept-language']);

    const visit = (value: unknown, field?: string): unknown => {
      if (typeof value === 'string') {
        return field === 'error' || field === 'message' ? localizeWorkspaceManagerMessage(value, locale) : value;
      }

      if (Array.isArray(value)) {
        return value.map((entry) => visit(entry));
      }

      if (!value || typeof value !== 'object') {
        return value;
      }

      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, visit(entry, key)]),
      );
    };

    return visit(payload);
  });

  app.setErrorHandler((error, request, reply) => {
    const locale = workspaceManagerLocaleFromHeader(request.headers['accept-language']);

    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        statusCode: 400,
        error: workspaceManagerMessage('validationFailed', locale),
        message: workspaceManagerMessage('validationFailed', locale),
        code: 'VALIDATION_ERROR',
      });
    }

    const typed = error as Error & {
      code?: string;
      publicMessageKey?: Parameters<typeof workspaceManagerMessage>[0];
      rolledBack?: boolean;
      persistentStorageDeleted?: boolean;
      persistentStorageClaimName?: string;
      statusCode?: number;
    };
    const statusCode = typeof typed.statusCode === 'number' ? typed.statusCode : 500;
    const exactKey = workspaceManagerMessageKeyForEnglish(typed.message);
    const message = typed.publicMessageKey
      ? workspaceManagerMessage(typed.publicMessageKey, locale)
      : exactKey
        ? workspaceManagerMessage(exactKey, locale)
        : workspaceManagerMessage(statusCode >= 500 ? 'internalServerError' : 'requestFailed', locale);

    if (statusCode >= 500) {
      request.log.error({ err: error, code: typed.code }, 'workspace-manager request failed');
    }

    return reply.code(statusCode).send({
      statusCode,
      error: message,
      message,
      code: typed.code ?? 'WORKSPACE_MANAGER_ERROR',
      ...(typed.rolledBack === true ? { rolledBack: true } : {}),
      ...(typed.persistentStorageDeleted === true ? { persistentStorageDeleted: true } : {}),
      ...(typed.persistentStorageDeleted === true && typed.persistentStorageClaimName
        ? { persistentStorageClaimName: typed.persistentStorageClaimName }
        : {}),
    });
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/health?')) {
      return;
    }

    /*
     * The internal preview-proxy agent endpoint enforces its own auth via
     * requirePreviewProxyAuth (PREVIEW_PROXY_SHARED_SECRET). The global hook
     * authenticates against WORKSPACE_MANAGER_SHARED_SECRET (with a fallback to
     * the preview secret), so once an operator sets a distinct manager secret
     * the global check would 401 preview-proxy before its own auth runs and
     * break every preview. Skip the global hook here and let the route's
     * dedicated check gate it.
     */
    if (request.url.startsWith('/internal/')) {
      return;
    }

    const expected = controlPlaneSecret();

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        return reply.code(503).send({
          error: workspaceManagerMessage('managerNotConfigured', 'en'),
          code: 'WORKSPACE_MANAGER_NOT_CONFIGURED',
        });
      }

      return; // dev/test convenience only
    }

    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = normalizeSharedSecret(value?.replace(/^Bearer\s+/i, ''));

    if (!token || !secretsMatch(token, expected)) {
      return reply
        .code(401)
        .send({ error: workspaceManagerMessage('managerUnauthorized', 'en'), code: 'WORKSPACE_MANAGER_UNAUTHORIZED' });
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));

  /*
   * Read-only, authenticated operator proof used by the api rate card. It is
   * deliberately live rather than env-only: an absent StorageClass or matching
   * tainted node keeps the product fail-closed.
   */
  app.get('/runtime-capabilities', async () => ({
    reservedVm: await manager.reservedVmRuntimeCapability(runtimeNamespace()),
  }));

  /*
   * The MANAGER pod's runtimeNamespace() is the single source of truth for where
   * workspace pods live. start used to trust the request-body namespace while
   * stop/delete/logs use runtimeNamespace() — if the API's and manager's
   * WORKSPACE_RUNTIME_NAMESPACE ever diverged, pods were created in one namespace
   * but stop/delete/GC targeted another (leaked pods, wrong-ns ops). Override the
   * body namespace on every create path so all operations agree.
   */
  app.post('/workspaces/start', async (request) =>
    manager.startWorkspace({ ...startSchema.parse(request.body), namespace: runtimeNamespace() }),
  );

  /*
   * Server deployments (Replit-parity durable runtime): apply Deployment+Service+
   * Ingress running the built backend, poll readiness, return the public URL. The
   * namespace is always the manager's runtimeNamespace() (same as workspaces).
   */
  app.post('/server-deployments/start', async (request) =>
    (() => {
      const body = serverStartSchema.parse(request.body);
      return manager.executeDeploymentProvisionEffect(
        {
          deploymentId: body.deploymentId,
          projectId: body.projectId,
          expectedOrganizationId: body.orgId,
        },
        async (assertAuthority) => {
          await assertAuthority();
          const result = await manager.startServerDeployment({ ...body, namespace: runtimeNamespace() });
          await assertAuthority();
          return result;
        },
      );
    })(),
  );
  app.post('/server-deployments/:deploymentId/reconfigure', async (request) =>
    manager.executeDeploymentProvisionEffect((request.params as any).deploymentId, async (assertAuthority) => {
      await assertAuthority();
      const result = await manager.reconfigureServerDeployment({
        ...serverReconfigureSchema.parse(request.body),
        deploymentId: (request.params as any).deploymentId,
        namespace: runtimeNamespace(),
      });
      await assertAuthority();
      return result;
    }),
  );
  app.post('/server-deployments/:deploymentId/suspend', async (request) =>
    manager.executeDeploymentProvisionEffect((request.params as any).deploymentId, async (assertAuthority) => {
      await assertAuthority();
      const result = await manager.suspendReservedVmDeployment({
        ...serverSuspendSchema.parse(request.body),
        deploymentId: (request.params as any).deploymentId,
        namespace: runtimeNamespace(),
      });
      await assertAuthority();
      return result;
    }),
  );
  app.post('/server-deployments/:deploymentId/decommission-storage', async (request) =>
    manager.executeDeploymentProvisionEffect((request.params as any).deploymentId, async (assertAuthority) => {
      await assertAuthority();
      const result = await manager.decommissionReservedVmStorage({
        ...serverStorageDecommissionSchema.parse(request.body),
        deploymentId: (request.params as any).deploymentId,
        namespace: runtimeNamespace(),
      });
      await assertAuthority();
      return result;
    }),
  );

  /*
   * Isolated server-deploy build (reproducible pipeline): revision in, built
   * docker-context artifact out, disposable gVisor pod in between. Synchronous —
   * returns { exitCode, output, timedOut, phase } once the pod terminates.
   */
  app.post('/app-builds/run', async (request) => {
    const body = appBuildSchema.parse(request.body);

    /*
     * D3 multi-zone: same placement resolution as workspaces/app pods — the
     * build pod mounts the store clone of a zone with live capacity and is
     * pinned there (plus the generation drift guard).
     */
    const nixPlacement = await manager.resolveNixStorePlacement(body.nixStorePvcName, undefined, body.nixGenerationRef);

    return manager.executeDeploymentProvisionEffect(
      {
        deploymentId: body.deploymentId,
        projectId: body.projectId,
        expectedOrganizationId: body.orgId,
      },
      (assertAuthority) =>
        runAppBuild(manager.k8s, { ...body, ...nixPlacement, namespace: runtimeNamespace() }, assertAuthority),
    );
  });
  app.get('/server-deployments/:deploymentId/status', async (request) =>
    manager.getServerDeploymentStatus(runtimeNamespace(), (request.params as any).deploymentId),
  );
  app.post('/server-deployments/:deploymentId/stop', async (request) =>
    manager.stopServerDeployment(runtimeNamespace(), (request.params as any).deploymentId),
  );

  /*
   * Scale-to-zero wake path: the preview-proxy calls this when a request hits a
   * deployment that is scaled to 0 (or whose pod is gone). Scales to 1, waits for
   * readiness, and returns it so the proxy can then forward without a 502. 404s a
   * genuinely-absent deployment so the proxy surfaces a clean error.
   */
  app.post('/server-deployments/:deploymentId/activate', async (request, reply) => {
    try {
      const deploymentId = (request.params as any).deploymentId;
      return await manager.executeDeploymentProvisionEffect(deploymentId, async (assertAuthority) => {
        await assertAuthority();
        const result = await manager.activateServerDeployment(runtimeNamespace(), deploymentId);
        await assertAuthority();
        return result;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'SERVER_DEPLOY_NOT_FOUND') {
        return reply
          .code(404)
          .send({ error: workspaceManagerMessage('serverDeploymentNotFound', 'en'), code: 'SERVER_DEPLOY_NOT_FOUND' });
      }

      if ((error as { code?: string })?.code === 'RESERVED_VM_SUSPENDED') {
        return reply.code(402).send({
          error: workspaceManagerMessage('reservedVmSuspended', 'en'),
          code: 'RESERVED_VM_SUSPENDED',
        });
      }

      if ((error as { code?: string })?.code === 'RESERVED_VM_ALWAYS_ON_INVARIANT') {
        return reply.code(503).send({
          error: workspaceManagerMessage('reservedVmAlwaysOnInvariant', 'en'),
          code: 'RESERVED_VM_ALWAYS_ON_INVARIANT',
        });
      }

      throw error;
    }
  });

  /*
   * Record live traffic (throttled) so the idle controller can measure
   * inactivity. The optional `requests` delta (accumulated by the proxy since
   * its last flush) feeds the cumulative request counter used for billing.
   */
  app.post('/server-deployments/:deploymentId/touch', async (request) => {
    const requests = Number((request.body as { requests?: number } | undefined)?.requests) || 0;
    await manager.touchServerDeployment(runtimeNamespace(), (request.params as any).deploymentId, requests);

    return { ok: true };
  });

  /*
   * Idle sweep: scale every server deployment idle past `idleMs` to 0. Triggered
   * on the same cadence as the workspace GC (the worker's scheduled tick), so it
   * needs no cron of its own.
   */
  app.post('/server-deployments/reap-idle', async (request) => {
    const idleMs = Number((request.body as { idleMs?: number } | undefined)?.idleMs) || SERVER_DEPLOY_IDLE_MS;
    const slept = await manager.reapIdleServerDeployments(runtimeNamespace(), idleMs);

    return { slept };
  });

  /*
   * Scheduled runs ("Scheduled" deployment type): one DISPOSABLE Pod per run.
   * Synchronous by design — the api's scheduler owns the run row and needs the
   * exit code + full logs back to close it out. The pod (and its secret) are
   * always deleted, including on timeout. Nothing durable is created, and this
   * shares no code with the server-deployment path above.
   */
  app.post('/scheduled-jobs/run', async (request) => {
    const input = scheduledJobSchema.parse(request.body);

    return manager.executeScheduledRunProvisionEffect(
      { runId: input.runId, projectId: input.projectId, expectedOrganizationId: input.orgId },
      (assertAuthority) => runScheduledJob(manager.k8s, { ...input, namespace: runtimeNamespace() }, assertAuthority),
    );
  });
  app.get('/workspaces/:workspaceId', async (request) => manager.store.get((request.params as any).workspaceId));

  /*
   * The project's runtime workspaces, most recently active first. The api's
   * scheduled-run executor resolves the REAL workspace pvcName here — deriving
   * it from legacy project fields produced volumes that never existed, leaving
   * the disposable run pod Pending forever (proven live 2026-07-15).
   */
  app.get('/projects/:projectId/runtime-workspaces', async (request) =>
    manager.store.listByProject((request.params as any).projectId),
  );
  app.get('/workspaces/:workspaceId/agent-token', async (request) => {
    const workspaceId = (request.params as any).workspaceId;

    /*
     * Minting a token means the api is about to act on the workspace for a user
     * — and the IDE's file/port watch pollers mint one every few seconds for the
     * whole session — so treat it as activity. Without this the inactivity GC
     * reaps live workspaces (blank preview until reload). Fire-and-forget and
     * throttled so it never adds latency to the token mint.
     */
    void manager.touch(workspaceId).catch(() => undefined);

    return { token: manager.issueAgentToken(workspaceId) };
  });

  /*
   * Explicit activity heartbeat for callers that keep a workspace open without
   * minting tokens; same throttled bump as the agent-token side effect.
   */
  app.post('/workspaces/:workspaceId/touch', async (request) => {
    const touched = await manager.touch((request.params as any).workspaceId);
    return { ok: true, lastActiveAt: touched?.lastActiveAt };
  });
  app.get('/workspaces/:workspaceId/logs', async (request) => {
    const logs = [];

    for await (const line of await manager.streamLogs(runtimeNamespace(), (request.params as any).workspaceId)) {
      logs.push(line);
    }

    return { logs };
  });
  app.post('/workspaces/:workspaceId/stop', async (request) =>
    manager.stopWorkspace(runtimeNamespace(), (request.params as any).workspaceId),
  );
  app.post('/workspaces/:workspaceId/restart', async (request) =>
    manager.restartWorkspace({
      ...startSchema.parse(request.body),
      workspaceId: (request.params as any).workspaceId,
      namespace: runtimeNamespace(),
    }),
  );
  app.delete('/workspaces/:workspaceId', async (request) =>
    manager.deleteWorkspace(runtimeNamespace(), (request.params as any).workspaceId),
  );
  app.get('/workspaces/:workspaceId/pvc-exists', async (request) => ({
    exists: await manager.pvcExists(runtimeNamespace(), (request.params as any).workspaceId),
  }));
  app.post('/workspaces/:workspaceId/freeze', async (request) => {
    const lease = accountPurgeLeaseSchema.parse(request.body);
    await manager.freezeWorkspace(runtimeNamespace(), (request.params as any).workspaceId, lease);
    return { frozen: true };
  });
  app.post('/workspaces/:workspaceId/purge', async (request) => {
    const body = accountPurgeWorkspaceCompletionSchema.parse(request.body);
    return manager.purgeWorkspace(
      runtimeNamespace(),
      (request.params as any).workspaceId,
      { planId: body.planId, ownerToken: body.ownerToken },
      body.volumeReceipt,
    );
  });
  app.post('/workspaces/:workspaceId/unfreeze', async (request) => {
    const lease = accountPurgeLeaseSchema.parse(request.body);
    return manager.unfreezeWorkspace((request.params as any).workspaceId, lease);
  });
  app.post('/projects/:projectId/permanent-delete/workspaces/purge', async (request) => {
    const lease = projectDeletionLeaseSchema.parse(request.body);
    const projectId = (request.params as { projectId: string }).projectId;
    if (lease.projectId !== projectId) {
      throw Object.assign(new Error(workspaceManagerMessage('requestFailed', 'en')), {
        code: 'WORKSPACE_PROJECT_DELETION_SCOPE_INVALID',
        statusCode: 409,
      });
    }
    return manager.purgeProjectWorkspaces(runtimeNamespace(), lease);
  });
  app.post('/projects/:projectId/permanent-delete/workspaces/verify', async (request) => {
    const lease = projectDeletionLeaseSchema.parse(request.body);
    const projectId = (request.params as { projectId: string }).projectId;
    if (lease.projectId !== projectId) {
      throw Object.assign(new Error(workspaceManagerMessage('requestFailed', 'en')), {
        code: 'WORKSPACE_PROJECT_DELETION_SCOPE_INVALID',
        statusCode: 409,
      });
    }
    return manager.verifyProjectWorkspacesAbsent(runtimeNamespace(), lease);
  });
  app.post('/account-purge/reconcile', async (request) => {
    const { take } = z.object({ take: z.number().int().min(1).max(500).default(500) }).parse(request.body ?? {});
    return manager.reconcileAccountPurgeFences(take);
  });

  /*
   * Live cluster-capacity snapshot for the admin Infrastructure view. The manager
   * is the only tier with in-cluster kubectl credentials, so it gathers node /
   * pod / metrics / autoscaler data here; the api proxies this and layers on
   * alert thresholds. Read-only.
   */
  app.get('/capacity', async () =>
    getClusterCapacity({
      nodePool: process.env.WORKSPACE_NODE_POOL ?? 'sandbox-gvisor',
      workspacesNamespace: runtimeNamespace(),
      orgLabelKey: 'vibecore.ai/org-id',
    }),
  );
  app.post('/workspaces/gc', async (request) => {
    const body = z
      .object({
        namespace: z.string().default('workspaces'),
        inactiveMs: z.number().positive().default(defaultIdleStopMs()),
        deleteMs: z.number().positive().default(defaultDeleteStoppedMs()),
      })
      .parse(request.body ?? {});

    /*
     * GC against the manager's own namespace (single source of truth), not a
     * caller-supplied one that could diverge and scan the wrong namespace.
     */
    await manager.garbageCollect(runtimeNamespace(), body.inactiveMs, body.deleteMs);

    /*
     * Same tick, second sweep: put idle server deployments to sleep (replicas→0).
     * Best-effort — a failure here must not fail the workspace GC response.
     */
    let serverDeploysSlept: string[] = [];

    try {
      serverDeploysSlept = await manager.reapIdleServerDeployments(runtimeNamespace(), SERVER_DEPLOY_IDLE_MS);
    } catch (error) {
      request.log.error({ err: error }, 'server-deploy idle sweep failed');
    }

    return { ok: true, serverDeploysSlept };
  });
  app.get('/internal/workspaces/:workspaceId/agent', async (request, reply) => {
    requirePreviewProxyAuth(request as any);

    const workspaceId = (request.params as any).workspaceId as string;
    const workspace = await manager.store.get(workspaceId);

    /*
     * A STOPPED workspace has had its Pod garbage-collected while the row
     * remains; returning a baseUrl pointed preview-proxy at a Service with no
     * ready endpoints, producing an endless ENOTFOUND/connection-refused 502
     * loop instead of a clean 404. 404 signals "agent not running" so the
     * reopen flow re-provisions via POST /workspaces/start. (STARTING/PENDING
     * are left served — the pod is legitimately coming up and a brief retry is
     * expected; only DELETED/FAILED/STOPPED have no agent to reach.)
     */
    if (
      !workspace ||
      workspace.status === 'DELETED' ||
      workspace.status === 'FAILED' ||
      workspace.status === 'STOPPING' ||
      workspace.status === 'STOPPED'
    ) {
      return reply
        .code(404)
        .send({ error: workspaceManagerMessage('workspaceAgentNotFound', 'en'), code: 'WORKSPACE_AGENT_NOT_FOUND' });
    }

    /*
     * Per-tenant authorization for the preview hot path. preview-proxy forwards
     * the requester's orgId (from the verified vc_preview cookie) as ?orgId=;
     * reject when it does not own this workspace so one tenant can never resolve
     * another tenant's agent URL/token by guessing a workspaceId. Gated by
     * WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT so it stays inert until the
     * coordinated rollout flips both services on together — until then a missing
     * orgId param (the current preview-proxy build) preserves today's behaviour.
     */
    const requesterOrgId = (request.query as any)?.orgId as string | undefined;

    if (process.env.WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT === 'true') {
      if (!requesterOrgId || requesterOrgId !== workspace.orgId) {
        return reply
          .code(403)
          .send({ error: workspaceManagerMessage('previewAccessDenied', 'en'), code: 'WORKSPACE_TENANT_FORBIDDEN' });
      }
    } else if (requesterOrgId && requesterOrgId !== workspace.orgId) {
      /*
       * Enforcement off but a mismatching orgId was supplied — still deny; this
       * can only happen once preview-proxy is sending the cookie-derived org.
       */
      return reply
        .code(403)
        .send({ error: workspaceManagerMessage('previewAccessDenied', 'en'), code: 'WORKSPACE_TENANT_FORBIDDEN' });
    }

    /*
     * The standalone preview-proxy resolves the agent through this route on
     * every host-based preview request. A user actively testing their running
     * app via the preview URL (no IDE tab open to run the watch pollers) would
     * otherwise generate zero activity, so the inactivity GC stops the pod
     * mid-use. Treat a successful agent resolve as activity — throttled and
     * fire-and-forget so it never adds latency to the preview hot path.
     */
    void manager.touch(workspaceId).catch(() => undefined);

    return {
      baseUrl: agentBaseUrl(workspaceId),
      token: manager.issueAgentToken(workspaceId, 5 * 60_000),
    };
  });

  /*
   * ===== Database point-in-time rollback (Phase 2) k8s bridge =====
   * The api has no cluster RBAC, so it applies CloudNativePG CRs for managed
   * project databases through these routes (guarded by the global manager-secret
   * hook above). TIGHTLY SCOPED: only CNPG kinds in the dedicated
   * `project-databases` namespace are allowed — this is an arbitrary-CR-apply
   * surface otherwise. Inert in practice until DB_ROLLBACK_ENABLED on the api +
   * the operator is installed (a missing CRD just makes apply fail).
   */
  const DB_ROLLBACK_NAMESPACE = 'project-databases';
  /*
   * Isolated tier applies Cluster + ScheduledBackup (+ on-demand Backup). Shared
   * tier applies only the project Database CR against the Helm-owned shared
   * cluster and Pooler. Pooler mutation is intentionally absent from this bridge
   * so a project request can never alter shared connection infrastructure.
   */
  const DB_ROLLBACK_KINDS = new Set(['Cluster', 'ScheduledBackup', 'Backup', 'Database']);
  const DB_ERASURE_KINDS = [
    'ScheduledBackup',
    'Backup',
    'Database',
    'Cluster',
    'Deployment',
    'Job',
    'Pod',
    'Service',
    'Endpoints',
    'EndpointSlice',
    'Secret',
    'ConfigMap',
    'ServiceAccount',
    'PodDisruptionBudget',
    'PersistentVolumeClaim',
  ] as const;
  type DatabaseErasureKind = (typeof DB_ERASURE_KINDS)[number];

  const databaseErasureInventorySchema = projectDeletionLeaseSchema.extend({
    knownClusterNames: z.array(z.string().min(1).max(253)).max(512),
    knownResourceNames: z
      .record(z.array(z.string().min(1).max(253)).max(10_000))
      .optional()
      .default({}),
  });
  const databaseErasureResourceSchema = z.object({
    kind: z.enum(DB_ERASURE_KINDS),
    namespace: z.literal(DB_ROLLBACK_NAMESPACE),
    name: z.string().min(1).max(253),
    uid: z.string().min(1).max(255),
    resourceVersion: z.string().min(1).max(255),
    ownership: z.object({
      projectId: z.string().min(1).max(200),
      source: z.enum(['project-label', 'cnpg-cluster-label', 'owner-reference', 'service-label', 'deterministic-plan']),
      clusterName: z.string().min(1).max(253).optional(),
    }),
  });
  const deterministicDatabaseResourceNameAllowed = (
    kind: DatabaseErasureKind,
    name: string,
    projectId: string,
  ): boolean => {
    const developmentCluster = `db-${projectId}`.toLowerCase().slice(0, 53);
    const productionCluster = `db-${projectId}-prod`.toLowerCase().slice(0, 53);
    const clusters = [developmentCluster, productionCluster];

    if (kind === 'Cluster') {
      return clusters.includes(name) || name.startsWith(`${developmentCluster}-r-`);
    }
    if (kind === 'Database') return clusters.includes(name);
    if (kind === 'ScheduledBackup') return clusters.some((cluster) => name === `${cluster}-daily`);
    if (kind === 'Backup') return clusters.some((cluster) => name.startsWith(`${cluster}-`));
    return false;
  };

  const cnpgCsiApplySchema = z.object({
    manifest: z
      .object({
        apiVersion: z.string(),
        kind: z.literal('Cluster'),
        metadata: z
          .object({
            name: z
              .string()
              .min(1)
              .max(63)
              .regex(/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u),
            namespace: z.literal(DB_ROLLBACK_NAMESPACE),
            labels: z.record(z.string()),
          })
          .passthrough(),
        spec: z
          .object({
            instances: z.number().int().min(1).max(32).default(1),
          })
          .passthrough(),
      })
      .passthrough(),
    projectId: z.string().min(1).max(200),
    expectedOrganizationId: z.string().min(1).max(200),
    action: z.enum(['CNPG_PROVISION', 'CNPG_RESTORE', 'CNPG_REMIX']),
    resourceId: z.string().min(1).max(512),
    targets: z
      .array(
        z.object({
          namespace: z.literal(DB_ROLLBACK_NAMESPACE),
          pvcName: z
            .string()
            .min(1)
            .max(63)
            .regex(/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u),
        }),
      )
      .min(1)
      .max(32),
  });

  const rejectCnpgCsiApply = (reply: any, code: string) =>
    reply.code(403).send({
      error: workspaceManagerMessage('databaseResourceForbidden', 'en'),
      code,
    });

  const dbResourceGuard = (kind: string, namespace: string, reply: any): boolean => {
    if (namespace !== DB_ROLLBACK_NAMESPACE || !DB_ROLLBACK_KINDS.has(kind)) {
      reply
        .code(403)
        .send({ error: workspaceManagerMessage('databaseResourceForbidden', 'en'), code: 'DB_RESOURCE_FORBIDDEN' });

      return false;
    }

    return true;
  };

  app.post('/databases/apply', async (request, reply) => {
    const { manifest } = z
      .object({
        manifest: z
          .object({
            apiVersion: z.string(),
            kind: z.string(),
            metadata: z
              .object({
                name: z.string(),
                namespace: z.string().optional(),
                labels: z.record(z.string()).optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      })
      .parse(request.body ?? {});

    const namespace = manifest.metadata.namespace ?? '';

    if (!dbResourceGuard(manifest.kind, namespace, reply)) {
      return;
    }

    if (manifest.apiVersion !== 'postgresql.cnpg.io/v1') {
      return reply.code(403).send({
        error: workspaceManagerMessage('databaseApiVersionForbidden', 'en'),
        code: 'DB_RESOURCE_FORBIDDEN',
      });
    }

    const projectId = manifest.metadata.labels?.['vibecore.ai/project-id'];
    const expectedOrganizationId = manifest.metadata.labels?.['vibecore.ai/org-id'];
    if (!projectId || !expectedOrganizationId) {
      return reply.code(403).send({
        error: workspaceManagerMessage('databaseResourceForbidden', 'en'),
        code: 'DB_PROJECT_AUTHORITY_REQUIRED',
      });
    }

    await manager.executeProjectProvisionEffect({ projectId, expectedOrganizationId }, async (assertAuthority) => {
      await assertAuthority();
      await manager.k8s.apply(manifest as any);
      await assertAuthority();
    });

    return { applied: true };
  });

  /*
   * CSI-producing CNPG applies must cross the durable project effect barrier.
   * The caller declares the PVC names, but the manager derives the authoritative
   * set from the Cluster name/instance count and rejects any disagreement before
   * Kubernetes sees the manifest. The restricted manifest contract intentionally
   * excludes CNPG walStorage/tablespaces: both can create additional PVCs whose
   * identities are not represented by the declared `<cluster>-N` targets.
   */
  app.post('/databases/apply-csi', async (request, reply) => {
    const body = cnpgCsiApplySchema.parse(request.body ?? {});
    const { manifest } = body;

    if (!/^postgresql\.cnpg\.io\//u.test(manifest.apiVersion)) {
      return rejectCnpgCsiApply(reply, 'DB_CSI_API_VERSION_FORBIDDEN');
    }
    if (
      manifest.metadata.labels['vibecore.ai/project-id'] !== body.projectId ||
      manifest.metadata.labels['vibecore.ai/org-id'] !== body.expectedOrganizationId
    ) {
      return rejectCnpgCsiApply(reply, 'DB_CSI_TENANT_LABELS_FORBIDDEN');
    }
    if ('walStorage' in manifest.spec || 'tablespaces' in manifest.spec) {
      return rejectCnpgCsiApply(reply, 'DB_CSI_UNDECLARED_VOLUME_SHAPE');
    }

    const expectedResourceId = (() => {
      switch (body.action) {
        case 'CNPG_PROVISION': {
          const environment = body.resourceId.slice(`cnpg-provision:${body.projectId}:`.length);
          return environment === 'development' || environment === 'production'
            ? `cnpg-provision:${body.projectId}:${environment}`
            : undefined;
        }
        case 'CNPG_RESTORE': {
          const restoreId = manifest.metadata.labels['vibecore.ai/restore-id'];
          return restoreId ? `cnpg-restore:${body.projectId}:${restoreId}` : undefined;
        }
        case 'CNPG_REMIX':
          return manifest.metadata.labels['vibecore.ai/remix-source-project-id']
            ? `cnpg-remix:${body.projectId}`
            : undefined;
      }
    })();
    if (!expectedResourceId || body.resourceId !== expectedResourceId) {
      return rejectCnpgCsiApply(reply, 'DB_CSI_RESOURCE_ID_FORBIDDEN');
    }

    const targets = Array.from({ length: manifest.spec.instances }, (_, index) => ({
      namespace: DB_ROLLBACK_NAMESPACE,
      pvcName: `${manifest.metadata.name}-${index + 1}`,
    }));
    const suppliedTargetKeys = new Set(body.targets.map((target) => `${target.namespace}\n${target.pvcName}`));
    if (
      suppliedTargetKeys.size !== targets.length ||
      targets.some((target) => !suppliedTargetKeys.has(`${target.namespace}\n${target.pvcName}`))
    ) {
      return rejectCnpgCsiApply(reply, 'DB_CSI_TARGETS_FORBIDDEN');
    }

    await manager.executeProjectCsiProvisionEffect(
      {
        projectId: body.projectId,
        expectedOrganizationId: body.expectedOrganizationId,
        action: body.action,
        resourceId: body.resourceId,
        targets,
      },
      async (assertAuthority) => {
        await assertAuthority();
        await manager.k8s.apply(manifest as any);
        await assertAuthority();
      },
    );

    return { applied: true, csiEvidencePersisted: true };
  });

  app.get('/databases/resource', async (request, reply) => {
    const { kind, namespace, name } = z
      .object({ kind: z.string(), namespace: z.string(), name: z.string() })
      .parse(request.query ?? {});

    if (!dbResourceGuard(kind, namespace, reply)) {
      return;
    }

    const resource = await manager.k8s.get(kind, namespace, name);

    if (!resource) {
      return reply
        .code(404)
        .send({ error: workspaceManagerMessage('databaseResourceNotFound', 'en'), code: 'DB_RESOURCE_NOT_FOUND' });
    }

    return resource;
  });

  /*
   * Read a project-database connection Secret (decoded). Tightly scoped: only the
   * project-databases namespace and only CNPG/vibecore connection secrets
   * (`db-*-app` / `db-*-conn`) — never arbitrary secrets. The api uses this to fetch
   * the `uri` (DATABASE_URL) once a cluster is healthy.
   */
  app.get('/databases/secret', async (request, reply) => {
    const { namespace, name } = z.object({ namespace: z.string(), name: z.string() }).parse(request.query ?? {});

    /*
     * Per-project CNPG connection secrets (`db-*-app`/`db-*-conn`) plus the
     * shared free-tier cluster's admin secret (`shared-pg-N-app`), which the api
     * reads to provision shared tenants. Never arbitrary secrets.
     */
    if (namespace !== DB_ROLLBACK_NAMESPACE || !/^(db-[a-z0-9-]+|shared-pg-[0-9]+)-(app|conn)$/.test(name)) {
      return reply
        .code(403)
        .send({ error: workspaceManagerMessage('databaseSecretForbidden', 'en'), code: 'DB_SECRET_FORBIDDEN' });
    }

    const resource = (await manager.k8s.get('Secret', namespace, name)) as
      | { data?: Record<string, string> }
      | undefined;

    if (!resource?.data) {
      return reply
        .code(404)
        .send({ error: workspaceManagerMessage('databaseSecretNotFound', 'en'), code: 'DB_SECRET_NOT_FOUND' });
    }

    const data = Object.fromEntries(
      Object.entries(resource.data).map(([key, value]) => [key, Buffer.from(value, 'base64').toString('utf8')]),
    );

    return { data };
  });

  app.delete('/databases/resource', async (request, reply) => {
    const { kind, namespace, name } = z
      .object({ kind: z.string(), namespace: z.string(), name: z.string() })
      .parse(request.query ?? {});

    if (!dbResourceGuard(kind, namespace, reply)) {
      return;
    }

    await manager.k8s.delete(kind, namespace, name);

    return { deleted: true };
  });

  const inventoryProjectDatabaseResources = async (
    lease: z.infer<typeof projectDeletionLeaseSchema>,
    knownClusterNames: readonly string[],
    knownResourceNames: Readonly<Record<string, readonly string[]>>,
  ) => {
    await manager.assertProjectDeletionLease(lease, ['EFFECT_STARTED', 'VERIFYING']);
    if (knownClusterNames.some((name) => !deterministicDatabaseResourceNameAllowed('Cluster', name, lease.projectId))) {
      throw Object.assign(new Error('Database erasure cluster escaped the project namespace'), {
        code: 'PROJECT_DATABASE_RESOURCE_NAME_INVALID',
        statusCode: 409,
      });
    }
    const clusters = new Set(knownClusterNames);
    const resources = new Map<
      string,
      {
        kind: DatabaseErasureKind;
        namespace: typeof DB_ROLLBACK_NAMESPACE;
        name: string;
        uid: string;
        resourceVersion: string;
        ownership: {
          projectId: string;
          source: 'project-label' | 'cnpg-cluster-label' | 'owner-reference' | 'service-label' | 'deterministic-plan';
          clusterName?: string;
        };
      }
    >();
    const add = (
      kind: DatabaseErasureKind,
      object: Awaited<ReturnType<typeof manager.k8s.get>>,
      source: 'project-label' | 'cnpg-cluster-label' | 'owner-reference' | 'service-label' | 'deterministic-plan',
      clusterName?: string,
    ) => {
      if (!object) return;
      const name = object.metadata.name;
      const uid = object.metadata.uid;
      const resourceVersion = object.metadata.resourceVersion;
      const resourceProjectId = object.metadata.labels?.['vibecore.ai/project-id'];
      const resourceOrganizationId = object.metadata.labels?.['vibecore.ai/org-id'];
      if (!name || !uid || !resourceVersion) {
        throw Object.assign(new Error('Database erasure resource identity is incomplete'), {
          code: 'PROJECT_DATABASE_RESOURCE_IDENTITY_INCOMPLETE',
          statusCode: 503,
        });
      }
      if (
        (resourceProjectId !== undefined && resourceProjectId !== lease.projectId) ||
        (resourceOrganizationId !== undefined && resourceOrganizationId !== lease.expectedOrganizationId) ||
        (source === 'deterministic-plan' && resourceProjectId !== lease.projectId) ||
        (source === 'cnpg-cluster-label' && object.metadata.labels?.['cnpg.io/cluster'] !== clusterName)
      ) {
        throw Object.assign(new Error('Database erasure resource tenant labels changed'), {
          code: 'PROJECT_DATABASE_RESOURCE_TENANT_MISMATCH',
          statusCode: 409,
        });
      }
      const identity = `${kind}:${name}`;
      const previous = resources.get(identity);
      if (previous && (previous.uid !== uid || previous.resourceVersion !== resourceVersion)) {
        throw Object.assign(new Error('Database erasure inventory changed during capture'), {
          code: 'PROJECT_DATABASE_RESOURCE_INVENTORY_CHANGED',
          statusCode: 409,
        });
      }
      resources.set(identity, {
        kind,
        namespace: DB_ROLLBACK_NAMESPACE,
        name,
        uid,
        resourceVersion,
        ownership: { projectId: lease.projectId, source, ...(clusterName ? { clusterName } : {}) },
      });
      if (kind === 'Cluster') clusters.add(name);
    };

    for (const kind of DB_ERASURE_KINDS) {
      const direct = await manager.k8s.listByLabel(
        kind,
        DB_ROLLBACK_NAMESPACE,
        `vibecore.ai/project-id=${lease.projectId}`,
      );
      for (const object of direct) {
        if (object.metadata.labels?.['vibecore.ai/project-id'] !== lease.projectId) {
          throw Object.assign(new Error('Database erasure label selector returned a foreign resource'), {
            code: 'PROJECT_DATABASE_RESOURCE_TENANT_MISMATCH',
            statusCode: 409,
          });
        }
        add(kind, object, 'project-label', object.metadata.labels?.['cnpg.io/cluster']);
      }
    }

    for (const [kind, names] of Object.entries(knownResourceNames)) {
      if (
        !DB_ERASURE_KINDS.includes(kind as DatabaseErasureKind) ||
        !['Cluster', 'Database', 'ScheduledBackup', 'Backup'].includes(kind)
      ) {
        throw Object.assign(new Error('Database erasure kind is not allowed'), {
          code: 'PROJECT_DATABASE_RESOURCE_KIND_INVALID',
          statusCode: 400,
        });
      }
      for (const name of names) {
        if (!deterministicDatabaseResourceNameAllowed(kind as DatabaseErasureKind, name, lease.projectId)) {
          throw Object.assign(new Error('Database erasure deterministic target escaped the project namespace'), {
            code: 'PROJECT_DATABASE_RESOURCE_NAME_INVALID',
            statusCode: 409,
          });
        }
        add(
          kind as DatabaseErasureKind,
          await manager.k8s.get(kind, DB_ROLLBACK_NAMESPACE, name),
          'deterministic-plan',
        );
      }
    }

    for (const clusterName of [...clusters]) {
      for (const kind of DB_ERASURE_KINDS) {
        const descendants = await manager.k8s.listByLabel(
          kind,
          DB_ROLLBACK_NAMESPACE,
          `cnpg.io/cluster=${clusterName}`,
        );
        for (const object of descendants) add(kind, object, 'cnpg-cluster-label', clusterName);
      }
    }

    const serviceNames = [...resources.values()].filter(({ kind }) => kind === 'Service').map(({ name }) => name);
    for (const serviceName of serviceNames) {
      for (const object of await manager.k8s.listByLabel(
        'EndpointSlice',
        DB_ROLLBACK_NAMESPACE,
        `kubernetes.io/service-name=${serviceName}`,
      )) {
        add('EndpointSlice', object, 'service-label');
      }
      add('Endpoints', await manager.k8s.get('Endpoints', DB_ROLLBACK_NAMESPACE, serviceName), 'service-label');
    }
    await manager.assertProjectDeletionLease(lease, ['EFFECT_STARTED', 'VERIFYING']);
    return [...resources.values()].sort(
      (left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name),
    );
  };

  app.post('/projects/:projectId/permanent-delete/databases/inventory', async (request) => {
    const routeProjectId = z.object({ projectId: z.string().min(1).max(200) }).parse(request.params).projectId;
    const body = databaseErasureInventorySchema.parse(request.body ?? {});
    if (body.projectId !== routeProjectId) {
      throw Object.assign(new Error('Database erasure project scope changed'), {
        code: 'PROJECT_DATABASE_ERASURE_SCOPE_MISMATCH',
        statusCode: 409,
      });
    }
    return {
      resources: await inventoryProjectDatabaseResources(body, body.knownClusterNames, body.knownResourceNames),
    };
  });

  app.post('/projects/:projectId/permanent-delete/databases/delete', async (request) => {
    const routeProjectId = z.object({ projectId: z.string().min(1).max(200) }).parse(request.params).projectId;
    const body = databaseErasureInventorySchema
      .extend({ resource: databaseErasureResourceSchema })
      .parse(request.body ?? {});
    if (body.projectId !== routeProjectId || body.resource.ownership.projectId !== routeProjectId) {
      throw Object.assign(new Error('Database erasure project scope changed'), {
        code: 'PROJECT_DATABASE_ERASURE_SCOPE_MISMATCH',
        statusCode: 409,
      });
    }
    await manager.assertProjectDeletionLease(body, ['EFFECT_STARTED']);
    const inventory = await inventoryProjectDatabaseResources(body, body.knownClusterNames, body.knownResourceNames);
    const current = inventory.find(({ kind, name }) => kind === body.resource.kind && name === body.resource.name);
    if (!current) return { outcome: 'absent' as const };
    if (current.uid !== body.resource.uid || current.resourceVersion !== body.resource.resourceVersion) {
      throw Object.assign(new Error('Database erasure resource precondition changed'), {
        code: 'PROJECT_DATABASE_RESOURCE_PRECONDITION_CHANGED',
        statusCode: 409,
      });
    }
    if (!manager.k8s.deleteFenced) {
      throw Object.assign(new Error('Fenced Kubernetes delete is unavailable'), {
        code: 'PROJECT_DATABASE_FENCED_DELETE_UNAVAILABLE',
        statusCode: 503,
      });
    }
    await manager.assertProjectDeletionLease(body, ['EFFECT_STARTED']);
    await manager.k8s.deleteFenced(
      current.kind,
      DB_ROLLBACK_NAMESPACE,
      current.name,
      current.resourceVersion,
      current.uid,
    );
    await manager.assertProjectDeletionLease(body, ['EFFECT_STARTED']);
    return { outcome: 'deleted' as const };
  });

  return app;
}
