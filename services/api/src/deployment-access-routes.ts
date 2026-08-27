import { createOpaqueToken, hashPassword, verifyPassword } from '@vibecore/auth';
import type { PermissionKey } from '@vibecore/rbac';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { appPublicCopy, appPublicEnglish, type AppPublicCopyKey } from './app-public-copy.js';
import {
  ACCESS_EXCHANGE_TICKET_TTL_SECONDS,
  DEPLOYMENT_ACCESS_MODES,
  PASSWORD_ACCESS_COOKIE_TTL_SECONDS,
  PRIVATE_ACCESS_COOKIE_TTL_SECONDS,
  deploymentAccessCookieName,
  deploymentAccessActivationEnabled,
  deriveDeploymentAccessCookieSecret,
  hashDeploymentAccessTicket,
  publicDeploymentAccessPolicy,
  signDeploymentAccessCookie,
  verifyDeploymentAccessCookie,
} from './deployment-access.js';
import type { ApiStore, ProjectRecord, ReleaseManifestRecord } from './store.js';
import { resolveTransactionalLocale } from './transactional-i18n.js';

type ProjectAuthorizer = (
  request: FastifyRequest,
  projectId: string,
  permission: PermissionKey,
) => Promise<ProjectRecord>;

type AuditWriter = (
  request: FastifyRequest,
  input: {
    organizationId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
) => Promise<void>;

export interface DeploymentAccessRouteOptions {
  store: ApiStore;
  isProduction: boolean;
  requireProject: ProjectAuthorizer;
  requirePreviewProxySecret: (request: FastifyRequest) => void;
  audit: AuditWriter;
  appPublicBaseUrl: () => string;
}

const idSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/);

const routeParamsSchema = z.object({ projectId: z.string().min(1), deploymentId: idSchema });
const deploymentParamsSchema = z.object({ deploymentId: idSchema });

const updatePolicySchema = z
  .object({
    mode: z.enum(DEPLOYMENT_ACCESS_MODES),
    password: z.string().min(10).max(256).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.mode === 'PASSWORD_PROTECTED' && !value.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: appPublicEnglish('DEPLOYMENT_ACCESS_PASSWORD_REQUIRED'),
      });
    }

    if (value.mode !== 'PASSWORD_PROTECTED' && value.password !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: appPublicEnglish('DEPLOYMENT_ACCESS_PASSWORD_FORBIDDEN'),
      });
    }
  });

const passwordSchema = z.object({ password: z.string().min(1).max(256) });

const exchangeSchema = z.object({
  ticket: z
    .string()
    .min(20)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_VALIDATION_FAILED')), {
    statusCode: 400,
    code: 'DEPLOYMENT_ACCESS_VALIDATION_FAILED',
    details: result.error.flatten(),
  });
}

function primaryAccessSecret(): string | undefined {
  const primary = process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET?.trim();

  return primary && primary.length >= 32 ? deriveDeploymentAccessCookieSecret(primary) : undefined;
}

function accessVerificationSecrets(): string[] {
  const primary = process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET?.trim();

  const rotations = (process.env.DEPLOYMENT_ACCESS_TOKEN_PREVIOUS_SECRETS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 32);

  const candidates = [primary && primary.length >= 32 ? primary : undefined, ...rotations].filter(
    (entry): entry is string => typeof entry === 'string',
  );

  return [...new Set(candidates)].map(deriveDeploymentAccessCookieSecret);
}

function internalAccessRateKey(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  const expectedAuthorization = process.env.PREVIEW_PROXY_SHARED_SECRET?.trim();
  const clientHeader = request.headers['x-vibecore-access-client-key'];
  const clientKey = typeof clientHeader === 'string' && /^[a-f0-9]{64}$/.test(clientHeader) ? clientHeader : undefined;
  const deploymentId = (request.params as { deploymentId?: unknown } | undefined)?.deploymentId;

  const trustedProxy =
    expectedAuthorization && authorization === `Bearer ${expectedAuthorization}` && clientKey ? clientKey : 'untrusted';

  return `${typeof deploymentId === 'string' ? deploymentId : 'unknown'}:${trustedProxy}:${request.ip}`;
}

function setNoStore(reply: FastifyReply): void {
  reply.header('cache-control', 'private, no-store, max-age=0');
  reply.header('pragma', 'no-cache');
  reply.header('vary', 'Cookie');
}

function requestAccessLocale(request: FastifyRequest) {
  const cookieHeader = typeof request.headers.cookie === 'string' ? request.headers.cookie : '';

  const cookies = new Map(
    cookieHeader
      .split(';')
      .map((entry) => entry.trim().split('='))
      .filter((entry): entry is [string, string] => entry.length >= 2)
      .map(([name, ...value]) => [name, value.join('=')]),
  );

  return resolveTransactionalLocale({
    preferredLanguage: cookies.get('vibecore-lang') ?? cookies.get('vibecore-auto-lang'),
    acceptLanguage: request.headers['accept-language'],
  });
}

function sendAccessError(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  key: AppPublicCopyKey,
  code: string,
) {
  const locale = requestAccessLocale(request);
  setNoStore(reply);
  reply.header('content-language', locale);
  reply.header('vary', 'Cookie, Accept-Language');

  return reply.code(status).send({ error: appPublicCopy(key, locale), code });
}

function accessCookie(
  reply: FastifyReply,
  input: {
    deploymentId: string;
    policyVersion: number;
    policyRevision: string;
    kind: 'PASSWORD' | 'USER';
    secret: string;
    ttlSeconds: number;
    isProduction: boolean;
    userId?: string;
  },
): void {
  const token = signDeploymentAccessCookie(input.secret, {
    version: 1,
    kind: input.kind,
    deploymentId: input.deploymentId,
    policyVersion: input.policyVersion,
    policyRevision: input.policyRevision,
    ...(input.userId ? { userId: input.userId } : {}),
    expiresAtMs: Date.now() + input.ttlSeconds * 1_000,
  });
  reply.setCookie(deploymentAccessCookieName(input.deploymentId), token, {
    path: '/',
    httpOnly: true,
    secure: input.isProduction,
    sameSite: 'lax',
    maxAge: input.ttlSeconds,
  });
}

function dedicatedOrigin(
  deploymentId: string,
  values: Array<string | undefined>,
  isProduction: boolean,
): URL | undefined {
  const expectedLabels = new Set([`s-${deploymentId}`.toLowerCase(), `d-${deploymentId}`.toLowerCase()]);
  const configuredDomain = process.env.PREVIEW_DOMAIN?.trim().toLowerCase().replace(/^\.+/, '');

  if (isProduction && !configuredDomain) {
    return undefined;
  }

  for (const value of values) {
    if (!value) {
      continue;
    }

    try {
      const url = new URL(value);
      const firstLabel = url.hostname.toLowerCase().split('.')[0];

      if (!expectedLabels.has(firstLabel)) {
        continue;
      }

      if (isProduction && url.protocol !== 'https:') {
        continue;
      }

      if (configuredDomain && url.hostname.toLowerCase() !== `${firstLabel}.${configuredDomain}`) {
        continue;
      }

      url.pathname = '/';
      url.search = '';
      url.hash = '';

      return url;
    } catch {
      // Ignore malformed persisted URLs. A ticket must never target an arbitrary origin.
    }
  }

  return undefined;
}

async function latestReleaseForDeployment(
  store: ApiStore,
  projectId: string,
  environment: string,
  deploymentId: string,
): Promise<ReleaseManifestRecord | undefined> {
  const manifests = await store.listReleaseManifests(projectId, environment, { take: 100 });
  return manifests.find((manifest) => manifest.deploymentId === deploymentId);
}

function lockedVerdict(deploymentId: string) {
  return {
    decision: 'locked' as const,
    mode: 'INVITE_ONLY' as const,
    cookieName: deploymentAccessCookieName(deploymentId),
  };
}

export async function registerDeploymentAccessRoutes(
  app: FastifyInstance,
  options: DeploymentAccessRouteOptions,
): Promise<void> {
  const { store, isProduction } = options;

  app.get('/projects/:projectId/deployments/:deploymentId/access', async (request, reply) => {
    const { projectId, deploymentId } = parse(routeParamsSchema, request.params);
    const project = await options.requireProject(request, projectId, 'projects:read');
    const deployment = await store.getDeployment(project.id, deploymentId);

    if (!deployment) {
      return sendAccessError(request, reply, 404, 'DEPLOYMENT_NOT_FOUND', 'DEPLOYMENT_NOT_FOUND');
    }

    const membership = request.currentUser
      ? await store.getMembership(request.currentUser.id, project.organizationId)
      : undefined;

    const policy = await store.getDeploymentAccessPolicy(deployment.id);
    setNoStore(reply);

    return {
      policy: policy
        ? publicDeploymentAccessPolicy(policy)
        : { mode: 'INVITE_ONLY', version: 0, revision: 'invalid', createdAt: null },
      canManage: membership?.roleKey === 'owner' || membership?.roleKey === 'admin',
      state: policy ? 'ACTIVE' : 'LOCKED',
    };
  });

  app.put(
    '/projects/:projectId/deployments/:deploymentId/access',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { projectId, deploymentId } = parse(routeParamsSchema, request.params);
      const body = parse(updatePolicySchema, request.body);
      const project = await options.requireProject(request, projectId, 'projects:write');

      const membership = request.currentUser
        ? await store.getMembership(request.currentUser.id, project.organizationId)
        : undefined;

      if (!membership || (membership.roleKey !== 'owner' && membership.roleKey !== 'admin')) {
        return sendAccessError(
          request,
          reply,
          403,
          'DEPLOYMENT_ACCESS_ADMIN_REQUIRED',
          'DEPLOYMENT_ACCESS_ADMIN_REQUIRED',
        );
      }

      if (body.mode !== 'PUBLIC' && !deploymentAccessActivationEnabled(isProduction)) {
        return sendAccessError(
          request,
          reply,
          503,
          'DEPLOYMENT_ACCESS_ROLLOUT_NOT_ACTIVE',
          'DEPLOYMENT_ACCESS_ROLLOUT_NOT_ACTIVE',
        );
      }

      if (body.mode !== 'PUBLIC' && !primaryAccessSecret()) {
        return sendAccessError(
          request,
          reply,
          503,
          'DEPLOYMENT_ACCESS_SIGNING_UNAVAILABLE',
          'DEPLOYMENT_ACCESS_SIGNING_UNAVAILABLE',
        );
      }

      const deployment = await store.getDeployment(project.id, deploymentId);

      if (!deployment) {
        return sendAccessError(request, reply, 404, 'DEPLOYMENT_NOT_FOUND', 'DEPLOYMENT_NOT_FOUND');
      }

      const releaseSource =
        deployment.status === 'READY'
          ? await latestReleaseForDeployment(store, project.id, deployment.environment, deployment.id)
          : undefined;
      const policy = await store.setDeploymentAccessPolicy({
        projectId: project.id,
        deploymentId: deployment.id,
        mode: body.mode,
        ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
        createdByUserId: request.currentUser!.id,
        ...(body.expectedVersion ? { expectedVersion: body.expectedVersion } : {}),
        ...(releaseSource ? { releaseSource } : {}),
      });

      if (!policy) {
        return sendAccessError(request, reply, 404, 'DEPLOYMENT_NOT_FOUND', 'DEPLOYMENT_NOT_FOUND');
      }

      await options.audit(request, {
        organizationId: project.organizationId,
        action: 'deployment.access_policy.update',
        resourceType: 'deployment',
        resourceId: deployment.id,
        metadata: { mode: policy.mode, version: policy.version, revision: policy.revision },
      });
      setNoStore(reply);

      return { policy: publicDeploymentAccessPolicy(policy), state: 'ACTIVE' };
    },
  );

  app.post(
    '/deployment-access/:deploymentId/ticket',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { deploymentId } = parse(deploymentParamsSchema, request.params);

      if (!request.currentUser) {
        return sendAccessError(request, reply, 401, 'AUTHENTICATION_REQUIRED', 'AUTH_REQUIRED');
      }

      const context = await store.getDeploymentAccessContext(deploymentId);

      if (!context || context.projectDeletedAt || context.deploymentStatus !== 'READY') {
        return sendAccessError(request, reply, 404, 'DEPLOYMENT_NOT_FOUND', 'DEPLOYMENT_NOT_FOUND');
      }

      const deployment = await store.getDeployment(context.projectId, deploymentId);

      const origin = deployment
        ? dedicatedOrigin(deploymentId, [deployment.url, deployment.productionUrl, deployment.previewUrl], isProduction)
        : undefined;

      if (!origin) {
        return sendAccessError(
          request,
          reply,
          409,
          'DEPLOYMENT_ACCESS_ORIGIN_INVALID',
          'DEPLOYMENT_ACCESS_ORIGIN_INVALID',
        );
      }

      const rawTicket = createOpaqueToken('dep_access');

      const issued = await store.issueDeploymentAccessExchangeTicket({
        deploymentId,
        userId: request.currentUser.id,
        tokenHash: hashDeploymentAccessTicket(rawTicket),
        ttlSeconds: ACCESS_EXCHANGE_TICKET_TTL_SECONDS,
      });

      if (!issued.ok) {
        const denied = issued.reason === 'ACCESS_DENIED';
        return sendAccessError(
          request,
          reply,
          denied ? 403 : issued.reason === 'DEPLOYMENT_NOT_FOUND' ? 404 : 409,
          denied ? 'DEPLOYMENT_ACCESS_DENIED' : 'DEPLOYMENT_ACCESS_UNAVAILABLE',
          `DEPLOYMENT_ACCESS_${issued.reason}`,
        );
      }

      setNoStore(reply);

      return {
        ticket: rawTicket,
        expiresAt: issued.expiresAt,
        exchangeUrl: new URL('/__vibecore/access/exchange', origin).toString(),
        deploymentUrl: origin.toString(),
      };
    },
  );

  app.get(
    '/internal/deployments/:deploymentId/access/verdict',
    { config: { rateLimit: { max: 1_000, timeWindow: '1 minute', keyGenerator: internalAccessRateKey } } },
    async (request, reply) => {
      options.requirePreviewProxySecret(request);

      const { deploymentId } = parse(deploymentParamsSchema, request.params);
      setNoStore(reply);

      const context = await store.getDeploymentAccessContext(deploymentId);

      if (!context || context.projectDeletedAt || context.deploymentStatus !== 'READY' || !context.policy) {
        return lockedVerdict(deploymentId);
      }

      const policy = context.policy;
      const cookieName = deploymentAccessCookieName(deploymentId);

      if (policy.mode === 'PUBLIC') {
        return { decision: 'allow', mode: policy.mode, cookieName };
      }

      const secrets = accessVerificationSecrets();

      if (secrets.length === 0) {
        return lockedVerdict(deploymentId);
      }

      const proofHeader = request.headers['x-vibecore-deployment-access-cookie'];
      const proof = typeof proofHeader === 'string' ? proofHeader : undefined;

      const claims = verifyDeploymentAccessCookie(secrets, proof, {
        deploymentId,
        policyVersion: policy.version,
        policyRevision: policy.revision,
      });

      if (policy.mode === 'PASSWORD_PROTECTED') {
        return claims?.kind === 'PASSWORD'
          ? { decision: 'allow', mode: policy.mode, cookieName }
          : { decision: 'password-required', mode: policy.mode, cookieName };
      }

      if (
        claims?.kind === 'USER' &&
        claims.userId &&
        (await store.isDeploymentAccessUserAuthorized({
          deploymentId,
          userId: claims.userId,
          mode: policy.mode,
        }))
      ) {
        return { decision: 'allow', mode: policy.mode, cookieName };
      }

      return {
        decision: 'sign-in-required',
        mode: policy.mode,
        cookieName,
        signInUrl: `${options.appPublicBaseUrl()}/deployment-access/${encodeURIComponent(deploymentId)}`,
      };
    },
  );

  app.post(
    '/internal/deployments/:deploymentId/access/password',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: internalAccessRateKey } } },
    async (request, reply) => {
      options.requirePreviewProxySecret(request);

      const { deploymentId } = parse(deploymentParamsSchema, request.params);
      const body = parse(passwordSchema, request.body);
      const context = await store.getDeploymentAccessContext(deploymentId);
      const secret = primaryAccessSecret();

      if (
        !context ||
        context.projectDeletedAt ||
        context.deploymentStatus !== 'READY' ||
        context.policy?.mode !== 'PASSWORD_PROTECTED' ||
        !context.policy.passwordHash ||
        !secret
      ) {
        return sendAccessError(request, reply, 423, 'DEPLOYMENT_ACCESS_LOCKED', 'DEPLOYMENT_ACCESS_LOCKED');
      }

      if (!verifyPassword(body.password, context.policy.passwordHash)) {
        return sendAccessError(
          request,
          reply,
          401,
          'DEPLOYMENT_ACCESS_PASSWORD_INVALID',
          'DEPLOYMENT_ACCESS_PASSWORD_INVALID',
        );
      }

      accessCookie(reply, {
        deploymentId,
        policyVersion: context.policy.version,
        policyRevision: context.policy.revision,
        kind: 'PASSWORD',
        secret,
        ttlSeconds: PASSWORD_ACCESS_COOKIE_TTL_SECONDS,
        isProduction,
      });
      setNoStore(reply);

      return reply.code(204).send();
    },
  );

  app.post(
    '/internal/deployments/:deploymentId/access/exchange',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute', keyGenerator: internalAccessRateKey } } },
    async (request, reply) => {
      options.requirePreviewProxySecret(request);

      const { deploymentId } = parse(deploymentParamsSchema, request.params);
      const body = parse(exchangeSchema, request.body);

      const result = await store.consumeDeploymentAccessExchangeTicket({
        deploymentId,
        tokenHash: hashDeploymentAccessTicket(body.ticket),
      });

      const secret = primaryAccessSecret();

      if (!result.ok || !secret) {
        const replay = !result.ok && result.reason === 'TICKET_REPLAYED';

        return sendAccessError(
          request,
          reply,
          replay ? 409 : 401,
          'DEPLOYMENT_ACCESS_EXCHANGE_INVALID',
          !result.ok ? `DEPLOYMENT_ACCESS_${result.reason}` : 'DEPLOYMENT_ACCESS_SIGNING_UNAVAILABLE',
        );
      }

      accessCookie(reply, {
        deploymentId,
        policyVersion: result.policy.version,
        policyRevision: result.policy.revision,
        kind: 'USER',
        userId: result.userId,
        secret,
        ttlSeconds: PRIVATE_ACCESS_COOKIE_TTL_SECONDS,
        isProduction,
      });
      setNoStore(reply);

      return reply.code(204).send();
    },
  );
}
