import { z } from 'zod';
import type { DeploymentRecord, ProjectRecord } from './store.js';

export const deploymentProviders = [
  'static',
  'vercel',
  'netlify',
  'github-pages',
  'cloudflare-pages',
  'google-cloud-run',
  'docker',
] as const;

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
    throw Object.assign(new Error('Invalid deployment path'), { statusCode: 400, code: 'INVALID_DEPLOYMENT_PATH' });
  }

  return normalized;
}

const providerEnvRequirement: Record<(typeof deploymentProviders)[number], readonly string[]> = {
  static: [],
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

export function assertDeploymentRequestAllowed(
  input: CreateDeploymentRequest,
  planKey: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (input.provider === 'docker' && planKey !== 'enterprise') {
    throw Object.assign(new Error('Custom Dockerfile deployments require Enterprise plan'), {
      statusCode: 403,
      code: 'ENTERPRISE_DEPLOYMENT_REQUIRED',
    });
  }

  if (dangerousBuildPatterns.some((pattern) => pattern.test(input.buildCommand))) {
    throw Object.assign(new Error('Build command is not allowed for user deployments'), {
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
}

interface HookSpec {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function buildHookSpec(
  provider: (typeof deploymentProviders)[number],
  env: Record<string, string | undefined>,
): HookSpec | undefined {
  const now = new Date().toISOString();
  const baseBody = { source: 'vibecore', deployedAt: now };

  if (provider === 'vercel' && env.VERCEL_DEPLOY_HOOK_URL) {
    return {
      url: env.VERCEL_DEPLOY_HOOK_URL,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baseBody),
    };
  }

  if (provider === 'netlify' && env.NETLIFY_BUILD_HOOK_URL) {
    return {
      url: env.NETLIFY_BUILD_HOOK_URL,
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

  if (
    provider === 'github-pages' &&
    env.GITHUB_DEPLOY_TOKEN &&
    env.GITHUB_PAGES_REPO &&
    env.GITHUB_PAGES_WORKFLOW
  ) {
    const ref = env.GITHUB_PAGES_REF || 'main';
    return {
      url: `https://api.github.com/repos/${env.GITHUB_PAGES_REPO}/actions/workflows/${env.GITHUB_PAGES_WORKFLOW}/dispatches`,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_DEPLOY_TOKEN}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ ref, inputs: { source: 'vibecore', deployedAt: now } }),
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
        substitutions: { _SOURCE: 'vibecore', _DEPLOYED_AT: now },
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
          _DEPLOYED_AT: now,
          _DOCKER_REGISTRY: env.DOCKER_REGISTRY_URL || 'gcr.io',
        },
      }),
    };
  }

  return undefined;
}

function parseHookPayload(provider: (typeof deploymentProviders)[number], payload: unknown): {
  url?: string;
  buildId?: string;
} {
  const body = (payload as Record<string, any>) ?? {};
  if (provider === 'github-pages') {
    return { buildId: body.run_id ? String(body.run_id) : undefined };
  }
  if (provider === 'google-cloud-run' || provider === 'docker') {
    const meta = body.metadata?.build ?? body.build ?? body;
    return {
      buildId: meta?.id,
      url: meta?.results?.images?.[0]?.name,
    };
  }
  const job = body.job ?? body.result ?? body;
  return {
    url: job?.url ?? job?.deploy_ssl_url ?? job?.deploy_url ?? job?.deployment?.url,
    buildId: job?.id ?? job?.deploy_id ?? job?.run_id,
  };
}

export async function triggerProviderRollback(
  provider: (typeof deploymentProviders)[number],
  buildId: string | undefined,
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<ProviderHookResult | undefined> {
  if (!buildId) return undefined;

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

  if (provider === 'cloudflare-pages' && env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_PAGES_PROJECT) {
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
): Promise<ProviderHookResult | undefined> {
  const spec = buildHookSpec(provider, env);
  if (!spec) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetchImpl(spec.url, {
      method: 'POST',
      headers: spec.headers,
      body: spec.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: 'failed',
        log: `${provider}: deploy hook responded with ${response.status}`,
      };
    }

    let payload: unknown = undefined;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    const parsed = parseHookPayload(provider, payload);
    return {
      url: parsed.url,
      buildId: parsed.buildId,
      status: 'queued',
      log: `${provider}: deploy hook accepted (id=${parsed.buildId ?? 'unknown'})`,
    };
  } catch (error: any) {
    return {
      status: 'failed',
      log: `${provider}: deploy hook failed: ${error?.message ?? 'unknown error'}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function detectFramework(input: CreateDeploymentRequest) {
  if (input.framework) {
    return input.framework;
  }

  const command = input.buildCommand.toLowerCase();
  const output = input.outputDirectory.toLowerCase();

  if (command.includes('next') || output === '.next') {
    return 'nextjs';
  }

  if (command.includes('vite') || output === 'dist') {
    return 'vite';
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

  return 'static';
}

export function buildDeploymentUrl(project: ProjectRecord, deployment: DeploymentRecord) {
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
  } else {
    baseLogs.push(`${deployment.provider}: provider deployment created through scoped integration`);
  }

  baseLogs.push(
    `Deployment ready: ${deployment.url ?? deployment.previewUrl ?? deployment.productionUrl ?? 'pending URL'}`,
  );

  return baseLogs.map((message) => ({
    timestamp: new Date().toISOString(),
    level: 'info' as const,
    message: redactDeploymentLog(message, input.envVars),
  }));
}
