import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, cp, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { appPublicCopy, appPublicEnglish } from './app-public-copy.js';
import { DEPLOYMENT_ACCESS_MODES } from './deployment-access.js';
import { hashSnapshotEntries, type SnapshotEntry } from './release-manifest.js';
import { withStaticDeploymentStorageLock, withStaticDeploymentStorageLocks } from './static-deployment-storage-lock.js';
import type { DeploymentRecord, ProjectRecord, ProviderDeployHookRecoveryObservation } from './store.js';
import type { TransactionalLocale } from './transactional-i18n.js';

export const deploymentProviders = [
  'static',
  'server',
  'vercel',
  'netlify',
  'github-pages',
  'cloudflare-pages',
  'google-cloud-run',
  'docker',
] as const;

function configuredRegions(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((region) => region.trim().toLowerCase())
        .filter((region) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(region)),
    ),
  ].sort();
}

/** Regions the concrete provider adapter is configured to accept. */
export function providerSupportedPublishRegions(
  provider: (typeof deploymentProviders)[number],
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string[] {
  if (provider === 'google-cloud-run') {
    return configuredRegions(env.CLOUD_RUN_SUPPORTED_REGIONS ?? env.CLOUD_RUN_REGION);
  }
  if (provider === 'docker') {
    return configuredRegions(env.DOCKER_SUPPORTED_REGIONS ?? env.DOCKER_REGION);
  }
  if (provider === 'server') {
    // The manager currently has no verified region placement primitive. Keep
    // the only truthful choice until node affinity + status proof are wired.
    return ['platform-default'];
  }
  // Static and managed edge providers deploy to their real global edge surface.
  return ['global'];
}

/**
 * Only these two providers are served through a platform-controlled edge that
 * can compose a non-removable badge. Hook providers remain operator-required
 * until their adapters can attest the pinned publication policy. Egress
 * telemetry is a separate admission boundary and is not claimed here.
 */
export function providerHasAuthoritativePlanEdge(
  provider: (typeof deploymentProviders)[number],
): provider is 'server' | 'static' {
  return provider === 'server' || provider === 'static';
}

/*
 * The subset of providers for which triggerProviderRollback() actually performs
 * an async follow-up call (so the rollback row must start QUEUED and transition
 * later). Every OTHER provider — static (in-process), github-pages,
 * google-cloud-run, docker — has no follow-up, so its rollback must be created
 * READY immediately; otherwise it sits QUEUED forever (the monotonic status
 * guard never flips it) and the in-flight lock blocks all new deploys for ~40min.
 */
export const providerRollbackProviders = ['vercel', 'netlify', 'cloudflare-pages'] as const;

const deploymentSecretKeyPattern = /(SECRET|TOKEN|PASSWORD|PRIVATE[_-]?KEY|API[_-]?KEY|CREDENTIAL|WEBHOOK)/i;

const dangerousBuildPatterns = [
  /\bdocker\s+run\b/i,
  /\bdocker\s+build\b/i,
  /\/var\/run\/docker\.sock/i,
  /\b--privileged\b/i,
  /\bhostNetwork\b/i,
  /\bhostPID\b/i,
  /\bchmod\s+777\s+\//i,
];

export const createDeploymentSchema = z.object({
  provider: z.enum(deploymentProviders).default('static'),
  environment: z.enum(['preview', 'staging', 'production']).default('preview'),
  workspaceId: z.string().trim().min(1).max(128).optional(),
  buildCommand: z.string().trim().min(1).max(220).default('npm run build'),
  outputDirectory: z.string().trim().min(1).max(160).default('dist'),
  framework: z.string().trim().min(1).max(80).optional(),
  branch: z.string().trim().min(1).max(120).optional(),
  commitSha: z.string().trim().min(6).max(80).optional(),
  customDomain: z.string().trim().min(3).max(255).optional(),
  previewDeployment: z.boolean().default(true),
  timeoutSeconds: z.number().int().min(30).max(1800).default(600),
  artifactSizeLimitMb: z.number().int().min(1).max(2048).default(250),
  envVars: z.record(z.string()).default({}),
  injectSecrets: z.array(z.string().min(1).max(120)).default([]),
  accessMode: z.enum(DEPLOYMENT_ACCESS_MODES).optional(),
  accessPassword: z.string().min(10).max(256).optional(),
  publishRegion: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
    .optional(),
  removeBrandingBadge: z.boolean().default(false),

  /*
   * Machine size for server deploys (rate-card key, e.g. 'dedicated-1').
   * Validated against the ACTIVE rate card + plan ceiling + scheduling
   * capacity in the route handler — the schema only bounds the shape.
   */
  machineSize: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9.-]+$/)
    .optional(),
  runtimeKind: z.enum(['autoscale', 'reserved-vm']).default('autoscale'),
  reservedVmTier: z.enum(['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4']).optional(),
  reservedVmConfirmation: z
    .object({
      accepted: z.literal(true),
      termsVersion: z.string().trim().min(1).max(80),
      monthlyPriceCents: z.number().int().positive(),
    })
    .optional(),
  githubIntegration: z
    .object({
      repositoryUrl: z.string().url().optional(),
      branch: z.string().trim().min(1).max(120).optional(),
    })
    .optional(),
});

export type CreateDeploymentRequest = z.infer<typeof createDeploymentSchema>;

export function redactDeploymentValue(key: string, value: unknown) {
  const text = String(value ?? '');

  if (deploymentSecretKeyPattern.test(key) || deploymentSecretKeyPattern.test(text)) {
    return '[REDACTED]';
  }

  return text;
}

export function sanitizeDeploymentEnvVars(envVars: Record<string, string> = {}): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(envVars)) {
    output[key] = redactDeploymentValue(key, value);
  }

  return output;
}

export function redactDeploymentLog(message: string, envVars: Record<string, string> = {}) {
  let output = message;

  for (const [key, value] of Object.entries(envVars)) {
    if (!value) {
      continue;
    }

    const redacted = redactDeploymentValue(key, value);

    if (redacted === '[REDACTED]') {
      output = output.split(value).join('[REDACTED]');
    }
  }

  return output.replace(/(sk|ghp|glpat|xox[baprs]|ya29|AIza)[\.A-Za-z0-9_\-]{12,}/g, '[REDACTED]');
}

export function sanitizeDeploymentPath(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');

  if (!normalized || normalized.includes('..') || normalized.startsWith('~')) {
    throw Object.assign(new Error(appPublicEnglish('INVALID_DEPLOYMENT_PATH')), {
      statusCode: 400,
      code: 'INVALID_DEPLOYMENT_PATH',
    });
  }

  return normalized;
}

const providerEnvRequirement: Record<(typeof deploymentProviders)[number], readonly string[]> = {
  static: [],

  // A server deploy runs the app as an in-cluster Deployment via workspace-manager.
  server: ['WORKSPACE_MANAGER_URL', 'WORKSPACE_MANAGER_SHARED_SECRET'],
  vercel: ['VERCEL_DEPLOY_HOOK_URL'],
  netlify: ['NETLIFY_BUILD_HOOK_URL'],
  'github-pages': ['GITHUB_DEPLOY_TOKEN', 'GITHUB_PAGES_REPO', 'GITHUB_PAGES_WORKFLOW'],
  'cloudflare-pages': ['CLOUDFLARE_DEPLOY_HOOK_URL'],
  'google-cloud-run': ['CLOUD_RUN_BUILD_TRIGGER_URL', 'GCP_OAUTH_TOKEN'],
  docker: ['DOCKER_BUILD_TRIGGER_URL', 'GCP_OAUTH_TOKEN', 'DOCKER_REGISTRY_URL'],
};

export function assertDeploymentProviderConfigured(
  provider: (typeof deploymentProviders)[number],
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const required = providerEnvRequirement[provider] ?? [];
  const missing = required.filter((key) => !env[key]);

  if (missing.length === 0) {
    return;
  }

  throw Object.assign(new Error(`Deployment provider "${provider}" is not configured for production use`), {
    statusCode: 503,
    code: 'DEPLOYMENT_PROVIDER_NOT_CONFIGURED',
    details: { provider, missingEnv: missing },
  });
}

const providerDisplayName: Record<(typeof deploymentProviders)[number], string> = {
  static: 'Static hosting',
  server: 'Server (Autoscale)',
  vercel: 'Vercel',
  netlify: 'Netlify',
  'github-pages': 'GitHub Pages',
  'cloudflare-pages': 'Cloudflare Pages',
  'google-cloud-run': 'Google Cloud Run',
  docker: 'Docker',
};

function deploymentProviderDisplayName(
  provider: (typeof deploymentProviders)[number],
  locale: TransactionalLocale,
): string {
  if (provider === 'static') {
    return appPublicCopy('DEPLOY_PROVIDER_STATIC', locale);
  }

  if (provider === 'server') {
    return appPublicCopy('DEPLOY_PROVIDER_SERVER', locale);
  }

  return providerDisplayName[provider];
}

/**
 * Returns a client-facing error when a non-static provider has no deploy hook /
 * credentials configured, so the API can reject the request with an honest 400
 * instead of synthesizing a fake `*.vibecore.local` URL and marking the
 * deployment READY. The static provider always builds in-process, so it never
 * requires external configuration and returns `null` here.
 *
 * Unlike {@link assertDeploymentProviderConfigured} (a production-only guard
 * that throws 503), this check applies in every environment — a deploy that
 * cannot actually run should never look like it succeeded, dev or prod.
 */
export function deployProviderConfigError(
  provider: (typeof deploymentProviders)[number],
  env: NodeJS.ProcessEnv = process.env,
  locale: TransactionalLocale = 'en',
): { error: string; message: string } | null {
  if (provider === 'static') {
    return null;
  }

  const required = providerEnvRequirement[provider] ?? [];
  const missing = required.filter((key) => !env[key]);

  if (missing.length === 0) {
    return null;
  }

  return {
    error: 'PROVIDER_NOT_CONFIGURED',
    message: appPublicCopy('DEPLOY_PROVIDER_CONFIG_REQUIRED', locale, {
      provider: deploymentProviderDisplayName(provider, locale),
      missing: missing.join(', '),
    }),
  };
}

export function assertDeploymentRequestAllowed(
  input: CreateDeploymentRequest,
  planKey: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (input.provider === 'docker' && planKey !== 'enterprise') {
    throw Object.assign(new Error(appPublicEnglish('ENTERPRISE_DEPLOYMENT_REQUIRED')), {
      statusCode: 403,
      code: 'ENTERPRISE_DEPLOYMENT_REQUIRED',
    });
  }

  if (dangerousBuildPatterns.some((pattern) => pattern.test(input.buildCommand))) {
    throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_COMMAND_BLOCKED')), {
      statusCode: 400,
      code: 'DEPLOYMENT_COMMAND_BLOCKED',
    });
  }

  assertDeploymentProviderConfigured(input.provider, env);

  sanitizeDeploymentPath(input.outputDirectory);
}

export interface ProviderHookResult {
  url?: string;
  buildId?: string;
  status: 'queued' | 'started' | 'failed';
  log: string;
  outcome?: 'accepted' | 'rejected' | 'ambiguous';
  httpStatus?: number;
  errorCode?: string;
  echoedOperationTag?: string;
}

interface HookSpec {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ProviderDeployHookTargetSnapshot {
  targetHash: string;
  target: Record<string, string>;
}

function targetUrlHash(value: string | undefined): string {
  return value ? `sha256:${createHash('sha256').update(value).digest('hex')}` : 'unconfigured';
}

function cloudBuildTriggerTarget(value: string | undefined): Record<string, string> {
  if (!value) return { origin: 'unconfigured', projectId: 'unconfigured', location: 'unconfigured', triggerId: 'unconfigured' };
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/triggers\/([^/:]+):run$/u);
    if (!match) {
      return { origin: 'unconfigured', projectId: 'unconfigured', location: 'unconfigured', triggerId: 'unconfigured' };
    }
    return {
      origin: parsed.origin,
      projectId: decodeURIComponent(match[1]!),
      location: decodeURIComponent(match[2]!),
      triggerId: decodeURIComponent(match[3]!),
    };
  } catch {
    return { origin: 'unconfigured', projectId: 'unconfigured', location: 'unconfigured', triggerId: 'unconfigured' };
  }
}

/** Canonical non-secret provider target captured before PREPARED. */
export function providerDeployHookTargetSnapshot(
  provider: (typeof deploymentProviders)[number],
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ProviderDeployHookTargetSnapshot {
  const target = (() => {
    if (provider === 'vercel') {
      return {
        hookUrlHash: targetUrlHash(env.VERCEL_DEPLOY_HOOK_URL),
        projectId: env.VERCEL_PROJECT_ID ?? 'unconfigured',
        teamId: env.VERCEL_TEAM_ID ?? 'personal',
      };
    }
    if (provider === 'netlify') {
      return {
        hookUrlHash: targetUrlHash(env.NETLIFY_BUILD_HOOK_URL),
        siteId: env.NETLIFY_SITE_ID ?? 'unconfigured',
      };
    }
    if (provider === 'cloudflare-pages') {
      return {
        hookUrlHash: targetUrlHash(env.CLOUDFLARE_DEPLOY_HOOK_URL),
        accountId: env.CLOUDFLARE_ACCOUNT_ID ?? 'unconfigured',
        project: env.CLOUDFLARE_PAGES_PROJECT ?? 'unconfigured',
      };
    }
    if (provider === 'github-pages') {
      return {
        repository: env.GITHUB_PAGES_REPO ?? 'unconfigured',
        workflow: env.GITHUB_PAGES_WORKFLOW ?? 'unconfigured',
        ref: env.GITHUB_PAGES_REF ?? 'main',
      };
    }
    if (provider === 'google-cloud-run') {
      return {
        triggerUrlHash: targetUrlHash(env.CLOUD_RUN_BUILD_TRIGGER_URL),
        ...cloudBuildTriggerTarget(env.CLOUD_RUN_BUILD_TRIGGER_URL),
        sourceBranch: env.CLOUD_RUN_SOURCE_BRANCH ?? 'main',
      };
    }
    if (provider === 'docker') {
      return {
        triggerUrlHash: targetUrlHash(env.DOCKER_BUILD_TRIGGER_URL),
        ...cloudBuildTriggerTarget(env.DOCKER_BUILD_TRIGGER_URL),
        registry: env.DOCKER_REGISTRY_URL ?? 'gcr.io',
        sourceBranch: env.DOCKER_SOURCE_BRANCH ?? 'main',
      };
    }
    return { provider };
  })();
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(target).sort(([left], [right]) => left.localeCompare(right))),
  );
  return {
    target,
    targetHash: `sha256:${createHash('sha256').update(`${provider}:${canonical}`).digest('hex')}`,
  };
}

export function providerDeployHookTargetIsConfigured(snapshot: ProviderDeployHookTargetSnapshot): boolean {
  return Object.values(snapshot.target).every((value) => value !== 'unconfigured');
}

export function providerDeployHookTargetIsDedicated(
  provider: string,
  projectId: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const configuration = {
    vercel: ['VERCEL_DEPLOY_TARGET_DEDICATED', 'VERCEL_DEPLOY_TARGET_VIBECORE_PROJECT_ID'],
    netlify: ['NETLIFY_DEPLOY_TARGET_DEDICATED', 'NETLIFY_DEPLOY_TARGET_VIBECORE_PROJECT_ID'],
    'github-pages': ['GITHUB_PAGES_TARGET_DEDICATED', 'GITHUB_PAGES_TARGET_VIBECORE_PROJECT_ID'],
    'cloudflare-pages': ['CLOUDFLARE_PAGES_TARGET_DEDICATED', 'CLOUDFLARE_PAGES_TARGET_VIBECORE_PROJECT_ID'],
    'google-cloud-run': ['CLOUD_RUN_DEPLOY_TARGET_DEDICATED', 'CLOUD_RUN_DEPLOY_TARGET_VIBECORE_PROJECT_ID'],
    docker: ['DOCKER_DEPLOY_TARGET_DEDICATED', 'DOCKER_DEPLOY_TARGET_VIBECORE_PROJECT_ID'],
  } as const;
  const target = configuration[provider as keyof typeof configuration];
  return Boolean(target && env[target[0]] === 'true' && env[target[1]] === projectId);
}

function buildHookSpec(
  provider: (typeof deploymentProviders)[number],
  env: Record<string, string | undefined>,
  options: { publishRegion?: string; operationTag: string; deployedAt: string },
): HookSpec | undefined {
  const baseBody = {
    source: 'vibecore',
    operationTag: options.operationTag,
    deployedAt: options.deployedAt,
    publishRegion: options.publishRegion,
  };

  if (provider === 'vercel' && env.VERCEL_DEPLOY_HOOK_URL) {
    return {
      url: env.VERCEL_DEPLOY_HOOK_URL,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baseBody),
    };
  }

  if (provider === 'netlify' && env.NETLIFY_BUILD_HOOK_URL) {
    const url = new URL(env.NETLIFY_BUILD_HOOK_URL);
    url.searchParams.set('trigger_title', options.operationTag);
    return {
      url: url.toString(),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baseBody),
    };
  }

  if (provider === 'cloudflare-pages' && env.CLOUDFLARE_DEPLOY_HOOK_URL) {
    return {
      url: env.CLOUDFLARE_DEPLOY_HOOK_URL,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baseBody),
    };
  }

  if (provider === 'github-pages' && env.GITHUB_DEPLOY_TOKEN && env.GITHUB_PAGES_REPO && env.GITHUB_PAGES_WORKFLOW) {
    const ref = env.GITHUB_PAGES_REF || 'main';
    return {
      url: `https://api.github.com/repos/${env.GITHUB_PAGES_REPO}/actions/workflows/${env.GITHUB_PAGES_WORKFLOW}/dispatches`,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_DEPLOY_TOKEN}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        ref,
        inputs: {
          source: 'vibecore',
          operationTag: options.operationTag,
          deployedAt: options.deployedAt,
          publishRegion: options.publishRegion,
        },
      }),
    };
  }

  if (provider === 'google-cloud-run' && env.CLOUD_RUN_BUILD_TRIGGER_URL && env.GCP_OAUTH_TOKEN) {
    return {
      url: env.CLOUD_RUN_BUILD_TRIGGER_URL,
      headers: {
        authorization: `Bearer ${env.GCP_OAUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        source: { branchName: env.CLOUD_RUN_SOURCE_BRANCH || 'main' },
        substitutions: {
          _SOURCE: 'vibecore',
          _VIBECORE_OPERATION_TAG: options.operationTag,
          _DEPLOYED_AT: options.deployedAt,
          _REGION: options.publishRegion,
        },
      }),
    };
  }

  if (provider === 'docker' && env.DOCKER_BUILD_TRIGGER_URL && env.GCP_OAUTH_TOKEN) {
    return {
      url: env.DOCKER_BUILD_TRIGGER_URL,
      headers: {
        authorization: `Bearer ${env.GCP_OAUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        source: { branchName: env.DOCKER_SOURCE_BRANCH || 'main' },
        substitutions: {
          _SOURCE: 'vibecore',
          _VIBECORE_OPERATION_TAG: options.operationTag,
          _DEPLOYED_AT: options.deployedAt,
          _DOCKER_REGISTRY: env.DOCKER_REGISTRY_URL || 'gcr.io',
          _REGION: options.publishRegion,
        },
      }),
    };
  }

  return undefined;
}

function parseHookPayload(
  provider: (typeof deploymentProviders)[number],
  payload: unknown,
): {
  url?: string;
  buildId?: string;
  echoedOperationTag?: string;
} {
  const body = recoveryObject(payload);
  const echoedOperationTag =
    body.operationTag ??
    body.operation_tag ??
    recoveryObject(body.job).operationTag ??
    recoveryObject(body.result).operationTag ??
    recoveryObject(recoveryObject(recoveryObject(body.metadata).build).substitutions)._VIBECORE_OPERATION_TAG ??
    recoveryObject(recoveryObject(body.build).substitutions)._VIBECORE_OPERATION_TAG;

  if (provider === 'github-pages') {
    return {
      buildId: body.run_id ? String(body.run_id) : undefined,
      echoedOperationTag: typeof echoedOperationTag === 'string' ? echoedOperationTag : undefined,
    };
  }

  if (provider === 'google-cloud-run' || provider === 'docker') {
    const meta = recoveryObject(recoveryObject(body.metadata).build ?? body.build ?? body);
    const results = recoveryObject(meta.results);
    const images = Array.isArray(results.images) ? results.images : [];
    return {
      buildId: meta?.id,
      url: recoveryObject(images[0]).name,
      echoedOperationTag: typeof echoedOperationTag === 'string' ? echoedOperationTag : undefined,
    };
  }

  const job = recoveryObject(body.job ?? body.result ?? body);

  return {
    url: job?.url ?? job?.deploy_ssl_url ?? job?.deploy_url ?? job?.deployment?.url,
    buildId: job?.id ?? job?.deploy_id ?? job?.run_id,
    echoedOperationTag: typeof echoedOperationTag === 'string' ? echoedOperationTag : undefined,
  };
}

export async function triggerProviderRollback(
  provider: (typeof deploymentProviders)[number],
  buildId: string | undefined,
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<ProviderHookResult | undefined> {
  if (!buildId) {
    return undefined;
  }

  if (provider === 'vercel' && env.VERCEL_API_TOKEN) {
    const teamSuffix = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : '';
    return rollbackHookCall(
      provider,
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(buildId)}/promote${teamSuffix}`,
      { authorization: `Bearer ${env.VERCEL_API_TOKEN}` },
      undefined,
      fetchImpl,
      buildId,
    );
  }

  if (provider === 'netlify' && env.NETLIFY_AUTH_TOKEN && env.NETLIFY_SITE_ID) {
    return rollbackHookCall(
      provider,
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(env.NETLIFY_SITE_ID)}/deploys/${encodeURIComponent(buildId)}/restore`,
      { authorization: `Bearer ${env.NETLIFY_AUTH_TOKEN}` },
      undefined,
      fetchImpl,
      buildId,
    );
  }

  if (
    provider === 'cloudflare-pages' &&
    env.CLOUDFLARE_API_TOKEN &&
    env.CLOUDFLARE_ACCOUNT_ID &&
    env.CLOUDFLARE_PAGES_PROJECT
  ) {
    return rollbackHookCall(
      provider,
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(env.CLOUDFLARE_PAGES_PROJECT)}/deployments/${encodeURIComponent(buildId)}/rollback`,
      { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      undefined,
      fetchImpl,
      buildId,
    );
  }

  return undefined;
}

async function rollbackHookCall(
  provider: (typeof deploymentProviders)[number],
  url: string,
  extraHeaders: Record<string, string>,
  body: string | undefined,
  fetchImpl: typeof fetch,
  buildId: string,
): Promise<ProviderHookResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { ...extraHeaders, accept: 'application/json' },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      return { status: 'failed', log: `${provider}: rollback responded with ${response.status}`, buildId };
    }

    return { status: 'queued', log: `${provider}: rollback to build ${buildId} accepted`, buildId };
  } catch (error: any) {
    return {
      status: 'failed',
      log: `${provider}: rollback failed: ${error?.message ?? 'unknown error'}`,
      buildId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function triggerProviderDeployHook(
  provider: (typeof deploymentProviders)[number],
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  options?: {
    publishRegion?: string;
    operationTag: string;
    deployedAt: string;
    expectedTargetHash: string;
    signal?: AbortSignal;
  },
): Promise<ProviderHookResult | undefined> {
  if (provider === 'static' || provider === 'server') return undefined;
  if (
    !options ||
    !/^ecode-deploy-[a-f0-9]{40}$/u.test(options.operationTag) ||
    !/^sha256:[a-f0-9]{64}$/u.test(options.expectedTargetHash) ||
    !Number.isFinite(Date.parse(options.deployedAt)) ||
    new Date(Date.parse(options.deployedAt)).toISOString() !== options.deployedAt
  ) {
    throw Object.assign(new Error('Durable provider deployment identity is required before dispatch.'), {
      code: 'PROVIDER_DEPLOY_HOOK_IDENTITY_REQUIRED',
      statusCode: 500,
    });
  }
  const currentTarget = providerDeployHookTargetSnapshot(provider, env);
  if (currentTarget.targetHash !== options.expectedTargetHash) {
    return {
      status: 'failed',
      outcome: 'ambiguous',
      log: `${provider}: configured deployment target changed after durable preparation`,
      errorCode: 'PROVIDER_DEPLOY_TARGET_DRIFT',
    };
  }
  const spec = buildHookSpec(provider, env, options);

  if (!spec) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const abortFromAuthority = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abortFromAuthority, { once: true });
  if (options.signal?.aborted) abortFromAuthority();

  try {
    const response = await fetchImpl(spec.url, {
      method: 'POST',
      headers: spec.headers,
      body: spec.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      /*
       * Only bounded client errors prove the provider rejected the request
       * before starting work. Timeouts, throttling, conflicts, redirects and
       * every 5xx are ambiguous: the provider may have launched a build before
       * its edge returned the error, so they can never unlock hard-delete.
       */
      const provenRejection = new Set([400, 401, 403, 404, 405, 410, 411, 413, 414, 415, 422]).has(
        response.status,
      );
      return {
        status: 'failed',
        log: `${provider}: deploy hook responded with ${response.status}`,
        outcome: provenRejection ? 'rejected' : 'ambiguous',
        httpStatus: response.status,
        errorCode: provenRejection
          ? `PROVIDER_DEPLOY_HTTP_${response.status}`
          : `PROVIDER_DEPLOY_HTTP_AMBIGUOUS_${response.status}`,
      };
    }

    let payload: unknown = undefined;

    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    const parsed = parseHookPayload(provider, payload);

    if (parsed.echoedOperationTag && parsed.echoedOperationTag !== options.operationTag) {
      return {
        status: 'failed',
        log: `${provider}: deploy hook returned a mismatched durable operation identity`,
        outcome: 'ambiguous',
        ...(parsed.buildId ? { buildId: parsed.buildId } : {}),
        ...(parsed.url ? { url: parsed.url } : {}),
        httpStatus: response.status,
        errorCode: 'PROVIDER_DEPLOY_IDENTITY_MISMATCH',
        echoedOperationTag: parsed.echoedOperationTag,
      };
    }

    return {
      url: parsed.url,
      buildId: parsed.buildId,
      status: 'queued',
      log: `${provider}: deploy hook accepted (id=${parsed.buildId ?? 'unknown'})`,
      outcome: 'accepted',
      httpStatus: response.status,
      ...(parsed.echoedOperationTag ? { echoedOperationTag: parsed.echoedOperationTag } : {}),
    };
  } catch (error: any) {
    return {
      status: 'failed',
      log: `${provider}: deploy hook failed: ${error?.message ?? 'unknown error'}`,
      outcome: 'ambiguous',
      errorCode: options.signal?.aborted ? 'PROVIDER_DEPLOY_AUTHORITY_ABORTED' : 'PROVIDER_DEPLOY_RESPONSE_LOST',
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromAuthority);
  }
}

export interface ProviderStatusResult {
  state: 'building' | 'ready' | 'failed';
  url?: string;
  log: string;
}

/*
 * Build the provider status-API request for a queued build, or undefined when
 * we cannot poll it (provider has no status API we support, or the read
 * credentials are not configured). Uses the same tokens as rollback so polling
 * is enabled by the same provider setup.
 */
function buildStatusSpec(
  provider: string,
  buildId: string,
  env: Record<string, string | undefined>,
): { url: string; headers: Record<string, string> } | undefined {
  if (provider === 'vercel' && env.VERCEL_API_TOKEN) {
    const teamSuffix = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : '';
    return {
      url: `https://api.vercel.com/v13/deployments/${encodeURIComponent(buildId)}${teamSuffix}`,
      headers: { authorization: `Bearer ${env.VERCEL_API_TOKEN}` },
    };
  }

  if (provider === 'netlify' && env.NETLIFY_AUTH_TOKEN) {
    return {
      url: `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(buildId)}`,
      headers: { authorization: `Bearer ${env.NETLIFY_AUTH_TOKEN}` },
    };
  }

  if (
    provider === 'cloudflare-pages' &&
    env.CLOUDFLARE_API_TOKEN &&
    env.CLOUDFLARE_ACCOUNT_ID &&
    env.CLOUDFLARE_PAGES_PROJECT
  ) {
    return {
      url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(env.CLOUDFLARE_PAGES_PROJECT)}/deployments/${encodeURIComponent(buildId)}`,
      headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    };
  }

  return undefined;
}

/**
 * Whether the real build status of a queued deployment can be polled from the
 * provider. When false, the deploy is reported from the hook response alone
 * (we cannot confirm completion).
 */
export function canPollDeploymentStatus(
  provider: string,
  buildId: string | undefined,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return Boolean(buildId) && buildStatusSpec(provider, buildId as string, env) !== undefined;
}

/** Whether an IDENTIFIED hook has a bounded exact GET path in this runtime. */
export function canReconcileProviderDeployHook(
  provider: string,
  buildId: string | undefined,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  if (!buildId) return false;
  if (provider === 'vercel') return Boolean(env.VERCEL_API_TOKEN && env.VERCEL_PROJECT_ID);
  if (provider === 'netlify') return Boolean(env.NETLIFY_AUTH_TOKEN && env.NETLIFY_SITE_ID);
  if (provider === 'cloudflare-pages') {
    return Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_PAGES_PROJECT);
  }
  if (provider === 'github-pages') {
    return Boolean(
      env.GITHUB_DEPLOY_TOKEN &&
        env.GITHUB_PAGES_REPO &&
        env.GITHUB_PAGES_OPERATION_TAG_RUN_NAME === 'true',
    );
  }
  if (provider === 'google-cloud-run' || provider === 'docker') {
    const triggerUrl = provider === 'google-cloud-run' ? env.CLOUD_RUN_BUILD_TRIGGER_URL : env.DOCKER_BUILD_TRIGGER_URL;
    return Boolean(
      env.GCP_OAUTH_TOKEN &&
        triggerUrl &&
        /\/v1\/projects\/[^/]+\/locations\/[^/]+\/triggers\/[^/:]+:run$/u.test(
          (() => {
            try {
              return new URL(triggerUrl as string).pathname;
            } catch {
              return '';
            }
          })(),
        ),
    );
  }
  return false;
}

function parseStatusPayload(provider: string, payload: unknown): ProviderStatusResult {
  const body = (payload as Record<string, any>) ?? {};

  if (provider === 'vercel') {
    const readyState = String(body.readyState ?? body.status ?? '').toUpperCase();
    const url = body.url ? (String(body.url).startsWith('http') ? String(body.url) : `https://${body.url}`) : undefined;

    if (readyState === 'READY') {
      return { state: 'ready', url, log: 'vercel: deployment is READY' };
    }

    if (readyState === 'ERROR' || readyState === 'CANCELED') {
      return { state: 'failed', log: `vercel: deployment ${readyState}` };
    }

    return { state: 'building', log: `vercel: deployment ${readyState || 'BUILDING'}` };
  }

  if (provider === 'netlify') {
    const state = String(body.state ?? '').toLowerCase();
    const url = body.ssl_url ?? body.deploy_ssl_url ?? body.url;

    if (state === 'ready') {
      return { state: 'ready', url, log: 'netlify: deploy is ready' };
    }

    if (state === 'error' || state === 'rejected') {
      return { state: 'failed', log: `netlify: deploy ${state}` };
    }

    return { state: 'building', log: `netlify: deploy ${state || 'building'}` };
  }

  // cloudflare-pages
  const result = body.result ?? body;
  const stage = result?.latest_stage ?? {};
  const status = String(stage.status ?? '').toLowerCase();
  const url = result?.url;

  if (stage.name === 'deploy' && status === 'success') {
    return { state: 'ready', url, log: 'cloudflare-pages: deploy succeeded' };
  }

  if (status === 'failure' || status === 'canceled') {
    return { state: 'failed', log: `cloudflare-pages: ${stage.name ?? 'build'} ${status}` };
  }

  return { state: 'building', log: `cloudflare-pages: ${stage.name ?? 'build'} ${status || 'in progress'}` };
}

/**
 * Query the provider for the real status of a queued build. Returns undefined
 * when the provider is not pollable. A non-OK or unreachable status endpoint is
 * treated as a transient "still building" so we never flip a deploy to failed
 * on a flaky status read.
 */
export async function pollProviderDeploymentStatus(
  provider: string,
  buildId: string,
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<ProviderStatusResult | undefined> {
  const spec = buildStatusSpec(provider, buildId, env);

  if (!spec) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetchImpl(spec.url, { headers: spec.headers, signal: controller.signal });

    if (!response.ok) {
      return { state: 'building', log: `${provider}: status check responded with ${response.status}` };
    }

    let payload: unknown = undefined;

    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    return parseStatusPayload(provider, payload);
  } catch (error: any) {
    return { state: 'building', log: `${provider}: status check failed: ${error?.message ?? 'unknown error'}` };
  } finally {
    clearTimeout(timeout);
  }
}

function providerRecoveryError(code: string, message: string, statusCode = 409): Error {
  return Object.assign(new Error(message), { code, statusCode });
}

async function readProviderRecoveryPayload(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url, { headers: { ...headers, accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
        `Provider identity lookup responded with ${response.status}.`,
        response.status >= 500 ? 503 : 409,
      );
    }
    const payload = await response.json().catch(() => undefined);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_UNPROVABLE',
        'Provider identity lookup returned no verifiable object.',
      );
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if ((error as { code?: string }).code) throw error;
    throw providerRecoveryError(
      'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
      'Provider identity lookup could not be completed.',
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function recoveryObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recoveryString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/**
 * Verify an operator-supplied provider id using a live GET. Recovery succeeds
 * only when the provider returns the configured target and either this ledger's
 * stable operation tag or, for an explicitly dedicated Vercel/Cloudflare
 * target, the exact target-bound deployment identity.
 */
export async function pollProviderDeployHookRecoveryIdentity(input: {
  provider: string;
  providerBuildId: string;
  operationTag: string;
  expectedTargetHash?: string;
  expectedProjectId?: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): Promise<ProviderDeployHookRecoveryObservation> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const env = input.env ?? (process.env as Record<string, string | undefined>);
  if (!input.providerBuildId.trim() || !/^ecode-deploy-[a-f0-9]{40}$/u.test(input.operationTag)) {
    throw providerRecoveryError('PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_INVALID', 'Recovery identity is invalid.', 400);
  }
  const currentTarget = providerDeployHookTargetSnapshot(
    input.provider as (typeof deploymentProviders)[number],
    env,
  );
  if (input.expectedTargetHash && currentTarget.targetHash !== input.expectedTargetHash) {
    throw providerRecoveryError(
      'PROVIDER_DEPLOY_HOOK_TARGET_DRIFT',
      'The configured provider target changed after durable preparation.',
    );
  }
  if (input.expectedProjectId && !providerDeployHookTargetIsDedicated(input.provider, input.expectedProjectId, env)) {
    throw providerRecoveryError(
      'PROVIDER_DEPLOY_HOOK_TARGET_DRIFT',
      'The provider target is no longer dedicated to this project.',
    );
  }

  if (input.provider === 'vercel') {
    if (!env.VERCEL_API_TOKEN || !env.VERCEL_PROJECT_ID) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
        'Vercel recovery target is not configured.',
        503,
      );
    }
    const teamSuffix = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : '';
    const body = await readProviderRecoveryPayload(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(input.providerBuildId)}${teamSuffix}`,
      { authorization: `Bearer ${env.VERCEL_API_TOKEN}` },
      fetchImpl,
    );
    const readyState = recoveryString(body.readyState ?? body.status).toUpperCase();
    const project = recoveryObject(body.project);
    const returnedProjectId = recoveryString(body.projectId ?? project.id);
    const returnedTeamId = recoveryString(recoveryObject(body.team).id ?? body.teamId);
    if (
      recoveryString(body.uid ?? body.id) !== input.providerBuildId ||
      returnedProjectId !== env.VERCEL_PROJECT_ID ||
      (env.VERCEL_TEAM_ID && returnedTeamId !== env.VERCEL_TEAM_ID)
    ) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_UNPROVABLE',
        'Vercel deployment id and dedicated project target did not match.',
      );
    }
    const rawUrl = recoveryString(body.url);
    return {
      resolution: 'EXACT_IDENTITY', provider: 'vercel', providerBuildId: input.providerBuildId,
      providerState: readyState === 'READY' ? 'ready' : ['ERROR', 'CANCELED'].includes(readyState) ? 'failed' : 'building',
      ...(rawUrl ? { providerUrl: rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}` } : {}),
      operationTag: input.operationTag, identityKind: 'DEDICATED_VERCEL_TARGET',
      providerTarget: currentTarget.target, providerTargetHash: currentTarget.targetHash,
    };
  }

  if (input.provider === 'cloudflare-pages') {
    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_PAGES_PROJECT) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
        'Cloudflare Pages recovery target is not configured.',
        503,
      );
    }
    const body = await readProviderRecoveryPayload(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(env.CLOUDFLARE_PAGES_PROJECT)}/deployments/${encodeURIComponent(input.providerBuildId)}`,
      { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, fetchImpl,
    );
    const result = recoveryObject(body.result ?? body);
    const stage = recoveryObject(result.latest_stage);
    const status = recoveryString(stage.status).toLowerCase();
    if (
      body.success === false ||
      recoveryString(result.id) !== input.providerBuildId ||
      recoveryString(result.project_name) !== env.CLOUDFLARE_PAGES_PROJECT
    ) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_UNPROVABLE',
        'Cloudflare deployment id and dedicated Pages project did not match.',
      );
    }
    const providerUrl = recoveryString(result.url);
    return {
      resolution: 'EXACT_IDENTITY', provider: 'cloudflare-pages', providerBuildId: input.providerBuildId,
      providerState: stage.name === 'deploy' && status === 'success' ? 'ready' : ['failure', 'canceled'].includes(status) ? 'failed' : 'building',
      ...(providerUrl ? { providerUrl } : {}), operationTag: input.operationTag,
      identityKind: 'DEDICATED_CLOUDFLARE_TARGET', providerTarget: currentTarget.target, providerTargetHash: currentTarget.targetHash,
    };
  }

  if (input.provider === 'netlify') {
    if (!env.NETLIFY_AUTH_TOKEN || !env.NETLIFY_SITE_ID) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
        'Netlify recovery credentials and site target are not configured.',
        503,
      );
    }
    const body = await readProviderRecoveryPayload(
      `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(input.providerBuildId)}`,
      { authorization: `Bearer ${env.NETLIFY_AUTH_TOKEN}` },
      fetchImpl,
    );
    const state = recoveryString(body.state).toLowerCase();
    const providerUrl = recoveryString(body.ssl_url ?? body.deploy_ssl_url ?? body.url);
    if (
      recoveryString(body.id) !== input.providerBuildId ||
      recoveryString(body.site_id) !== env.NETLIFY_SITE_ID ||
      recoveryString(body.title ?? body.trigger_title) !== input.operationTag
    ) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_UNPROVABLE',
        'Netlify deploy id, site, and durable trigger title did not all match.',
      );
    }
    return {
      resolution: 'EXACT_IDENTITY',
      provider: 'netlify',
      providerBuildId: input.providerBuildId,
      providerState: state === 'ready' ? 'ready' : ['error', 'rejected'].includes(state) ? 'failed' : 'building',
      ...(providerUrl ? { providerUrl } : {}),
      operationTag: input.operationTag,
      identityKind: 'NETLIFY_TRIGGER_TITLE',
      providerTarget: currentTarget.target,
      providerTargetHash: currentTarget.targetHash,
    };
  }

  if (input.provider === 'github-pages') {
    if (!env.GITHUB_DEPLOY_TOKEN || !env.GITHUB_PAGES_REPO) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
        'GitHub recovery credentials and repository target are not configured.',
        503,
      );
    }
    const body = await readProviderRecoveryPayload(
      `https://api.github.com/repos/${env.GITHUB_PAGES_REPO}/actions/runs/${encodeURIComponent(input.providerBuildId)}`,
      { authorization: `Bearer ${env.GITHUB_DEPLOY_TOKEN}`, 'x-github-api-version': '2022-11-28' },
      fetchImpl,
    );
    const status = recoveryString(body.status).toLowerCase();
    const conclusion = recoveryString(body.conclusion).toLowerCase();
    const repository = recoveryObject(body.repository);
    const providerUrl = recoveryString(body.html_url);
    if (
      recoveryString(body.id) !== input.providerBuildId ||
      recoveryString(repository.full_name) !== env.GITHUB_PAGES_REPO ||
      recoveryString(body.path) !== `.github/workflows/${env.GITHUB_PAGES_WORKFLOW}` ||
      recoveryString(body.display_title) !== input.operationTag
    ) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_UNPROVABLE',
        'GitHub workflow run id, repository, and durable run name did not all match.',
      );
    }
    return {
      resolution: 'EXACT_IDENTITY',
      provider: 'github-pages',
      providerBuildId: input.providerBuildId,
      providerState:
        status !== 'completed' ? 'building' : conclusion === 'success' ? 'ready' : 'failed',
      ...(providerUrl ? { providerUrl } : {}),
      operationTag: input.operationTag,
      identityKind: 'GITHUB_WORKFLOW_RUN_NAME',
      providerTarget: currentTarget.target,
      providerTargetHash: currentTarget.targetHash,
    };
  }

  if (input.provider === 'google-cloud-run' || input.provider === 'docker') {
    const triggerUrl =
      input.provider === 'google-cloud-run' ? env.CLOUD_RUN_BUILD_TRIGGER_URL : env.DOCKER_BUILD_TRIGGER_URL;
    if (!triggerUrl || !env.GCP_OAUTH_TOKEN) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
        'Cloud Build recovery credentials and trigger target are not configured.',
        503,
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(triggerUrl);
    } catch {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
        'Cloud Build trigger target is invalid.',
        503,
      );
    }
    const match = parsed.pathname.match(/\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/triggers\/[^/:]+:run$/u);
    if (!match) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_PROVIDER_UNAVAILABLE',
        'Cloud Build trigger target is not an exact regional trigger URL.',
        503,
      );
    }
    const projectId = decodeURIComponent(match[1]!);
    const location = decodeURIComponent(match[2]!);
    const triggerId = recoveryString(currentTarget.target.triggerId);
    const body = await readProviderRecoveryPayload(
      `${parsed.origin}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/builds/${encodeURIComponent(input.providerBuildId)}`,
      { authorization: `Bearer ${env.GCP_OAUTH_TOKEN}` },
      fetchImpl,
    );
    const status = recoveryString(body.status).toUpperCase();
    const buildName = recoveryString(body.name);
    const substitutions = recoveryObject(body.substitutions);
    const results = recoveryObject(body.results);
    const images = Array.isArray(results.images) ? results.images : [];
    const image = recoveryString(recoveryObject(images[0]).name);
    const expectedName = `projects/${projectId}/locations/${location}/builds/${input.providerBuildId}`;
    if (
      recoveryString(body.id) !== input.providerBuildId ||
      buildName !== expectedName ||
      recoveryString(body.projectId) !== projectId ||
      recoveryString(body.buildTriggerId) !== triggerId ||
      recoveryString(substitutions._VIBECORE_OPERATION_TAG) !== input.operationTag
    ) {
      throw providerRecoveryError(
        'PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_UNPROVABLE',
        'Cloud Build id, project, location, trigger, and durable substitution did not all match.',
      );
    }
    const failedStatuses = ['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'];
    return {
      resolution: 'EXACT_IDENTITY',
      provider: input.provider,
      providerBuildId: input.providerBuildId,
      providerState: status === 'SUCCESS' ? 'ready' : failedStatuses.includes(status) ? 'failed' : 'building',
      ...(image ? { providerUrl: image } : {}),
      operationTag: input.operationTag,
      identityKind: 'CLOUD_BUILD_SUBSTITUTION',
      providerTarget: currentTarget.target,
      providerTargetHash: currentTarget.targetHash,
    };
  }

  throw providerRecoveryError(
    'PROVIDER_DEPLOY_HOOK_RECOVERY_IDENTITY_UNPROVABLE',
    'This provider does not expose the durable hook identity through an exact lookup API.',
  );
}

/**
 * Deliberately unavailable: a timestamp window cannot prove which deployment
 * belongs to one operation. Recovery uses an exact GET for a dedicated target;
 * anything not provable that way remains MANUAL_RECOVERY with no DELETE I/O.
 */
export async function decommissionProviderDeployHookRecoveryTarget(input: {
  provider: string;
  operationTag: string;
  windowStartedAt: string;
  horizonAt: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): Promise<ProviderDeployHookRecoveryObservation> {
  void input;
  throw providerRecoveryError(
    'PROVIDER_DEPLOY_HOOK_RECOVERY_MANUAL_REQUIRED',
    'Timestamp-window decommission is unsafe; leave this provider operation in manual recovery.',
  );
}

export function detectFramework(input: CreateDeploymentRequest) {
  if (input.framework) {
    return input.framework;
  }

  const command = input.buildCommand.toLowerCase();
  const output = input.outputDirectory.toLowerCase();

  /*
   * An explicit framework name in the build command wins over the output-dir
   * heuristic. outputDirectory defaults to 'dist', so checking `output === 'dist'`
   * before the astro/remix/nuxt branches mislabeled every astro/remix/nuxt build
   * (with the default output dir) as 'vite'.
   */
  if (command.includes('next')) {
    return 'nextjs';
  }

  if (command.includes('astro')) {
    return 'astro';
  }

  if (command.includes('remix')) {
    return 'remix';
  }

  if (command.includes('nuxt')) {
    return 'nuxt';
  }

  if (command.includes('vite')) {
    return 'vite';
  }

  // Fall back to output-directory heuristics when the command names no framework.
  if (output === '.next') {
    return 'nextjs';
  }

  if (output === 'dist') {
    return 'vite';
  }

  return 'static';
}

/*
 * Base domain for server-deployment public hosts (`d-<id>.<domain>`). Reuses the
 * preview wildcard domain (`*.preview.e-code.ai`) so the deploy host is covered by
 * the existing wildcard TLS cert + ingress + DNS with ZERO new infra — the
 * preview-proxy host-routes `d-<id>.<domain>` to the deployment's Service.
 */
export function serverDeployDomain() {
  return (process.env.SERVER_DEPLOY_DOMAIN?.trim() || process.env.PREVIEW_DOMAIN?.trim() || 'preview.e-code.ai')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase();
}

/** Public host for a server deployment: `d-<deploymentId>.<serverDeployDomain()>`. */
export function serverDeployHost(deploymentId: string) {
  return `d-${deploymentId.toLowerCase()}.${serverDeployDomain()}`;
}

export function buildDeploymentUrl(project: ProjectRecord, deployment: DeploymentRecord) {
  if (deployment.provider === 'static') {
    /*
     * Prefer the deployment's DEDICATED origin (`s-<id>.<previewDomain>`): on the
     * API origin the artifact must be served in an opaque sandbox, which breaks
     * localStorage and renders storage-using SPAs blank (LAUNCH-BLOCKER
     * 2026-08-01). Falls back to the legacy same-origin URL when no preview
     * domain is configured (local dev/tests); that URL keeps working either way
     * because the route redirects to the dedicated origin when one exists.
     */
    const dedicated = staticDeployDedicatedOrigin(deployment.id);

    if (dedicated) {
      return `${dedicated}/`;
    }

    return `${staticDeployPublicBaseUrl()}/static-deployments/${deployment.id}/`;
  }

  if (deployment.provider === 'server') {
    return `https://${serverDeployHost(deployment.id)}`;
  }

  const slug = project.slug || project.id;
  const envPrefix = deployment.environment === 'production' ? '' : `${deployment.environment}-`;

  const providerHost =
    deployment.provider === 'google-cloud-run'
      ? 'run.vibecore.local'
      : deployment.provider === 'github-pages'
        ? 'pages.vibecore.local'
        : `${deployment.provider}.vibecore.local`;

  return `https://${envPrefix}${slug}-${deployment.id.slice(-6)}.${providerHost}`;
}

/**
 * P2d publish/promote: a deployment can be published to production only when it
 * has a built artifact (READY) and is not itself a production deployment.
 */
export function canPublishDeployment(source: Pick<DeploymentRecord, 'status' | 'environment'>): {
  ok: boolean;
  code?: 'NOT_READY' | 'ALREADY_PRODUCTION';
} {
  if (source.environment === 'production') {
    return { ok: false, code: 'ALREADY_PRODUCTION' };
  }

  if (source.status !== 'READY') {
    return { ok: false, code: 'NOT_READY' };
  }

  return { ok: true };
}

/**
 * Promote a READY preview/staging deployment to production: a true "publish"
 * that points production at the SAME built artifact (no rebuild), Vercel-style.
 * The new deployment links back to its source via `parentDeploymentId`. Pure —
 * the caller supplies the resolved production URL.
 */
export function buildPublishedDeploymentInput(source: DeploymentRecord, productionUrl: string) {
  return {
    projectId: source.projectId,
    workspaceId: source.workspaceId,
    provider: source.provider,
    environment: 'production' as const,
    status: 'READY' as const,
    url: source.url,
    productionUrl,
    framework: source.framework,
    buildCommand: source.buildCommand,
    outputDirectory: source.outputDirectory,
    branch: source.branch,
    commitSha: source.commitSha,
    customDomain: source.customDomain,
    parentDeploymentId: source.id,

    // Production runs on the same machine size the source was priced for.
    machineSize: source.machineSize,
    metadata: { ...(source.metadata ?? {}), publishedFrom: source.id },
  };
}

/**
 * Public-facing host that backs the `/static-deployments/<id>/*` route. This
 * URL is persisted on the Deployment row and shown to the user as the live URL
 * of their published app, so it MUST be browser-reachable — not the internal
 * cluster address.
 *
 * Resolution order: explicit `STATIC_DEPLOY_BASE_URL`, then the public API base
 * URL (`PUBLIC_API_BASE_URL`, e.g. https://api.e-code.ai), then `SAAS_API_URL`,
 * then a local-dev default. `SAAS_API_URL` in production is the in-cluster
 * service DNS (`…svc.cluster.local:3001`) which is unreachable from a browser,
 * so it must come AFTER the public base URL — otherwise every static deployment
 * surfaces a dead `http://…svc.cluster.local/static-deployments/<id>/` link.
 * Strips trailing slashes so callers can concatenate `/static-deployments/...`
 * safely.
 */
export function staticDeployPublicBaseUrl() {
  const raw =
    process.env.STATIC_DEPLOY_BASE_URL?.trim() ||
    process.env.PUBLIC_API_BASE_URL?.trim() ||
    process.env.SAAS_API_URL?.trim() ||
    'http://127.0.0.1:3001';

  return raw.replace(/\/+$/, '');
}

export function projectStorageRoot() {
  return (
    process.env.PROJECT_STORAGE_DIR ??
    (process.env.NODE_ENV === 'production'
      ? '/tmp/vibecore-project-storage'
      : join(process.cwd(), '.vibecore-project-storage'))
  );
}

export function projectStorageDir(projectId: string) {
  return join(projectStorageRoot(), projectId);
}

const SAFE_WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * Build directory for a secondary workspace. Mirrors the layout used by the
 * project-storage module (`.vibecore-workspaces/<workspaceId>/`) so deployments
 * can build from a per-workspace checkout instead of the project root.
 */
export function workspaceStorageDir(projectId: string, workspaceId: string) {
  if (!SAFE_WORKSPACE_ID.test(workspaceId)) {
    throw Object.assign(new Error(appPublicEnglish('INVALID_WORKSPACE_ID')), {
      statusCode: 400,
      code: 'INVALID_WORKSPACE_ID',
    });
  }

  return join(projectStorageRoot(), projectId, '.vibecore-workspaces', workspaceId);
}

export function staticDeploymentStorageRoot() {
  return process.env.STATIC_DEPLOY_STORAGE_DIR ?? join(process.cwd(), '.vibecore-static-deployments');
}

export function staticDeploymentSnapshotDir(deploymentId: string) {
  return join(staticDeploymentStorageRoot(), deploymentId);
}

const STATIC_ARTIFACT_REF = /^static-artifacts\/sha256\/([a-f0-9]{64})$/u;

export function staticDeploymentArtifactRef(digest: string): string {
  const match = /^sha256:([a-f0-9]{64})$/u.exec(digest);

  if (!match) {
    throw Object.assign(new Error(appPublicEnglish('ROLLBACK_ARTIFACT_DIGEST_MISMATCH')), {
      code: 'ROLLBACK_ARTIFACT_DIGEST_INVALID',
      statusCode: 409,
    });
  }

  return `static-artifacts/sha256/${match[1]}`;
}

export function staticDeploymentArtifactDir(artifactRef: string): string {
  const match = STATIC_ARTIFACT_REF.exec(artifactRef);

  if (!match) {
    throw Object.assign(new Error(appPublicEnglish('ROLLBACK_PREVIOUS_SNAPSHOT_MISSING', { version: 0 })), {
      code: 'ROLLBACK_STATIC_ARTIFACT_REF_INVALID',
      statusCode: 409,
    });
  }

  return join(staticDeploymentStorageRoot(), '.artifacts', 'sha256', match[1]);
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inside `<projectStorage>/<projectId>/`, the project may either be at the
 * root (single-package layout) or nested under a folder if the user has a
 * monorepo. We resolve the buildCommand/outputDirectory relative to the
 * first package.json we find; for the common case this is just the project
 * root itself.
 */
async function resolveBuildCwd(projectDir: string) {
  if (await pathExists(join(projectDir, 'package.json'))) {
    return projectDir;
  }

  return projectDir;
}

function detectPackageManager(projectDir: string) {
  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) {
    return { manager: 'pnpm', install: ['install', '--prod=false'] } as const;
  }

  if (existsSync(join(projectDir, 'yarn.lock'))) {
    return { manager: 'yarn', install: ['install', '--production=false'] } as const;
  }

  if (existsSync(join(projectDir, 'bun.lockb'))) {
    return { manager: 'bun', install: ['install'] } as const;
  }

  /*
   * `--legacy-peer-deps`: tolerate the peer-dependency conflicts AI-generated
   * apps routinely ship (npm v7+ ERESOLVE) so a valid app that previews fine
   * doesn't fail to deploy on a peer-range nit. Mirrors deploy-workspace-build.
   */
  return {
    manager: 'npm',
    install: ['install', '--include=dev', '--no-audit', '--no-fund', '--legacy-peer-deps'],
  } as const;
}

function existsSync(targetPath: string) {
  try {
    /*
     * Sync existence probe used inside detectPackageManager for the simple
     * common case (lockfile presence). All other I/O remains async.
     */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node:fs').existsSync(targetPath);
  } catch {
    return false;
  }
}

function shellLikeQuote(value: string) {
  if (value === '' || /[^A-Za-z0-9_\-./:=]/.test(value)) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  return value;
}

function splitBuildCommand(buildCommand: string): { command: string; args: string[] } | undefined {
  const trimmed = buildCommand.trim();

  if (!trimmed) {
    return undefined;
  }

  const tokens = trimmed.match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g);

  if (!tokens || tokens.length === 0) {
    return undefined;
  }

  const dequote = (token: string) => {
    if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
      return token.slice(1, -1);
    }

    return token;
  };

  const [command, ...rest] = tokens.map(dequote);

  return { command, args: rest };
}

export type StaticBuildLogLevel = 'info' | 'error';

export interface StaticBuildLog {
  timestamp: string;
  level: StaticBuildLogLevel;
  message: string;
}

export interface RunStaticBuildOptions {
  projectId: string;

  /**
   * Optional workspace scope. When set, the build runs from the workspace's
   * checkout under `<projectStorage>/<projectId>/.vibecore-workspaces/<workspaceId>/`
   * instead of the project root. The caller is responsible for validating that
   * the workspaceId belongs to the project (see resolveGitWorkspaceId in app.ts).
   */
  workspaceId?: string;
  buildCommand: string;
  outputDirectory: string;
  envVars: Record<string, string>;
  timeoutSeconds: number;
  artifactSizeLimitMb?: number;
}

export interface RunStaticBuildResult {
  ok: boolean;
  logs: StaticBuildLog[];

  /** Absolute path to the resolved output directory when ok. */
  outputDir?: string;

  /** Plain error message when not ok (also reflected in the last logs entry). */
  error?: string;
}

const SAFE_OUTPUT_PATTERN = /^[A-Za-z0-9._/-]+$/;

export function sanitizeStaticOutputDirectory(outputDirectory: string): string {
  const trimmed = outputDirectory
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');

  if (!trimmed) {
    return 'dist';
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('..') || trimmed.includes('..')) {
    return 'dist';
  }

  if (!SAFE_OUTPUT_PATTERN.test(trimmed)) {
    return 'dist';
  }

  return trimmed;
}

function makeLogger() {
  const logs: StaticBuildLog[] = [];

  const push = (level: StaticBuildLogLevel, message: string) => {
    logs.push({ timestamp: new Date().toISOString(), level, message });
  };

  return { logs, push };
}

async function runProcess({
  command,
  args,
  cwd,
  env,
  timeoutMs,
  onStdout,
  onStderr,
}: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
}): Promise<{ ok: boolean; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    const cleanup = () => {
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);

    const bind = (stream: NodeJS.ReadableStream, sink: (line: string) => void) => {
      let buffer = '';

      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        buffer += chunk;

        let newline = buffer.indexOf('\n');

        while (newline !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, '');

          if (line.trim() || line.length > 0) {
            sink(line);
          }

          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
        }
      });
      stream.on('end', () => {
        if (buffer.trim()) {
          sink(buffer);
        }
      });

      /*
       * Guard the pipe: an 'error' on stdout/stderr with no listener becomes an
       * uncaughtException that crashes the api process. The child 'error'/'close'
       * handlers below don't cover stream-level errors.
       */
      stream.on('error', () => {});
    };

    bind(child.stdout, onStdout);
    bind(child.stderr, onStderr);

    child.on('error', (error) => {
      cleanup();
      onStderr(`spawn error: ${error.message}`);
      resolvePromise({ ok: false, code: null, signal: null });
    });

    child.on('close', (code, signal) => {
      cleanup();
      resolvePromise({ ok: code === 0, code, signal });
    });
  });
}

async function prepareDeploymentHome(buildCwd: string) {
  const home = join(buildCwd, '.vibecore-deploy-home');

  await mkdir(join(home, '.npm-cache'), { recursive: true });
  await mkdir(join(home, '.cache'), { recursive: true });
  await mkdir(join(home, '.pnpm-store'), { recursive: true });
  await mkdir(join(home, '.yarn-cache'), { recursive: true });

  return home;
}

function buildEnvForRun(envVars: Record<string, string>, buildHome: string): NodeJS.ProcessEnv {
  /*
   * Inherit the host PATH so npm/pnpm/yarn/bun resolve, but DROP every other
   * host secret so the user's build can't read tokens from the server env.
   * npm and friends need a writable HOME/cache. Never forward the server HOME:
   * production containers may point at a missing /home/node, which makes
   * dependency install fail before the project build even starts.
   */
  const userNodeEnv = envVars.NODE_ENV;

  const nodeEnv: 'production' | 'development' | 'test' =
    userNodeEnv === 'development' || userNodeEnv === 'test' || userNodeEnv === 'production'
      ? userNodeEnv
      : 'production';

  const sanitizedUserEnv = { ...envVars };
  delete sanitizedUserEnv.NODE_ENV;
  delete sanitizedUserEnv.PATH;
  delete sanitizedUserEnv.HOME;
  delete sanitizedUserEnv.USERPROFILE;
  delete sanitizedUserEnv.XDG_CACHE_HOME;
  delete sanitizedUserEnv.NPM_CONFIG_CACHE;
  delete sanitizedUserEnv.npm_config_cache;
  delete sanitizedUserEnv.NPM_CONFIG_PRODUCTION;
  delete sanitizedUserEnv.npm_config_production;
  delete sanitizedUserEnv.PNPM_HOME;
  delete sanitizedUserEnv.PNPM_STORE_DIR;
  delete sanitizedUserEnv.pnpm_config_store_dir;
  delete sanitizedUserEnv.YARN_CACHE_FOLDER;

  const baseEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: buildHome,
    USERPROFILE: buildHome,
    XDG_CACHE_HOME: join(buildHome, '.cache'),
    npm_config_cache: join(buildHome, '.npm-cache'),
    NPM_CONFIG_CACHE: join(buildHome, '.npm-cache'),
    npm_config_production: 'false',
    NPM_CONFIG_PRODUCTION: 'false',
    PNPM_HOME: buildHome,
    PNPM_STORE_DIR: join(buildHome, '.pnpm-store'),
    pnpm_config_store_dir: join(buildHome, '.pnpm-store'),
    YARN_CACHE_FOLDER: join(buildHome, '.yarn-cache'),
    CI: '1',
    NODE_ENV: nodeEnv,
    ...sanitizedUserEnv,
  };

  if (process.env.LANG) {
    baseEnv.LANG = process.env.LANG;
  }

  return baseEnv;
}

export async function runStaticBuild(options: RunStaticBuildOptions): Promise<RunStaticBuildResult> {
  const log = makeLogger();
  const timeoutMs = Math.max(1, options.timeoutSeconds) * 1000;

  /*
   * Shared deadline across install + build. Previously each phase got the full
   * timeoutMs independently, so a build could run up to ~2× the configured
   * timeout (install timeoutMs + build timeoutMs). Subtract elapsed time so the
   * total honors the single timeoutSeconds budget.
   */
  const deadline = Date.now() + timeoutMs;
  const remainingMs = () => Math.max(1, deadline - Date.now());

  const projectDir = options.workspaceId
    ? workspaceStorageDir(options.projectId, options.workspaceId)
    : projectStorageDir(options.projectId);

  if (!(await pathExists(projectDir))) {
    log.push('error', `Project storage directory not found at ${projectDir}.`);
    return { ok: false, logs: log.logs, error: 'PROJECT_STORAGE_MISSING' };
  }

  const buildCwd = await resolveBuildCwd(projectDir);

  if (!(await pathExists(join(buildCwd, 'package.json')))) {
    log.push('error', `No package.json found in ${buildCwd}. Static deploys require a buildable project.`);
    return { ok: false, logs: log.logs, error: 'PACKAGE_JSON_MISSING' };
  }

  const packageManager = detectPackageManager(buildCwd);
  const buildHome = await prepareDeploymentHome(buildCwd);
  const env = buildEnvForRun(options.envVars, buildHome);

  log.push('info', `Static deploy: building in ${buildCwd}`);
  log.push('info', `Static deploy: using isolated build home ${buildHome}`);
  log.push('info', `Static deploy: detected ${packageManager.manager} (lockfile-based)`);

  const nodeModulesPresent = await pathExists(join(buildCwd, 'node_modules'));

  if (!nodeModulesPresent) {
    log.push(
      'info',
      `Static deploy: installing dependencies (${packageManager.manager} ${packageManager.install.join(' ')})`,
    );

    const install = await runProcess({
      command: packageManager.manager,
      args: [...packageManager.install],
      cwd: buildCwd,
      env,
      timeoutMs: remainingMs(),
      onStdout: (line) => log.push('info', `[install] ${redactDeploymentLog(line, options.envVars)}`),
      onStderr: (line) => log.push('error', `[install] ${redactDeploymentLog(line, options.envVars)}`),
    });

    if (!install.ok) {
      log.push(
        'error',
        `Static deploy: dependency install failed (exit ${install.code ?? 'null'}${install.signal ? `, signal ${install.signal}` : ''}).`,
      );
      return { ok: false, logs: log.logs, error: 'INSTALL_FAILED' };
    }
  } else {
    log.push('info', 'Static deploy: reusing existing node_modules');
  }

  const split = splitBuildCommand(options.buildCommand);

  if (!split) {
    log.push('error', `Static deploy: invalid build command "${options.buildCommand}"`);
    return { ok: false, logs: log.logs, error: 'BUILD_COMMAND_INVALID' };
  }

  log.push(
    'info',
    `Static deploy: running build (${redactDeploymentLog(
      `${split.command} ${split.args.map(shellLikeQuote).join(' ')}`,
      options.envVars,
    )})`,
  );

  const build = await runProcess({
    command: split.command,
    args: split.args,
    cwd: buildCwd,
    env,
    timeoutMs: remainingMs(),
    onStdout: (line) => log.push('info', `[build] ${redactDeploymentLog(line, options.envVars)}`),
    onStderr: (line) => log.push('error', `[build] ${redactDeploymentLog(line, options.envVars)}`),
  });

  if (!build.ok) {
    log.push(
      'error',
      `Static deploy: build failed (exit ${build.code ?? 'null'}${build.signal ? `, signal ${build.signal}` : ''}).`,
    );
    return { ok: false, logs: log.logs, error: 'BUILD_FAILED' };
  }

  const safeOutputDirectory = sanitizeStaticOutputDirectory(options.outputDirectory);
  const outputDir = resolve(buildCwd, safeOutputDirectory);

  if (!outputDir.startsWith(`${buildCwd}${sep}`) && outputDir !== buildCwd) {
    log.push('error', `Static deploy: output directory escapes the project root (${safeOutputDirectory}).`);
    return { ok: false, logs: log.logs, error: 'OUTPUT_DIRECTORY_ESCAPE' };
  }

  if (!(await pathExists(outputDir))) {
    log.push('error', `Static deploy: build succeeded but ${safeOutputDirectory}/ is missing in ${buildCwd}.`);
    return { ok: false, logs: log.logs, error: 'OUTPUT_DIRECTORY_MISSING' };
  }

  if (!(await pathExists(join(outputDir, 'index.html')))) {
    log.push(
      'error',
      `Static deploy: ${safeOutputDirectory}/index.html was not produced. Add a static entrypoint or change outputDirectory.`,
    );
    return { ok: false, logs: log.logs, error: 'INDEX_HTML_MISSING' };
  }

  if (options.artifactSizeLimitMb) {
    const totalBytes = await directoryByteSize(outputDir);
    const limitBytes = options.artifactSizeLimitMb * 1024 * 1024;

    if (totalBytes > limitBytes) {
      log.push(
        'error',
        `Static deploy: artifact (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) exceeds limit (${options.artifactSizeLimitMb} MB).`,
      );
      return { ok: false, logs: log.logs, error: 'ARTIFACT_TOO_LARGE' };
    }

    log.push('info', `Static deploy: artifact size ${(totalBytes / 1024).toFixed(1)} KB`);
  }

  log.push('info', `Static deploy: build succeeded, artifact at ${safeOutputDirectory}/`);

  return { ok: true, logs: log.logs, outputDir };
}

async function directoryByteSize(dir: string): Promise<number> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });

  let total = 0;

  for (const entry of entries) {
    const child = join(dir, entry.name);
    const info = await lstat(child);

    if (info.isDirectory()) {
      total += await directoryByteSize(child);
    } else if (info.isFile()) {
      total += info.size;
    } else {
      throw unsafeStaticArtifactEntry(relative(dir, child));
    }
  }

  return total;
}

/**
 * Copy `<outputDir>/**` into the per-deployment snapshot directory and
 * rewrite root-absolute asset URLs in `index.html` so the bundle works when
 * served under `/static-deployments/<id>/...`. Returns the rewritten
 * `index.html` path for callers that want to surface it in logs.
 */
export async function snapshotStaticBuild(deploymentId: string, outputDir: string, guard?: () => Promise<void>) {
  return withStaticDeploymentStorageLock(deploymentId, async () => {
    await guard?.();
    const target = staticDeploymentSnapshotDir(deploymentId);

    /* Validate before cp so index.html can never be a followed symlink. */
    await computeSnapshotDirectoryDigest(outputDir);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(outputDir, target, { recursive: true });
    await computeSnapshotDirectoryDigest(target);

    const indexHtmlPath = join(target, 'index.html');

    if (await pathExists(indexHtmlPath)) {
      const original = await readFile(indexHtmlPath, 'utf8');

      /*
       * BUG-DEPLOY-LIVE. The prefix rewrite below only makes sense for the LEGACY
       * path-based serving mode (`<api>/static-deployments/<id>/...`). When a
       * dedicated origin exists (PREVIEW_DOMAIN set — i.e. production and every
       * real deployment), the snapshot is served at the ROOT of
       * `s-<id>.preview.<domain>`, so a rewritten `/static-deployments/<id>/assets/x.js`
       * is looked up as a file INSIDE the snapshot and 404s
       * (`STATIC_DEPLOY_FILE_NOT_FOUND`) — the document loads but every asset
       * fails, leaving `<div id="root">` empty: a blank deployed app.
       *
       * The legacy path keeps working either way: that route 302-redirects to the
       * dedicated origin whenever one exists, so the prefix is never needed there.
       */
      const rewritten = staticDeployDedicatedOrigin(deploymentId)
        ? original
        : rewriteHtmlAbsoluteUrls(original, `/static-deployments/${deploymentId}/`);

      if (rewritten !== original) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(indexHtmlPath, rewritten, 'utf8');
      }

      return indexHtmlPath;
    }

    return undefined;
  });
}

/**
 * Rewrite root-absolute asset paths (`/foo.js`, `/assets/main.css`) inside
 * an HTML document to be prefixed by the deployment base path so they
 * resolve when served under `/static-deployments/<id>/`. We leave
 * protocol-relative (`//cdn.example.com/x`) and absolute URLs
 * (`https://...`) untouched, and never touch query strings or anchor links.
 *
 * This is a string-level rewrite (no DOM parsing) which keeps the
 * server-side serve path zero-dependency. The grammar of `attr="value"`
 * for href/src/srcset in a Vite-emitted index.html is stable enough to
 * pattern-match safely.
 */
export function rewriteHtmlAbsoluteUrls(html: string, basePath: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

  const rewriteAttribute = (source: string, attribute: 'href' | 'src' | 'srcset') => {
    const pattern = new RegExp(`(\\s${attribute}\\s*=\\s*)("|')([^"']+)\\2`, 'gi');

    return source.replace(pattern, (_match, prefix, quote, value) => {
      if (attribute === 'srcset') {
        const rewritten = value
          .split(',')
          .map((part: string) => {
            const trimmed = part.trim();

            if (!trimmed) {
              return part;
            }

            const [url, ...descriptor] = trimmed.split(/\s+/);
            const newUrl = rewriteUrl(url, normalizedBase);

            return descriptor.length ? `${newUrl} ${descriptor.join(' ')}` : newUrl;
          })
          .join(', ');

        return `${prefix}${quote}${rewritten}${quote}`;
      }

      return `${prefix}${quote}${rewriteUrl(value, normalizedBase)}${quote}`;
    });
  };

  let result = html;

  result = rewriteAttribute(result, 'href');
  result = rewriteAttribute(result, 'src');
  result = rewriteAttribute(result, 'srcset');

  return result;
}

function rewriteUrl(value: string, normalizedBase: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) {
    return value;
  }

  if (value.startsWith(normalizedBase)) {
    return value;
  }

  return `${normalizedBase.replace(/\/$/, '')}${value}`;
}

export async function removeStaticDeploymentSnapshot(deploymentId: string) {
  return withStaticDeploymentStorageLock(deploymentId, async () => {
    const target = staticDeploymentSnapshotDir(deploymentId);
    await rm(target, { recursive: true, force: true });
  });
}

function unsafeStaticArtifactEntry(path: string): Error {
  return Object.assign(new Error(appPublicEnglish('ROLLBACK_STATIC_ARTIFACT_UNSAFE_ENTRY')), {
    code: 'ROLLBACK_STATIC_ARTIFACT_UNSAFE_ENTRY',
    statusCode: 409,
    path,
  });
}

/** Recursively collect regular files only, never following special entries. */
async function walkFiles(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const child = join(dir, entry.name);
    const info = await lstat(child);

    if (info.isDirectory()) {
      await walkFiles(root, child, out);
    } else if (info.isFile()) {
      out.push(relative(root, child));
    } else {
      throw unsafeStaticArtifactEntry(relative(root, child));
    }
  }
}

async function computeSnapshotDirectoryDigest(root: string): Promise<string | undefined> {
  let rootInfo;

  try {
    rootInfo = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }

  if (!rootInfo.isDirectory()) throw unsafeStaticArtifactEntry('.');

  const files: string[] = [];
  await walkFiles(root, root, files);
  const entries: SnapshotEntry[] = [];

  for (const rel of files) {
    const bytes = await readFile(join(root, rel));
    entries.push({
      path: rel.split(sep).join('/'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }

  return hashSnapshotEntries(entries);
}

/**
 * P0-V3-08: deterministic content digest of a static snapshot directory. Hashes
 * every file's bytes, binds it to its relative path, and folds the sorted set into
 * one `sha256:…` (see hashSnapshotEntries). This is the manifest's `artifactDigest`
 * for static releases — recomputing it at rollback time and comparing proves the
 * restored bytes are byte-identical to what was published (no blind rollback).
 * Returns undefined if the directory is missing (nothing to hash).
 */
export async function computeStaticSnapshotDigest(deploymentId: string): Promise<string | undefined> {
  return computeSnapshotDirectoryDigest(staticDeploymentSnapshotDir(deploymentId));
}

export async function computeStaticArtifactDigest(artifactRef: string): Promise<string | undefined> {
  return computeSnapshotDirectoryDigest(staticDeploymentArtifactDir(artifactRef));
}

/**
 * Copy one published snapshot into an immutable content-addressed retention
 * directory. Existing bytes are always re-hashed; a collision/tamper refuses
 * publication instead of overwriting the retained rollback target.
 */
async function retainStaticSnapshotArtifactLocked(deploymentId: string, expectedDigest: string): Promise<string> {
  const artifactRef = staticDeploymentArtifactRef(expectedDigest);
  const source = staticDeploymentSnapshotDir(deploymentId);
  const sourceDigest = await computeSnapshotDirectoryDigest(source);

  if (sourceDigest !== expectedDigest) {
    throw Object.assign(new Error(appPublicEnglish('ROLLBACK_ARTIFACT_DIGEST_MISMATCH')), {
      code: 'ROLLBACK_ARTIFACT_DIGEST_MISMATCH',
      statusCode: 409,
    });
  }

  const target = staticDeploymentArtifactDir(artifactRef);
  const retainedDigest = await computeSnapshotDirectoryDigest(target);

  if (retainedDigest !== undefined) {
    if (retainedDigest !== expectedDigest) {
      throw Object.assign(new Error(appPublicEnglish('ROLLBACK_ARTIFACT_DIGEST_MISMATCH')), {
        code: 'ROLLBACK_ARTIFACT_DIGEST_MISMATCH',
        statusCode: 409,
      });
    }
    return artifactRef;
  }

  await mkdir(join(staticDeploymentStorageRoot(), '.artifacts', 'sha256'), { recursive: true });
  const temporary = `${target}.tmp-${randomUUID()}`;

  try {
    await cp(source, temporary, { recursive: true, errorOnExist: true });

    if ((await computeSnapshotDirectoryDigest(temporary)) !== expectedDigest) {
      throw Object.assign(new Error(appPublicEnglish('ROLLBACK_ARTIFACT_DIGEST_MISMATCH')), {
        code: 'ROLLBACK_ARTIFACT_DIGEST_MISMATCH',
        statusCode: 409,
      });
    }

    await rename(temporary, target);
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
  }

  return artifactRef;
}

export async function retainStaticSnapshotArtifact(deploymentId: string, expectedDigest: string): Promise<string> {
  const artifactDigest = expectedDigest.replace(/^sha256:/u, '');

  return withStaticDeploymentStorageLocks([deploymentId, artifactDigest], () =>
    retainStaticSnapshotArtifactLocked(deploymentId, expectedDigest),
  );
}

/**
 * Keep the content-digest lock through the caller's durable manifest append.
 * GC takes the same lock, so it cannot observe the retained bytes in the gap
 * before the ReleaseManifest reference commits.
 */
export async function withRetainedStaticSnapshotArtifact<T>(
  deploymentId: string,
  expectedDigest: string,
  commit: (artifactRef: string) => Promise<T>,
): Promise<T> {
  const artifactDigest = expectedDigest.replace(/^sha256:/u, '');

  return withStaticDeploymentStorageLocks([deploymentId, artifactDigest], async () => {
    const artifactRef = await retainStaticSnapshotArtifactLocked(deploymentId, expectedDigest);

    if ((await computeSnapshotDirectoryDigest(staticDeploymentArtifactDir(artifactRef))) !== expectedDigest) {
      throw Object.assign(new Error(appPublicEnglish('ROLLBACK_ARTIFACT_DIGEST_MISMATCH')), {
        code: 'ROLLBACK_ARTIFACT_DIGEST_MISMATCH',
        statusCode: 409,
      });
    }

    return commit(artifactRef);
  });
}

/** Restore retained content by manifest reference, without a Deployment row. */
export async function restoreStaticArtifactInto(
  artifactRef: string,
  expectedDigest: string,
  toDeploymentId: string,
  guard?: () => Promise<void>,
): Promise<{ indexHtmlPath?: string }> {
  const artifactDigest = STATIC_ARTIFACT_REF.exec(artifactRef)?.[1];

  if (!artifactDigest) {
    throw Object.assign(
      new Error(appPublicEnglish('ROLLBACK_STATIC_SNAPSHOT_MISSING', { deploymentId: artifactRef })),
      {
        code: 'ROLLBACK_STATIC_ARTIFACT_REF_INVALID',
        statusCode: 409,
      },
    );
  }

  return withStaticDeploymentStorageLocks([artifactDigest, toDeploymentId], async () => {
    await guard?.();
    const source = staticDeploymentArtifactDir(artifactRef);

    if ((await computeSnapshotDirectoryDigest(source)) !== expectedDigest) {
      throw Object.assign(new Error(appPublicEnglish('ROLLBACK_ARTIFACT_DIGEST_MISMATCH')), {
        code: 'ROLLBACK_ARTIFACT_DIGEST_MISMATCH',
        statusCode: 409,
      });
    }

    const target = staticDeploymentSnapshotDir(toDeploymentId);
    await guard?.();
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true });
    await guard?.();

    if ((await computeSnapshotDirectoryDigest(target)) !== expectedDigest) {
      throw Object.assign(new Error(appPublicEnglish('ROLLBACK_ARTIFACT_DIGEST_MISMATCH')), {
        code: 'ROLLBACK_ARTIFACT_DIGEST_MISMATCH',
        statusCode: 409,
      });
    }

    const indexHtmlPath = join(target, 'index.html');

    if (!(await pathExists(indexHtmlPath))) return {};

    return { indexHtmlPath };
  });
}

function staticDeploymentRoutingAliasPath(deploymentId: string): string {
  return join(staticDeploymentStorageRoot(), '.aliases', deploymentId);
}

const SAFE_STATIC_DEPLOYMENT_ALIAS_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function assertStaticDeploymentRoutingAliasId(deploymentId: string): void {
  if (!SAFE_STATIC_DEPLOYMENT_ALIAS_ID.test(deploymentId)) {
    throw Object.assign(new Error(appPublicEnglish('ROLLBACK_STATIC_SNAPSHOT_MISSING', { deploymentId })), {
      code: 'ROLLBACK_STATIC_ALIAS_INVALID',
      statusCode: 409,
    });
  }
}

/**
 * Keep legacy path-prefixed assets working without rewriting retained bytes.
 * The alias is written before release commit and resolves only through the
 * target Deployment's READY/access-policy gates in the HTTP route.
 */
export async function writeStaticDeploymentRoutingAlias(
  fromDeploymentId: string,
  toDeploymentId: string,
  guard?: () => Promise<void>,
): Promise<void> {
  assertStaticDeploymentRoutingAliasId(fromDeploymentId);
  assertStaticDeploymentRoutingAliasId(toDeploymentId);

  if (fromDeploymentId === toDeploymentId) {
    throw Object.assign(
      new Error(appPublicEnglish('ROLLBACK_STATIC_SNAPSHOT_MISSING', { deploymentId: fromDeploymentId })),
      { code: 'ROLLBACK_STATIC_ALIAS_INVALID', statusCode: 409 },
    );
  }

  await withStaticDeploymentStorageLocks([fromDeploymentId, toDeploymentId], async () => {
    await guard?.();
    const root = join(staticDeploymentStorageRoot(), '.aliases');
    const target = staticDeploymentRoutingAliasPath(fromDeploymentId);
    const temporary = `${target}.tmp-${randomUUID()}`;
    await mkdir(root, { recursive: true });

    try {
      await writeFile(temporary, `${toDeploymentId}\n`, { encoding: 'utf8', mode: 0o600 });
      await guard?.();
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  });
}

/**
 * Resolve a bounded routing-alias chain under the cross-replica filesystem
 * locks. Consecutive rollbacks can retain the same immutable HTML, whose URLs
 * still name the first pruned deployment; following the chain makes that old
 * id resolve to the newest READY target without changing a single byte.
 *
 * `undefined` means that the requested id has no alias. `null` means a corrupt,
 * cyclic or overlong chain and callers must fail closed rather than fall back to
 * a possibly mutable source snapshot.
 */
export async function resolveStaticDeploymentRoutingAlias(
  deploymentId: string,
): Promise<
  | { targetDeploymentId: string; edges: Array<{ sourceDeploymentId: string; targetDeploymentId: string }> }
  | null
  | undefined
> {
  assertStaticDeploymentRoutingAliasId(deploymentId);
  const visited = new Set([deploymentId]);
  const edges: Array<{ sourceDeploymentId: string; targetDeploymentId: string }> = [];
  let current = deploymentId;

  for (let depth = 0; depth < 32; depth += 1) {
    const rawTarget = await withStaticDeploymentStorageLock(current, async () => {
      const path = staticDeploymentRoutingAliasPath(current);
      const metadata = await lstat(path).catch((error: unknown) =>
        (error as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : null,
      );

      if (metadata === undefined) return undefined;
      if (!metadata || !metadata.isFile() || metadata.isSymbolicLink()) return null;

      return readFile(path, 'utf8').catch(() => null);
    });

    if (rawTarget === undefined) {
      return current === deploymentId ? undefined : { targetDeploymentId: current, edges };
    }

    if (rawTarget === null) return null;

    const target = rawTarget.trim();

    if (!SAFE_STATIC_DEPLOYMENT_ALIAS_ID.test(target) || visited.has(target)) {
      return null;
    }

    edges.push({ sourceDeploymentId: current, targetDeploymentId: target });
    visited.add(target);
    current = target;
  }

  return null;
}

/** Remove only the alias owned by this rollback attempt. */
export async function removeStaticDeploymentRoutingAlias(
  fromDeploymentId: string,
  expectedToDeploymentId: string,
): Promise<void> {
  assertStaticDeploymentRoutingAliasId(fromDeploymentId);
  assertStaticDeploymentRoutingAliasId(expectedToDeploymentId);

  await withStaticDeploymentStorageLocks([fromDeploymentId, expectedToDeploymentId], async () => {
    const target = staticDeploymentRoutingAliasPath(fromDeploymentId);
    const current = await readFile(target, 'utf8').catch(() => undefined);

    if (current?.trim() === expectedToDeploymentId) {
      await rm(target, { force: true });
    }
  });
}

/**
 * Delete only content-addressed artifacts that the durable store confirms are
 * unreferenced. The callback is re-run while the per-digest lock is held, so a
 * concurrent ReleaseManifest append wins retention rather than racing GC. A
 * Production injects the store-backed keyset claim. It advances before any
 * filesystem IO, outside deletion locks/transactions; per-digest retention is
 * still rechecked under the filesystem lock before rm.
 */
export async function garbageCollectStaticArtifacts(
  isRetainedByReleaseManifest: (artifactRef: string) => Promise<boolean>,
  options: {
    maxArtifacts?: number;
    advanceCursor?: (input: { rootIdentity: string; sortedDigests: string[]; limit: number }) => Promise<string[]>;
  } = {},
): Promise<{ removed: string[]; retained: string[] }> {
  const root = join(staticDeploymentStorageRoot(), '.artifacts', 'sha256');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const maxArtifacts = options.maxArtifacts ?? 100;

  if (!Number.isSafeInteger(maxArtifacts) || maxArtifacts < 1 || maxArtifacts > 10_000) {
    throw new TypeError('STATIC_ARTIFACT_GC_LIMIT_INVALID');
  }

  const removed: string[] = [];
  const retained: string[] = [];
  const candidates = entries
    .filter((candidate) => candidate.isDirectory() && /^[a-f0-9]{64}$/u.test(candidate.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const candidateByDigest = new Map(candidates.map((entry) => [entry.name, entry]));
  const claimedDigests = options.advanceCursor
    ? await options.advanceCursor({
        rootIdentity: createHash('sha256').update(root, 'utf8').digest('hex'),
        sortedDigests: candidates.map((entry) => entry.name),
        limit: maxArtifacts,
      })
    : candidates.slice(0, maxArtifacts).map((entry) => entry.name);

  if (
    claimedDigests.length > maxArtifacts ||
    new Set(claimedDigests).size !== claimedDigests.length ||
    claimedDigests.some((digest) => !candidateByDigest.has(digest))
  ) {
    throw new TypeError('STATIC_ARTIFACT_GC_CURSOR_RESULT_INVALID');
  }

  for (const digest of claimedDigests) {
    const entry = candidateByDigest.get(digest)!;
    const artifactRef = `static-artifacts/sha256/${entry.name}`;

    await withStaticDeploymentStorageLock(entry.name, async () => {
      if (await isRetainedByReleaseManifest(artifactRef)) {
        retained.push(artifactRef);
        return;
      }

      await rm(staticDeploymentArtifactDir(artifactRef), { recursive: true, force: true });
      removed.push(artifactRef);
    });
  }

  return { removed, retained };
}

/**
 * Re-materialise a previous release's static snapshot into a NEW deployment's
 * snapshot dir so the rollback serves the old bytes under its own id/URL. Copies
 * from the retained source snapshot; throws SNAPSHOT_SOURCE_MISSING if the source
 * bytes are gone (the caller turns that into a fail-closed 409 — never a rollback
 * that serves an empty dir). The copy is byte-identical: URL compatibility is
 * implemented by the validated routing alias, never by rewriting release bytes.
 */
export async function restoreStaticSnapshotInto(
  fromDeploymentId: string,
  toDeploymentId: string,
  guard?: () => Promise<void>,
): Promise<{ indexHtmlPath?: string }> {
  return withStaticDeploymentStorageLocks([fromDeploymentId, toDeploymentId], async () => {
    await guard?.();
    const source = staticDeploymentSnapshotDir(fromDeploymentId);

    if (!(await pathExists(source))) {
      throw Object.assign(
        new Error(appPublicEnglish('ROLLBACK_STATIC_SNAPSHOT_MISSING', { deploymentId: fromDeploymentId })),
        {
          statusCode: 409,
          code: 'ROLLBACK_SNAPSHOT_SOURCE_MISSING',
        },
      );
    }

    const target = staticDeploymentSnapshotDir(toDeploymentId);
    await guard?.();
    await rm(target, { recursive: true, force: true });
    await guard?.();
    await mkdir(target, { recursive: true });
    await guard?.();
    await cp(source, target, { recursive: true });
    await guard?.();

    const indexHtmlPath = join(target, 'index.html');

    if (await pathExists(indexHtmlPath)) return { indexHtmlPath };

    return {};
  });
}

export function createDeploymentLogs(
  input: CreateDeploymentRequest,
  deployment: DeploymentRecord,
  project: ProjectRecord,
) {
  const framework = deployment.framework ?? detectFramework(input);

  const envSummary = Object.keys(input.envVars)
    .map((key) => `${key}=${redactDeploymentValue(key, input.envVars[key])}`)
    .join(', ');

  const baseLogs = [
    `Queued ${deployment.provider} deployment for ${project.name}`,
    `Environment: ${deployment.environment}`,
    `Framework detected: ${framework}`,
    `Build command: ${input.buildCommand}`,
    `Output directory: ${sanitizeDeploymentPath(input.outputDirectory)}`,
    envSummary ? `Environment variables: ${envSummary}` : 'Environment variables: none',
    input.injectSecrets.length
      ? `Injected user-scoped secrets: ${input.injectSecrets.join(', ')}`
      : 'Injected user-scoped secrets: none',
  ];

  if (deployment.provider === 'google-cloud-run') {
    baseLogs.push('Cloud Run: created source artifact from workspace');
    baseLogs.push('Cloud Run: pushed image to isolated artifact registry');
    baseLogs.push('Cloud Run: deployed service without platform secrets');
  } else if (deployment.provider === 'static') {
    baseLogs.push('Static export: uploaded immutable artifact bundle');
  } else if (deployment.provider === 'server') {
    /*
     * NO fabricated lines here (BUG-DEPLOY-001): the server pipeline appends
     * its REAL steps as they happen (revision, isolated build, image, apply,
     * readiness). Logging "applied … / Deployment ready: <url>" at queue time
     * made a deploy whose build later FAILED read as live, with a "ready" URL
     * that 502s.
     */
  } else {
    baseLogs.push(`${deployment.provider}: provider deployment created through scoped integration`);
  }

  /*
   * Same lie for server deploys: readiness is logged by the pipeline when the
   * Deployment really answers, never at queue time.
   *
   * 2026-08-17: `static` had exactly the same problem and was still exempt. Its
   * pipeline installs and builds inside the workspace pod AFTER queueing, so a
   * deploy that then died on `npm install` had already announced
   * "Déploiement ready: https://s-…/" in its own log — an address that serves
   * nothing. Measured live on two consecutive failed deploys. A provider that
   * still has work to do cannot report readiness up front.
   */
  if (deployment.provider !== 'server' && deployment.provider !== 'static') {
    baseLogs.push(
      `Deployment ready: ${deployment.url ?? deployment.previewUrl ?? deployment.productionUrl ?? 'pending URL'}`,
    );
  }

  /*
   * Stamp the summary block with the QUEUE time, not "now". These lines describe
   * what was decided when the deploy was queued, but they are persisted at the
   * END of the pipeline — stamping them with the current clock pushed them past
   * every real build line, so the Logs panel (which renders the array as stored)
   * opened with the outcome and buried the build underneath it. Proven live
   * 2026-08-06: "Deployment ready: …" at 14:42:44 listed above "[install] up to
   * date" at 14:42:43.
   */
  const queuedAt = deployment.startedAt ?? deployment.createdAt ?? new Date().toISOString();

  return baseLogs.map((message) => ({
    timestamp: queuedAt,
    level: 'info' as const,
    message: redactDeploymentLog(message, input.envVars),
  }));
}

/*
 * ---------------------------------------------------------------------------
 * LAUNCH-BLOCKER (2026-08-01): a deployed static app rendered BLANK for
 * anonymous visitors.
 *
 * Measured cause: the public artifact route is served from the SAME origin as
 * the authenticated API (`STATIC_DEPLOY_BASE_URL` unset ⇒ fallback
 * `PUBLIC_API_BASE_URL` = https://api.e-code.ai), which forces a hard
 * `Content-Security-Policy: sandbox` WITHOUT `allow-same-origin` to strip the
 * ambient cookie authority. That puts the document in an OPAQUE origin, where
 * `localStorage`/`sessionStorage` throw SecurityError — every SPA that touches
 * storage during boot dies before painting, leaving `#root` empty. Reproduced
 * in a real browser with the exact prod headers: opaque ⇒ SecurityError + empty
 * root; with `allow-same-origin` ⇒ the app renders.
 *
 * Fix: give each deployment its OWN origin `s-<deploymentId>.<previewDomain>`
 * (the same shape the server deploys already use with `d-<id>`). The session
 * cookie is host-only on the API host (verified live: `Path=/; Secure;
 * HttpOnly; SameSite=Lax`, no Domain) and CORS is a strict allowlist, so a
 * different origin carries NO ambient authority — the sandbox can then keep
 * `allow-same-origin` (storage works) while cross-origin isolation is what
 * actually protects the API.
 */

/** Host label prefix for a static deployment's dedicated origin. */
export const STATIC_DEPLOY_HOST_PREFIX = 's-';

/**
 * Dedicated public origin of a static deployment, e.g.
 * `https://s-<deploymentId>.preview.e-code.ai`. Returns null when no preview
 * domain is configured (local dev / tests), so callers fall back to the legacy
 * same-origin URL instead of emitting a broken host.
 */
export function staticDeployDedicatedOrigin(deploymentId: string): string | null {
  const domain = process.env.PREVIEW_DOMAIN?.trim().replace(/^\.+|\.+$/g, '');

  if (!domain || !/^[a-z0-9]{6,}$/i.test(deploymentId)) {
    return null;
  }

  return `https://${STATIC_DEPLOY_HOST_PREFIX}${deploymentId.toLowerCase()}.${domain.toLowerCase()}`;
}

/**
 * True when the incoming Host is the deployment's dedicated origin. The Host a
 * browser sends is derived from the URL it navigated to and cannot be forged by
 * page JS, so this is a safe signal for relaxing the sandbox: a document loaded
 * from the API origin always reports the API host and therefore stays opaque.
 */
export function isDedicatedStaticDeployHost(
  hostHeader: string | undefined,
  deploymentId: string,
  forwardedHost?: string | undefined,
): boolean {
  const origin = staticDeployDedicatedOrigin(deploymentId);

  /*
   * The preview-proxy reaches this route over the in-cluster Service, so the
   * literal Host is the internal name; it forwards the PUBLIC host as
   * `x-forwarded-host`. Neither header can be set by page JS on a top-level
   * navigation, so a document loaded from the API origin can never claim the
   * dedicated host and thus never obtains `allow-same-origin`.
   */
  const candidate = (forwardedHost ?? hostHeader ?? '').split(',')[0];

  if (!origin || !candidate) {
    return false;
  }

  return candidate.split(':')[0].trim().toLowerCase() === new URL(origin).hostname;
}
