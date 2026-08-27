#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const root = process.cwd();
const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];
const args = new Set(process.argv.slice(2));
const loadDotenv = !args.has('--no-dotenv') && process.env.VALIDATE_PRODUCTION_NO_DOTENV !== '1';

if (loadDotenv) {
  for (const file of envFiles) {
    const path = resolve(root, file);

    if (existsSync(path)) {
      dotenv.config({ path, override: false });
    }
  }
}

const strict = args.has('--strict') || process.env.VALIDATE_PRODUCTION === '1' || process.env.NODE_ENV === 'production';
const json = args.has('--json');
const live = args.has('--live') || process.env.VALIDATE_EXTERNAL_CONNECTIVITY === '1';

const placeholderPatterns = [
  /change[-_ ]?me/i,
  /^dev[-_]/i,
  /[-_]dev$/i,
  /^test[-_]/i,
  /[-_]test$/i,
  /example/i,
  /placeholder/i,
  /dummy/i,
  /fake/i,
  /mock/i,
  /localhost/i,
  /127\.0\.0\.1/,
  /\.local\b/i,
];

const httpsRequired = new Set([
  'GOOGLE_REDIRECT_URI',
  'GITHUB_REDIRECT_URI',
  'OIDC_REDIRECT_URI',
  'OIDC_ISSUER_URL',
  'OIDC_AUTHORIZATION_URL',
  'OIDC_TOKEN_URL',
  'OIDC_USERINFO_URL',
  'OIDC_JWKS_URL',
  'SAML_ENTITY_ID',
  'SAML_ACS_URL',
  'SAML_METADATA_URL',
  'EMAIL_HTTP_ENDPOINT',
  'SIEM_WEBHOOK_URL',
  'INCIDENT_WEBHOOK_URL',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'VERCEL_DEPLOY_HOOK_URL',
  'NETLIFY_BUILD_HOOK_URL',
  'CLOUDFLARE_DEPLOY_HOOK_URL',
  'CLOUD_RUN_BUILD_TRIGGER_URL',
  'DOCKER_BUILD_TRIGGER_URL',
  'VITE_RUNTIME_API_BASE_URL',
]);

const deploymentProviderRequirements = {
  static: [],
  vercel: ['VERCEL_DEPLOY_HOOK_URL'],
  netlify: ['NETLIFY_BUILD_HOOK_URL'],
  'cloudflare-pages': ['CLOUDFLARE_DEPLOY_HOOK_URL'],
  'github-pages': ['GITHUB_DEPLOY_TOKEN', 'GITHUB_PAGES_REPO', 'GITHUB_PAGES_WORKFLOW'],
  'google-cloud-run': ['CLOUD_RUN_BUILD_TRIGGER_URL', 'GCP_OAUTH_TOKEN'],
  docker: ['DOCKER_BUILD_TRIGGER_URL', 'GCP_OAUTH_TOKEN', 'DOCKER_REGISTRY_URL'],
};

const groups = [
  {
    id: 'google-oauth',
    label: 'Google OAuth',
    required: [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI',
      'GOOGLE_TOKEN_URL',
      'GOOGLE_USERINFO_URL',
    ],
    live: [{ kind: 'well-known', url: 'https://accounts.google.com/.well-known/openid-configuration' }],
  },
  {
    id: 'github-oauth',
    label: 'GitHub OAuth',
    required: [
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'GITHUB_REDIRECT_URI',
      'GITHUB_TOKEN_URL',
      'GITHUB_USERINFO_URL',
    ],
    live: [{ kind: 'head', url: 'https://github.com/login/oauth/authorize' }],
  },
  {
    id: 'entra-oidc',
    label: 'Microsoft Entra / OIDC',
    required: [
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_REDIRECT_URI',
      'OIDC_ISSUER_URL',
      'OIDC_AUTHORIZATION_URL',
      'OIDC_TOKEN_URL',
      'OIDC_USERINFO_URL',
      'OIDC_JWKS_URL',
    ],
    live: [{ kind: 'oidc-issuer', env: 'OIDC_ISSUER_URL' }],
  },
  {
    id: 'saml',
    label: 'SAML SSO',
    requiredAny: [
      ['SAML_ENTITY_ID', 'SAML_ACS_URL', 'SAML_SSO_URL', 'SAML_X509_CERTIFICATE'],
      ['SAML_ENTITY_ID', 'SAML_ACS_URL', 'SAML_METADATA_URL'],
    ],
    live: [{ kind: 'metadata', env: 'SAML_METADATA_URL', optional: true }],
  },
  {
    id: 'email',
    label: 'Transactional email',
    requiredAny: [
      ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'],
      ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'],
      ['EMAIL_HTTP_ENDPOINT', 'EMAIL_HTTP_TOKEN', 'EMAIL_FROM'],
    ],
    live: [{ kind: 'smtp', optional: true }],
  },
  {
    id: 'siem',
    label: 'SIEM export',
    required: ['SIEM_WEBHOOK_URL', 'SIEM_SIGNING_SECRET'],
    live: [{ kind: 'head-env', env: 'SIEM_WEBHOOK_URL' }],
  },
  {
    id: 'core-secrets',
    label: 'Core production secrets',
    required: [
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET',
      'COOKIE_SECRET',
      'CONFIG_ENCRYPTION_KEY',
      'WORKSPACE_AGENT_TOKEN_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ],
    live: [{ kind: 'stripe-account' }],
  },
  {
    id: 'workspace-sandbox',
    label: 'Workspace sandbox controls',
    custom: validateWorkspaceSandboxControls,
  },
  {
    id: 'runtime-mode',
    label: 'Runtime mode',
    required: [
      'VITE_RUNTIME_MODE',
      'VITE_RUNTIME_API_BASE_URL',
      'WORKSPACE_MANAGER_URL',
      'WORKSPACE_RUNTIME_NAMESPACE',
      'WORKSPACE_AGENT_IMAGE',
      'PREVIEW_PROXY_SHARED_SECRET',
      'PREVIEW_URL_TEMPLATE',
    ],
    custom: validateRuntimeMode,
  },
  {
    id: 'reserved-vm-payload-encryption',
    label: 'Reserved VM durable payload encryption',
    custom: validateReservedVmPayloadEncryption,
  },
  {
    id: 'stripe-catalog',
    label: 'Stripe catalog',
    required: [
      'STRIPE_FREE_PRODUCT_ID',
      'STRIPE_FREE_PRICE_ID',
      'STRIPE_PRO_PRODUCT_ID',
      'STRIPE_PRO_PRICE_ID',
      'STRIPE_TEAM_PRODUCT_ID',
      'STRIPE_TEAM_PRICE_ID',
      'STRIPE_ENTERPRISE_PRODUCT_ID',
      'STRIPE_ENTERPRISE_PRICE_ID',
    ],
  },
  {
    id: 'deploy-providers',
    label: 'Deployment providers',
    custom: validateDeploymentProviders,
  },
  {
    id: 'ai-providers',
    label: 'AI provider keys',
    requiredAny: [
      ['OPENAI_API_KEY'],
      ['ANTHROPIC_API_KEY'],
      ['GOOGLE_GEMINI_API_KEY'],
      ['OPENROUTER_API_KEY'],
      ['MISTRAL_API_KEY'],
      ['GROQ_API_KEY'],
      ['XAI_API_KEY'],
      ['OLLAMA_BASE_URL'],
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring and incident response',
    required: [
      'OTEL_SERVICE_NAME',
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'LOG_REDACTION_ENABLED',
      'SECURITY_CONTACT_EMAIL',
      'INCIDENT_WEBHOOK_URL',
    ],
  },
  {
    id: 'rotation-soc2',
    label: 'Rotation, retention and SOC2 evidence',
    required: [
      'SECRET_ROTATION_OWNER',
      'SECRET_ROTATION_CADENCE_DAYS',
      'AUDIT_RETENTION_DAYS',
      'SOC2_EVIDENCE_BUCKET',
      'BACKUP_ENCRYPTION_KEY',
      'PRODUCTION_RUNBOOK_OWNER',
    ],
  },
];

function valueOf(name) {
  return process.env[name]?.trim();
}

function isMissing(name) {
  return !valueOf(name);
}

function redacted(name) {
  const value = valueOf(name);

  if (!value) {
    return '<missing>';
  }

  if (value.length <= 8) {
    return '<set>';
  }

  return `${value.slice(0, 2)}...${value.slice(-2)}`;
}

function looksPlaceholder(name) {
  const value = valueOf(name);

  if (!value) {
    return false;
  }

  if (name.includes('URL') || name.includes('URI') || name === 'DATABASE_URL' || name === 'REDIS_URL') {
    try {
      const url = new URL(value);
      const hostValue = `${url.hostname}${url.pathname}`;
      return placeholderPatterns.some((pattern) => pattern.test(hostValue));
    } catch {
      return false;
    }
  }

  return placeholderPatterns.some((pattern) => pattern.test(value));
}

function validateUrl(name, problems) {
  const value = valueOf(name);

  if (!value || !httpsRequired.has(name)) {
    return;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'https:') {
      problems.push(`${name} must use https in production`);
    }
  } catch {
    problems.push(`${name} must be a valid URL`);
  }
}

function requireUrl(name, problems) {
  const value = valueOf(name);

  if (!value) {
    return undefined;
  }

  try {
    return new URL(value);
  } catch {
    problems.push(`${name} must be a valid URL`);
    return undefined;
  }
}

function validateScalar(name, problems) {
  if (isMissing(name)) {
    problems.push(`${name} is required`);
    return;
  }

  if (looksPlaceholder(name)) {
    problems.push(`${name} appears to be a local, development or placeholder value`);
  }

  validateUrl(name, problems);
}

function validateRequiredAny(options, problems) {
  const results = options.map((vars) => {
    const localProblems = [];

    for (const variable of vars) {
      validateScalar(variable, localProblems);
    }

    return { vars, localProblems };
  });

  if (results.some((result) => result.localProblems.length === 0)) {
    return;
  }

  const expected = options.map((vars) => vars.join(' + ')).join(' OR ');
  problems.push(`one complete provider set is required: ${expected}`);
  problems.push(
    ...results.flatMap((result) => result.localProblems.map((problem) => `${result.vars.join('/')}: ${problem}`)),
  );
}

function configuredDeploymentProviders() {
  const raw = valueOf('DEPLOYMENT_PROVIDERS_ENABLED');

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((provider) => provider.trim())
    .filter(Boolean);
}

function validateDeploymentProviders(problems) {
  const providers = configuredDeploymentProviders();

  if (providers.length === 0) {
    problems.push(
      'DEPLOYMENT_PROVIDERS_ENABLED is required and must list beta/production providers, e.g. static,vercel',
    );
    return;
  }

  for (const provider of providers) {
    const required = deploymentProviderRequirements[provider];

    if (!required) {
      problems.push(`DEPLOYMENT_PROVIDERS_ENABLED contains unsupported provider "${provider}"`);
      continue;
    }

    for (const variable of required) {
      validateScalar(variable, problems);
    }
  }
}

function validateWorkspaceSandboxControls(problems) {
  if (valueOf('WORKSPACE_DISABLE_SANDBOX_SCHEDULING') === '1') {
    problems.push('WORKSPACE_DISABLE_SANDBOX_SCHEDULING must not be 1 in production');
  }
}

function validateRuntimeMode(problems) {
  if (valueOf('VITE_RUNTIME_MODE') !== 'remote-kubernetes') {
    problems.push('VITE_RUNTIME_MODE must be remote-kubernetes in production');
  }

  const runtimeApiBaseUrl = requireUrl('VITE_RUNTIME_API_BASE_URL', problems);
  if (runtimeApiBaseUrl && runtimeApiBaseUrl.pathname.replace(/\/+$/, '') !== '/api/runtime') {
    problems.push(
      'VITE_RUNTIME_API_BASE_URL must point to the runtime API prefix, e.g. https://api.e-code.ai/api/runtime',
    );
  }

  const workspaceManagerUrl = requireUrl('WORKSPACE_MANAGER_URL', problems);
  if (workspaceManagerUrl) {
    const isInternalKubernetesService =
      workspaceManagerUrl.protocol === 'http:' &&
      (workspaceManagerUrl.hostname.endsWith('.svc') || workspaceManagerUrl.hostname.endsWith('.svc.cluster.local'));
    const isHttps = workspaceManagerUrl.protocol === 'https:';

    if (!isHttps && !isInternalKubernetesService) {
      problems.push('WORKSPACE_MANAGER_URL must be https or an internal Kubernetes service DNS URL');
    }

    if (/localhost|127\.0\.0\.1/.test(workspaceManagerUrl.hostname)) {
      problems.push('WORKSPACE_MANAGER_URL must not point to localhost in production');
    }
  }

  const previewUrlTemplate = valueOf('PREVIEW_URL_TEMPLATE');
  if (previewUrlTemplate && (!previewUrlTemplate.includes('{workspaceId}') || !previewUrlTemplate.includes('{port}'))) {
    problems.push('PREVIEW_URL_TEMPLATE must include {workspaceId} and {port}');
  }

  if (valueOf('WORKSPACE_AGENT_IMAGE')?.endsWith(':latest')) {
    problems.push('WORKSPACE_AGENT_IMAGE must be pinned and must not use :latest');
  }
}

function validateReservedVmPayloadEncryption(problems) {
  const enabled = valueOf('RESERVED_VM_RUNTIME_ENABLED');

  if (enabled !== 'true' && enabled !== 'false') {
    problems.push('RESERVED_VM_RUNTIME_ENABLED must be explicitly true or false');
    return;
  }

  if (enabled === 'false') {
    return;
  }

  const currentId = valueOf('RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID');
  const currentSecret = valueOf('RESERVED_VM_PAYLOAD_ENCRYPTION_KEY');
  const previousRaw = valueOf('RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON');

  if (!currentId || !/^[A-Za-z0-9._:-]{1,64}$/.test(currentId)) {
    problems.push('RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID must be a 1..64 character safe key id');
  }
  if (!currentSecret || currentSecret.length < 32) {
    problems.push('RESERVED_VM_PAYLOAD_ENCRYPTION_KEY must contain at least 32 characters');
  }
  if (!previousRaw) {
    problems.push('RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON is required (use {} before the first rotation)');
    return;
  }

  try {
    const parsed = JSON.parse(previousRaw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError('keyring must be an object');
    }

    for (const [keyId, secret] of Object.entries(parsed)) {
      if (!/^[A-Za-z0-9._:-]{1,64}$/.test(keyId) || typeof secret !== 'string' || secret.length < 32) {
        throw new TypeError('invalid keyring entry');
      }
      if (currentId && keyId === currentId) {
        problems.push('RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON must not repeat the active key id');
      }
    }
  } catch {
    problems.push('RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON must be a JSON object of keyId -> 32+ character secret');
  }
}

function validateGroup(group) {
  const problems = [];

  if (group.custom) {
    group.custom(problems);
  }

  for (const variable of group.required ?? []) {
    validateScalar(variable, problems);
  }

  if (group.requiredAny) {
    validateRequiredAny(group.requiredAny, problems);
  }

  if (group.id === 'monitoring' && valueOf('LOG_REDACTION_ENABLED') !== 'true') {
    problems.push('LOG_REDACTION_ENABLED must be true in production');
  }

  if (group.id === 'rotation-soc2') {
    const cadence = Number(valueOf('SECRET_ROTATION_CADENCE_DAYS'));
    const retention = Number(valueOf('AUDIT_RETENTION_DAYS'));

    if (!Number.isInteger(cadence) || cadence < 1 || cadence > 180) {
      problems.push('SECRET_ROTATION_CADENCE_DAYS must be an integer between 1 and 180');
    }

    if (!Number.isInteger(retention) || retention < 365) {
      problems.push('AUDIT_RETENTION_DAYS must be at least 365');
    }
  }

  return {
    id: group.id,
    label: group.label,
    ok: problems.length === 0,
    problems,
  };
}

async function fetchStatus(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { accept: 'application/json, application/xml, text/xml, */*' },
      signal: controller.signal,
    });

    const ok = options.reachabilityOnly ? response.status < 500 : response.ok;
    return { ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function liveCheck(check) {
  if (check.optional && !valueOf(check.env)) {
    return { ok: true, skipped: true };
  }

  if (check.kind === 'oidc-issuer') {
    const issuer = valueOf(check.env);
    const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
    const result = await fetchStatus(url);
    return { ...result, target: `${check.env}/.well-known/openid-configuration` };
  }

  if (check.kind === 'metadata') {
    const result = await fetchStatus(valueOf(check.env));
    return { ...result, target: check.env };
  }

  if (check.kind === 'head-env') {
    const result = await fetchStatus(valueOf(check.env), { method: 'HEAD', reachabilityOnly: true });
    return { ...result, target: check.env };
  }

  if (check.kind === 'head') {
    const result = await fetchStatus(check.url, { method: 'HEAD', reachabilityOnly: true });
    return { ...result, target: check.url };
  }

  if (check.kind === 'well-known') {
    const result = await fetchStatus(check.url);
    return { ...result, target: check.url };
  }

  if (check.kind === 'smtp') {
    if (!valueOf('SMTP_HOST')) {
      return { ok: true, skipped: true };
    }

    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: valueOf('SMTP_HOST'),
      port: Number(valueOf('SMTP_PORT') ?? 587),
      secure: valueOf('SMTP_SECURE') === 'true',
      auth:
        valueOf('SMTP_USER') && valueOf('SMTP_PASSWORD')
          ? {
              user: valueOf('SMTP_USER'),
              pass: valueOf('SMTP_PASSWORD'),
            }
          : undefined,
    });

    await transporter.verify();
    return { ok: true, target: 'SMTP_HOST' };
  }

  if (check.kind === 'stripe-account') {
    return stripeAccountLiveCheck();
  }

  return { ok: true, skipped: true };
}

async function stripeAccountLiveCheck() {
  const apiKey = valueOf('STRIPE_SECRET_KEY');

  if (!apiKey) {
    return { ok: false, target: 'STRIPE_SECRET_KEY', reason: 'missing_key' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true, status: response.status, target: 'Stripe /v1/account' };
    }

    const body = await response.json().catch(() => ({}));
    const code = typeof body?.error?.code === 'string' ? body.error.code : undefined;
    const type = typeof body?.error?.type === 'string' ? body.error.type : undefined;

    return {
      ok: false,
      status: response.status,
      target: 'Stripe /v1/account',
      reason: code ?? type ?? 'request_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runLiveChecks(report) {
  for (const group of groups) {
    const item = report.groups.find((entry) => entry.id === group.id);

    if (!item?.ok || !group.live) {
      continue;
    }

    item.liveChecks = [];

    for (const check of group.live) {
      try {
        const result = await liveCheck(check);
        item.liveChecks.push(result);

        if (!result.ok) {
          item.ok = false;
          item.problems.push(
            `external connectivity check failed for ${result.target ?? group.label}: ${result.status ?? 'unreachable'}${result.reason ? ` (${result.reason})` : ''}`,
          );
        }
      } catch (error) {
        item.ok = false;
        item.problems.push(
          `external connectivity check failed for ${group.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

function buildReport() {
  const report = {
    strict,
    live,
    loadedEnvFiles: loadDotenv ? envFiles.filter((file) => existsSync(resolve(root, file))) : [],
    groups: groups.map(validateGroup),
    redactedPresence: Object.fromEntries(
      Array.from(new Set(groups.flatMap((group) => [...(group.required ?? []), ...(group.requiredAny ?? []).flat()])))
        .sort()
        .map((name) => [name, redacted(name)]),
    ),
  };

  report.ok = report.groups.every((group) => group.ok);
  return report;
}

function printReport(report) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    `Production enterprise validation (${strict ? 'strict' : 'report-only'}${live ? ', live checks enabled' : ''})`,
  );

  for (const group of report.groups) {
    console.log(`${group.ok ? 'OK' : 'FAIL'} ${group.label}`);

    for (const problem of group.problems) {
      console.log(`  - ${problem}`);
    }

    for (const check of group.liveChecks ?? []) {
      const status = check.skipped ? 'skipped' : check.ok ? 'ok' : 'failed';
      console.log(`  - live ${check.target ?? group.id}: ${status}${check.status ? ` (${check.status})` : ''}`);
    }
  }
}

function withEnv(overrides, callback) {
  const previous = {};

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  try {
    return callback();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function selfTest() {
  const minimum = {
    GOOGLE_CLIENT_ID: 'google-client-prod',
    GOOGLE_CLIENT_SECRET: 'google-secret-prod-123456',
    GOOGLE_REDIRECT_URI: 'https://app.vibecore.com/auth/oauth/google/callback',
    GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
    GOOGLE_USERINFO_URL: 'https://openidconnect.googleapis.com/v1/userinfo',
    GITHUB_CLIENT_ID: 'github-client-prod',
    GITHUB_CLIENT_SECRET: 'github-secret-prod-123456',
    GITHUB_REDIRECT_URI: 'https://app.vibecore.com/auth/oauth/github/callback',
    GITHUB_TOKEN_URL: 'https://github.com/login/oauth/access_token',
    GITHUB_USERINFO_URL: 'https://api.github.com/user',
    OIDC_CLIENT_ID: 'entra-client-prod',
    OIDC_CLIENT_SECRET: 'entra-secret-prod-123456',
    OIDC_REDIRECT_URI: 'https://app.vibecore.com/auth/oidc/callback',
    OIDC_ISSUER_URL: 'https://login.microsoftonline.com/tenant/v2.0',
    OIDC_AUTHORIZATION_URL: 'https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize',
    OIDC_TOKEN_URL: 'https://login.microsoftonline.com/tenant/oauth2/v2.0/token',
    OIDC_USERINFO_URL: 'https://graph.microsoft.com/oidc/userinfo',
    OIDC_JWKS_URL: 'https://login.microsoftonline.com/tenant/discovery/v2.0/keys',
    SAML_ENTITY_ID: 'https://app.vibecore.com/auth/saml/metadata/org',
    SAML_ACS_URL: 'https://app.vibecore.com/auth/saml/org/acs',
    SAML_SSO_URL: 'https://idp.company.com/sso',
    SAML_X509_CERTIFICATE: '-----BEGIN CERTIFICATE-----prodcertificate-----END CERTIFICATE-----',
    EMAIL_HTTP_ENDPOINT: 'https://email.company.com/send',
    EMAIL_HTTP_TOKEN: 'email-token-prod-123456',
    EMAIL_FROM: 'no-reply@vibecore.com',
    SIEM_WEBHOOK_URL: 'https://siem.company.com/vibecore',
    SIEM_SIGNING_SECRET: 'siem-secret-prod-123456',
    DATABASE_URL: 'postgresql://vibecore:secure@db.company.com:5432/vibecore',
    REDIS_URL: 'rediss://redis.company.com:6379',
    JWT_SECRET: 'jwt-secret-prod-123456',
    COOKIE_SECRET: 'cookie-secret-prod-123456',
    CONFIG_ENCRYPTION_KEY: 'config-encryption-prod-123456',
    WORKSPACE_AGENT_TOKEN_SECRET: 'agent-token-prod-123456',
    RESERVED_VM_RUNTIME_ENABLED: 'true',
    RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID: 'reserved-vm-2026-08',
    RESERVED_VM_PAYLOAD_ENCRYPTION_KEY: 'reserved-vm-current-key-material-123456',
    RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON: '{}',
    WORKSPACE_MANAGER_URL: 'https://workspace-manager.vibecore.com',
    WORKSPACE_RUNTIME_NAMESPACE: 'workspaces',
    WORKSPACE_AGENT_IMAGE: 'registry.company.com/vibecore/workspace-agent:sha-prod123456',
    PREVIEW_PROXY_SHARED_SECRET: 'preview-proxy-secret-prod-123456',
    PREVIEW_URL_TEMPLATE: 'https://{workspaceId}-{port}.preview.vibecore.com/p/{workspaceId}/{port}/',
    VITE_RUNTIME_API_BASE_URL: 'https://api.vibecore.com/api/runtime',
    VITE_RUNTIME_MODE: 'remote-kubernetes',
    STRIPE_SECRET_KEY: 'sk_live_prod123456',
    STRIPE_WEBHOOK_SECRET: 'whsec_prod123456',
    STRIPE_FREE_PRODUCT_ID: 'prod_free',
    STRIPE_FREE_PRICE_ID: 'price_free',
    STRIPE_PRO_PRODUCT_ID: 'prod_pro',
    STRIPE_PRO_PRICE_ID: 'price_pro',
    STRIPE_TEAM_PRODUCT_ID: 'prod_team',
    STRIPE_TEAM_PRICE_ID: 'price_team',
    STRIPE_ENTERPRISE_PRODUCT_ID: 'prod_enterprise',
    STRIPE_ENTERPRISE_PRICE_ID: 'price_enterprise',
    DEPLOYMENT_PROVIDERS_ENABLED: 'static,vercel,github-pages,google-cloud-run',
    VERCEL_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/hook/prod',
    GITHUB_DEPLOY_TOKEN: 'ghp_productiondeploytoken123456',
    GITHUB_PAGES_REPO: 'vibecore/www',
    GITHUB_PAGES_WORKFLOW: 'pages.yml',
    CLOUD_RUN_BUILD_TRIGGER_URL:
      'https://cloudbuild.googleapis.com/v1/projects/vibecore-prod/triggers/app:webhook?key=prod',
    GCP_OAUTH_TOKEN: 'ya29.production-token-123456',
    OPENAI_API_KEY: 'sk-live-openai-prod-123456',
    OTEL_SERVICE_NAME: 'vibecore-api',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.company.com/v1/traces',
    LOG_REDACTION_ENABLED: 'true',
    SECURITY_CONTACT_EMAIL: 'security@vibecore.com',
    INCIDENT_WEBHOOK_URL: 'https://incident.company.com/hooks/vibecore',
    SECRET_ROTATION_OWNER: 'security@vibecore.com',
    SECRET_ROTATION_CADENCE_DAYS: '90',
    AUDIT_RETENTION_DAYS: '730',
    SOC2_EVIDENCE_BUCKET: 's3://vibecore-soc2-evidence',
    BACKUP_ENCRYPTION_KEY: 'backup-encryption-prod-123456',
    PRODUCTION_RUNBOOK_OWNER: 'ops@vibecore.com',
  };

  const passing = withEnv(minimum, () => buildReport());

  if (!passing.ok) {
    throw new Error(
      `expected complete production config to pass: ${JSON.stringify(
        passing.groups.filter((group) => !group.ok),
        null,
        2,
      )}`,
    );
  }

  const failing = withEnv(
    { ...minimum, GOOGLE_CLIENT_SECRET: 'change-me', OIDC_ISSUER_URL: 'http://localhost:8080' },
    () => buildReport(),
  );

  if (failing.ok) {
    throw new Error('expected placeholder and local OIDC config to fail');
  }

  const failingDeploy = withEnv(
    { ...minimum, DEPLOYMENT_PROVIDERS_ENABLED: 'vercel,google-cloud-run', VERCEL_DEPLOY_HOOK_URL: '' },
    () => buildReport(),
  );

  if (failingDeploy.ok) {
    throw new Error('expected enabled deploy provider with missing dispatch env to fail');
  }

  const failingSandboxBypass = withEnv({ ...minimum, WORKSPACE_DISABLE_SANDBOX_SCHEDULING: '1' }, () => buildReport());

  if (failingSandboxBypass.ok) {
    throw new Error('expected disabled workspace sandbox scheduling to fail');
  }

  const failingRuntimeMode = withEnv({ ...minimum, VITE_RUNTIME_MODE: 'webcontainer' }, () => buildReport());

  if (failingRuntimeMode.ok) {
    throw new Error('expected production WebContainer runtime mode to fail');
  }

  const failingRuntimeBase = withEnv({ ...minimum, VITE_RUNTIME_API_BASE_URL: 'https://api.vibecore.com' }, () =>
    buildReport(),
  );

  if (failingRuntimeBase.ok) {
    throw new Error('expected runtime API base URL without /api/runtime to fail');
  }

  const failingReservedVmMissing = withEnv(
    { ...minimum, RESERVED_VM_PAYLOAD_ENCRYPTION_KEY: '', RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON: '' },
    () => buildReport(),
  );

  if (failingReservedVmMissing.ok) {
    throw new Error('expected enabled Reserved VM without its Secret-backed keyring to fail');
  }

  const failingReservedVmInvalid = withEnv(
    {
      ...minimum,
      RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID: 'invalid key id',
      RESERVED_VM_PAYLOAD_ENCRYPTION_KEY: 'weak',
      RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON: '{"old":"weak"}',
    },
    () => buildReport(),
  );

  if (failingReservedVmInvalid.ok) {
    throw new Error('expected weak or malformed Reserved VM payload keys to fail');
  }

  const passingInternalWorkspaceManager = withEnv(
    { ...minimum, WORKSPACE_MANAGER_URL: 'http://vibecore-vibecore-platform-workspace-manager.vibecore.svc:3010' },
    () => buildReport(),
  );

  if (!passingInternalWorkspaceManager.ok) {
    throw new Error('expected internal Kubernetes WORKSPACE_MANAGER_URL to pass');
  }

  console.log('Production enterprise validator self-test passed');
}

async function main() {
  if (args.has('--self-test')) {
    selfTest();
    return;
  }

  const report = buildReport();

  if (live) {
    await runLiveChecks(report);
    report.ok = report.groups.every((group) => group.ok);
  }

  printReport(report);

  if (strict && !report.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
