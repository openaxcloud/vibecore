import { Readable } from 'node:stream';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { verifyConnectorAccessToken, type ConnectorErrorBody } from '@vibecore/connector-sdk';

export interface ConnectionResolverInput {
  userConnectionId: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  organizationId: string;
}

export type ConnectionResolution =
  | {
      ok: true;
      provider: string;
      accessToken: string;
    }
  | {
      ok: false;
      status: number;
      code: ConnectorErrorBody['code'];
      error: string;
      detail?: string;
    };

export interface ConnectionStatusUpdate {
  userConnectionId: string;
  status: 'needs_reconnect';
  reason: 'token_expired_or_revoked';
  upstreamStatus: number;
}

export interface ConnectorProxyOptions {
  logger?: boolean;
  /**
   * Shared secret used to verify HMAC access tokens minted by the API
   * service. Required at runtime — the constructor throws if missing,
   * matching the behaviour of the rest of the platform services.
   */
  accessTokenSecret: string;
  /**
   * Resolves a userConnectionId to a provider key + decrypted access
   * token, enforcing the ACL chain (workspace-to-project binding,
   * ProjectConnectionLink existence, OrganizationConnectorPolicy match,
   * connection status=active). The production build wires this to
   * Prisma directly; tests pass a stub.
   */
  resolveConnection: (input: ConnectionResolverInput) => Promise<ConnectionResolution>;
  /**
   * Called when the upstream provider returns 401/403, so the API
   * service can mark UserConnection.status=needs_reconnect and emit a
   * ReconnectionAlert. Optional — when omitted the proxy still
   * returns the structured error to the caller.
   */
  reportConnectionFailure?: (update: ConnectionStatusUpdate) => Promise<void>;
  /**
   * Optional fetch override used to forward to the upstream provider.
   * Tests inject a stub; production uses the global fetch.
   */
  fetchImpl?: typeof fetch;
}

const PROVIDER_UPSTREAMS: Record<string, { baseUrl: string; auth: 'bearer' | 'token'; defaultAccept: string }> = {
  github: { baseUrl: 'https://api.github.com', auth: 'token', defaultAccept: 'application/vnd.github+json' },
  gitlab: { baseUrl: 'https://gitlab.com/api/v4', auth: 'bearer', defaultAccept: 'application/json' },
  bitbucket: { baseUrl: 'https://api.bitbucket.org/2.0', auth: 'bearer', defaultAccept: 'application/json' },
  vercel: { baseUrl: 'https://api.vercel.com', auth: 'bearer', defaultAccept: 'application/json' },
  supabase: { baseUrl: 'https://api.supabase.com', auth: 'bearer', defaultAccept: 'application/json' },
  netlify: { baseUrl: 'https://api.netlify.com/api/v1', auth: 'bearer', defaultAccept: 'application/json' },
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'authorization',
  'cookie',
  'content-length',
]);

export async function buildConnectorProxyApp(options: ConnectorProxyOptions): Promise<FastifyInstance> {
  if (!options.accessTokenSecret || options.accessTokenSecret.length < 16) {
    throw new Error('CONNECTOR_PROXY_ACCESS_TOKEN_SECRET must be at least 16 characters');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const app = Fastify({ logger: options.logger ?? false });

  /*
   * Catch-all no-op body parser (mirrors preview-proxy). Without it Fastify's
   * default application/json + text/plain parsers consume request.raw before the
   * /proxy handler runs, so the handler forwarded an already-drained stream and
   * EVERY JSON/text POST/PUT/PATCH to a provider lost its body. Leaving the raw
   * stream intact lets it be forwarded upstream with duplex: 'half'.
   */
  app.addContentTypeParser('*', (_req, _payload, done) => done(null, undefined));

  app.get('/health', async () => ({ status: 'ok', service: 'connector-proxy' }));

  app.all('/proxy/:userConnectionId/*', async (request, reply) => {
    const tokenVerification = verifyAccessTokenFromRequest(request, options.accessTokenSecret);

    if (!tokenVerification.ok) {
      return sendError(reply, tokenVerification.status, {
        error: tokenVerification.error,
        code: tokenVerification.code,
      });
    }

    const params = request.params as { userConnectionId: string; '*': string };
    const resolution = await options.resolveConnection({
      userConnectionId: params.userConnectionId,
      workspaceId: tokenVerification.payload.workspaceId,
      projectId: tokenVerification.payload.projectId,
      userId: tokenVerification.payload.userId,
      organizationId: tokenVerification.payload.organizationId,
    });

    if (!resolution.ok) {
      return sendError(reply, resolution.status, {
        error: resolution.error,
        code: resolution.code,
        detail: resolution.detail,
      });
    }

    const upstream = PROVIDER_UPSTREAMS[resolution.provider];

    if (!upstream) {
      return sendError(reply, 501, {
        error: `Provider ${resolution.provider} is not yet wired in connector-proxy.`,
        code: 'CONNECTOR_UNKNOWN_PROVIDER',
      });
    }

    const upstreamPath = params['*'] ? `/${params['*']}` : '/';
    const queryString = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
    const upstreamUrl = `${upstream.baseUrl}${upstreamPath}${queryString}`;
    const headers = buildUpstreamHeaders(request, resolution.accessToken, upstream.auth, upstream.defaultAccept);
    const body = shouldStreamBody(request.method) ? (request.raw as unknown as ReadableStream<Uint8Array>) : undefined;

    let upstreamResponse: Response;

    try {
      upstreamResponse = await fetchImpl(upstreamUrl, {
        method: request.method,
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
        ...({ duplex: 'half' } as Record<string, unknown>),
      });
    } catch (error: any) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';

      return sendError(reply, timedOut ? 504 : 502, {
        error: timedOut
          ? 'Connector proxy timed out waiting for the upstream provider.'
          : 'Connector proxy could not reach the upstream provider.',
        code: 'CONNECTOR_PROVIDER_UNREACHABLE',
        detail: error?.message,
      });
    }

    /*
     * Only 401 is an unambiguous bad-credentials signal. A 403 frequently means
     * "this token may not access THIS resource/scope" (org policy, per-object
     * permission, rate/plan limit), not that the credential is revoked — flipping
     * the connection to needs_reconnect on any 403 disabled working tokens and
     * forced needless re-auth. Trigger auto-disable on 401 only.
     */
    if (upstreamResponse.status === 401 && options.reportConnectionFailure) {
      await options.reportConnectionFailure({
        userConnectionId: params.userConnectionId,
        status: 'needs_reconnect',
        reason: 'token_expired_or_revoked',
        upstreamStatus: upstreamResponse.status,
      });
    }

    reply.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, name) => {
      const lower = name.toLowerCase();

      if (HOP_BY_HOP_HEADERS.has(lower)) {
        return;
      }

      if (lower === 'content-encoding') {
        return;
      }

      reply.header(name, value);
    });

    if (!upstreamResponse.body) {
      return reply.send();
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? '';
    const contentLength = Number(upstreamResponse.headers.get('content-length') ?? '0');
    const shouldBufferResponse =
      contentType.includes('application/json') ||
      contentType.startsWith('text/') ||
      (Number.isFinite(contentLength) && contentLength > 0 && contentLength <= 1024 * 1024);

    if (shouldBufferResponse) {
      return reply.send(Buffer.from(await upstreamResponse.arrayBuffer()));
    }

    /*
     * Stream large provider responses through instead of buffering them whole.
     * connector-proxy never rewrites binary bodies, and provider downloads can
     * be large enough that buffering risks avoidable memory pressure.
     */
    return reply.send(Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>));
  });

  return app;
}

type TokenVerificationFailure = {
  ok: false;
  status: number;
  error: string;
  code: ConnectorErrorBody['code'];
};

type TokenVerificationSuccess = {
  ok: true;
  payload: {
    workspaceId: string;
    projectId: string;
    userId: string;
    organizationId: string;
    agentSessionId?: string;
  };
};

function verifyAccessTokenFromRequest(
  request: FastifyRequest,
  secret: string,
): TokenVerificationSuccess | TokenVerificationFailure {
  const authorization = request.headers.authorization;

  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return {
      ok: false,
      status: 401,
      error: 'Missing bearer token',
      code: 'CONNECTOR_TOKEN_MISSING',
    };
  }

  const token = authorization.slice('bearer '.length).trim();
  const result = verifyConnectorAccessToken({ token, secret });

  if (!result.ok || !result.payload) {
    if (result.reason === 'expired') {
      return {
        ok: false,
        status: 401,
        error: 'Access token expired',
        code: 'CONNECTOR_TOKEN_EXPIRED',
      };
    }

    return {
      ok: false,
      status: 401,
      error: 'Invalid access token',
      code: 'CONNECTOR_TOKEN_INVALID',
    };
  }

  return {
    ok: true,
    payload: {
      workspaceId: result.payload.workspaceId,
      projectId: result.payload.projectId,
      userId: result.payload.userId,
      organizationId: result.payload.organizationId,
      agentSessionId: result.payload.agentSessionId,
    },
  };
}

function buildUpstreamHeaders(
  request: FastifyRequest,
  accessToken: string,
  scheme: 'bearer' | 'token',
  defaultAccept: string,
) {
  const headers: Record<string, string> = {};

  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value !== 'string') {
      continue;
    }

    const lower = name.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lower) || lower === 'user-agent') {
      continue;
    }

    headers[name] = value;
  }

  headers.authorization = scheme === 'token' ? `token ${accessToken}` : `Bearer ${accessToken}`;
  headers['user-agent'] = 'e-code-connector-proxy';

  if (!headers.accept) {
    headers.accept = defaultAccept;
  }

  return headers;
}

function shouldStreamBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

function sendError(reply: FastifyReply, status: number, body: ConnectorErrorBody) {
  return reply.code(status).send(body);
}
