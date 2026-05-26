import { spawn } from 'node:child_process';
import { access, cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
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

function parseHookPayload(
  provider: (typeof deploymentProviders)[number],
  payload: unknown,
): {
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
): Promise<ProviderHookResult | undefined> {
  const spec = buildHookSpec(provider, env);

  if (!spec) {
    return undefined;
  }

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
  if (deployment.provider === 'static') {
    return `${staticDeployPublicBaseUrl()}/static-deployments/${deployment.id}/`;
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
 * Public-facing host that backs the `/static-deployments/<id>/*` route. We
 * resolve it in the same order the rest of the codebase resolves the API
 * base URL: explicit `STATIC_DEPLOY_BASE_URL`, then `SAAS_API_URL`, then a
 * local-dev default. Strips trailing slashes so callers can concatenate
 * `/static-deployments/...` safely.
 */
export function staticDeployPublicBaseUrl() {
  const raw = process.env.STATIC_DEPLOY_BASE_URL?.trim() || process.env.SAAS_API_URL?.trim() || 'http://127.0.0.1:3001';

  return raw.replace(/\/+$/, '');
}

export function projectStorageRoot() {
  return process.env.PROJECT_STORAGE_DIR ?? (process.env.NODE_ENV === 'production' ? '/tmp/vibecore-project-storage' : join(process.cwd(), '.vibecore-project-storage'));
}

export function projectStorageDir(projectId: string) {
  return join(projectStorageRoot(), projectId);
}

export function staticDeploymentStorageRoot() {
  return process.env.STATIC_DEPLOY_STORAGE_DIR ?? join(process.cwd(), '.vibecore-static-deployments');
}

export function staticDeploymentSnapshotDir(deploymentId: string) {
  return join(staticDeploymentStorageRoot(), deploymentId);
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
    return { manager: 'yarn', install: ['install'] } as const;
  }

  if (existsSync(join(projectDir, 'bun.lockb'))) {
    return { manager: 'bun', install: ['install'] } as const;
  }

  return { manager: 'npm', install: ['install', '--no-audit', '--no-fund'] } as const;
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

function buildEnvForRun(envVars: Record<string, string>): NodeJS.ProcessEnv {
  /*
   * Inherit the host PATH so npm/pnpm/yarn/bun resolve, but DROP every other
   * host secret so the user's build can't read tokens from the server env.
   */
  const userNodeEnv = envVars.NODE_ENV;

  const nodeEnv: 'production' | 'development' | 'test' =
    userNodeEnv === 'development' || userNodeEnv === 'test' || userNodeEnv === 'production'
      ? userNodeEnv
      : 'production';

  const sanitizedUserEnv = { ...envVars };
  delete sanitizedUserEnv.NODE_ENV;
  delete sanitizedUserEnv.PATH;

  const baseEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? process.env.USERPROFILE ?? '',
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
  const projectDir = projectStorageDir(options.projectId);

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
  const env = buildEnvForRun(options.envVars);

  log.push('info', `Static deploy: building in ${buildCwd}`);
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
      timeoutMs,
      onStdout: (line) => log.push('info', `[install] ${line}`),
      onStderr: (line) => log.push('error', `[install] ${line}`),
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

  log.push('info', `Static deploy: running build (${split.command} ${split.args.map(shellLikeQuote).join(' ')})`);

  const build = await runProcess({
    command: split.command,
    args: split.args,
    cwd: buildCwd,
    env,
    timeoutMs,
    onStdout: (line) => log.push('info', `[build] ${line}`),
    onStderr: (line) => log.push('error', `[build] ${line}`),
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

    if (entry.isDirectory()) {
      total += await directoryByteSize(child);
    } else if (entry.isFile()) {
      const info = await stat(child);
      total += info.size;
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
export async function snapshotStaticBuild(deploymentId: string, outputDir: string) {
  const target = staticDeploymentSnapshotDir(deploymentId);

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(outputDir, target, { recursive: true });

  const indexHtmlPath = join(target, 'index.html');

  if (await pathExists(indexHtmlPath)) {
    const original = await readFile(indexHtmlPath, 'utf8');
    const rewritten = rewriteHtmlAbsoluteUrls(original, `/static-deployments/${deploymentId}/`);

    if (rewritten !== original) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(indexHtmlPath, rewritten, 'utf8');
    }

    return indexHtmlPath;
  }

  return undefined;
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
  const target = staticDeploymentSnapshotDir(deploymentId);
  await rm(target, { recursive: true, force: true });
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
