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

  return output.replace(/(sk|ghp|glpat|xox[baprs]|ya29|AIza)[A-Za-z0-9_\-]{12,}/g, '[REDACTED]');
}

export function sanitizeDeploymentPath(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');

  if (!normalized || normalized.includes('..') || normalized.startsWith('~')) {
    throw Object.assign(new Error('Invalid deployment path'), { statusCode: 400, code: 'INVALID_DEPLOYMENT_PATH' });
  }

  return normalized;
}

export function assertDeploymentRequestAllowed(input: CreateDeploymentRequest, planKey: string) {
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

  sanitizeDeploymentPath(input.outputDirectory);
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
