import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { verifyConnectorAccessToken, type ConnectorErrorBody } from '@vibecore/connector-sdk';

export interface ConnectorProxyOptions {
  logger?: boolean;
  // Shared secret used to verify HMAC access tokens minted by the API
  // service. Required at runtime — the constructor throws if missing,
  // matching the behaviour of the rest of the platform services.
  accessTokenSecret: string;
  // Optional fetch override for tests.
  fetchImpl?: typeof fetch;
}

export async function buildConnectorProxyApp(options: ConnectorProxyOptions): Promise<FastifyInstance> {
  if (!options.accessTokenSecret || options.accessTokenSecret.length < 16) {
    throw new Error('CONNECTOR_PROXY_ACCESS_TOKEN_SECRET must be at least 16 characters');
  }

  const app = Fastify({ logger: options.logger ?? false });

  app.get('/health', async () => ({ status: 'ok', service: 'connector-proxy' }));

  app.all('/proxy/:userConnectionId/*', async (request, reply) => {
    const tokenVerification = verifyAccessTokenFromRequest(request, options.accessTokenSecret);

    if (!tokenVerification.ok) {
      return sendError(reply, tokenVerification.status, {
        error: tokenVerification.error,
        code: tokenVerification.code,
      });
    }

    // Phase 0 stops here. The full ACL chain (ProjectConnectionLink lookup,
    // OrganizationConnectorPolicy match, rate limit, provider routing,
    // 401/403 → ReconnectionAlert) lands in Phase 1 when the GitHub
    // connector goes end-to-end. Returning a stable 501 lets callers
    // assert wiring without hitting an unimplemented branch silently.
    return sendError(reply, 501, {
      error: 'Connector proxy is not yet wired to providers',
      code: 'CONNECTOR_UNKNOWN_PROVIDER',
      detail: 'Phase 0 skeleton — provider routing arrives in Phase 1.',
    });
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

function sendError(reply: FastifyReply, status: number, body: ConnectorErrorBody) {
  return reply.code(status).send(body);
}
