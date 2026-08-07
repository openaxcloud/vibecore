import { Readable } from 'node:stream';
import { verifyConnectorAccessToken, type ConnectorErrorCode } from '@vibecore/connector-sdk';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import { sendConnectorProxyError } from './public-i18n.js';

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
      code: ConnectorErrorCode;
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

function readableFromWebStream(stream: ReadableStream<Uint8Array>) {
  return Readable.from(
    (async function* readWebStream() {
      const reader = stream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            return;
          }

          if (value) {
            yield Buffer.from(value);
          }
        }
      } finally {
        reader.releaseLock();
      }
    })(),
  );
}

/**
 * Re-encode the URL delimiters '?' and '#' in the forwarded path.
 *
 * Fastify URL-DECODES the wildcard route param, so a provider path containing
 * an encoded '?' (%3F) or '#' (%23) — e.g. a GitHub Contents API request for a
 * file literally named `a#b.txt` (`…/contents/a%23b.txt`) — arrives here with
 * the literal delimiter. Concatenated into the upstream URL string and parsed by
 * `new URL(...)`, that '#' is read as a fragment delimiter (dropping the rest of
 * the path) and '?' as a query delimiter (mangling the path into a bogus query),
 * causing the wrong upstream resource to be fetched with the user's token. The
 * traversal guard only inspects the already-truncated pathname, so it does not
 * catch this. Re-encode just those two delimiters (the URL constructor handles
 * the remaining special characters) before building the upstream URL. Mirrors the
 * sibling preview-proxy fix.
 */
export function encodeUpstreamPathDelimiters(wildcard: string | undefined): string {
  if (!wildcard) {
    return '';
  }

  return wildcard.replace(/\?/g, '%3F').replace(/#/g, '%23');
}

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
      return sendConnectorProxyError(request, reply, tokenVerification.status, tokenVerification.code);
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
      return sendConnectorProxyError(request, reply, resolution.status, resolution.code);
    }

    const upstream = PROVIDER_UPSTREAMS[resolution.provider];

    if (!upstream) {
      return sendConnectorProxyError(request, reply, 501, 'CONNECTOR_UNKNOWN_PROVIDER');
    }

    const safeWildcard = encodeUpstreamPathDelimiters(params['*']);
    const upstreamPath = safeWildcard ? `/${safeWildcard}` : '/';
    const queryString = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';

    /*
     * Reject path traversal in the forwarded path. Providers whose base URL
     * carries a path prefix (e.g. gitlab `…/api/v4`) would otherwise let a `..`
     * segment normalize out of the prefix and reach a more sensitive sibling
     * endpoint (e.g. gitlab.com/oauth/token) with the user's bearer token. Verify
     * the resolved URL stays under the provider base before forwarding.
     */
    const upstreamUrl = `${upstream.baseUrl}${upstreamPath}${queryString}`;
    const baseUrl = new URL(upstream.baseUrl);

    let resolvedUrl: URL;

    try {
      resolvedUrl = new URL(upstreamUrl);
    } catch {
      return sendConnectorProxyError(request, reply, 400, 'CONNECTOR_INVALID_PATH');
    }

    const basePathPrefix = baseUrl.pathname.replace(/\/+$/, '');

    if (
      resolvedUrl.origin !== baseUrl.origin ||
      (basePathPrefix &&
        resolvedUrl.pathname !== basePathPrefix &&
        !resolvedUrl.pathname.startsWith(`${basePathPrefix}/`))
    ) {
      return sendConnectorProxyError(request, reply, 400, 'CONNECTOR_PATH_TRAVERSAL');
    }

    const headers = buildUpstreamHeaders(request, resolution.accessToken, upstream.auth, upstream.defaultAccept);
    const body = shouldStreamBody(request.method) ? (request.raw as unknown as ReadableStream<Uint8Array>) : undefined;

    let upstreamResponse: Response;

    /*
     * Bound only the connect/headers phase with the timeout, then clear it once
     * the response headers arrive. AbortSignal.timeout(30s) governs the WHOLE
     * response lifetime, so a large/slow streamed provider body was aborted and
     * silently truncated at 30s mid-transfer. A manual controller lets us stop the
     * timer before streaming the body.
     */
    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), 30_000);

    try {
      upstreamResponse = await fetchImpl(resolvedUrl.toString(), {
        method: request.method,
        headers,
        body,
        signal: controller.signal,

        /*
         * Do NOT follow redirects: a provider open-redirect/parameter-reflection
         * endpoint could 3xx us to an internal address — redirect-based SSRF.
         * Return the 3xx to the caller instead of chasing it.
         */
        redirect: 'manual',
        ...({ duplex: 'half' } as Record<string, unknown>),
      });
    } catch (error: any) {
      clearTimeout(connectTimeout);

      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';

      return sendConnectorProxyError(request, reply, timedOut ? 504 : 502, 'CONNECTOR_PROVIDER_UNREACHABLE');
    }

    // Headers received — the connect phase is done; let the body stream unbounded.
    clearTimeout(connectTimeout);

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

    /*
     * undici decodes gzip/deflate/br, so the body we forward is decoded but
     * content-length still reflects the compressed size — drop it (and the
     * content-encoding) so a decoded body isn't truncated to the compressed length.
     */
    const upstreamWasEncoded = upstreamResponse.headers.has('content-encoding');

    upstreamResponse.headers.forEach((value, name) => {
      const lower = name.toLowerCase();

      if (HOP_BY_HOP_HEADERS.has(lower)) {
        return;
      }

      if (lower === 'content-encoding') {
        return;
      }

      if (upstreamWasEncoded && lower === 'content-length') {
        return;
      }

      reply.header(name, value);
    });

    if (!upstreamResponse.body) {
      return reply.send();
    }

    /*
     * If the CLIENT disconnects while we are still consuming the upstream body,
     * abort the upstream fetch — otherwise the token-bearing request to the
     * provider keeps running to completion with no consumer, wasting the
     * provider's rate budget and a local socket. This must cover BOTH the
     * buffered branch (`await upstreamResponse.arrayBuffer()` can be in flight
     * for up to BODY_MAX_DURATION_MS against a slow provider) and the streaming
     * branch, so register it before the buffer/stream split.
     */
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) {
        controller.abort();
      }
    });

    const contentLength = Number(upstreamResponse.headers.get('content-length') ?? '0');
    const MAX_BUFFER_BYTES = 1024 * 1024;

    // Absolute cap on the streamed body phase (slow-loris upstream guard).
    const BODY_MAX_DURATION_MS = Number(process.env.CONNECTOR_PROXY_BODY_TIMEOUT_MS) || 300_000;

    /*
     * Only buffer responses whose declared size is known AND small. The old check
     * buffered ANY application/json or text/* body regardless of size, so a large
     * (or no-/lying-Content-Length) provider response was arrayBuffer()'d whole
     * into the proxy heap — an OOM/DoS vector. Everything else streams through
     * (connector-proxy never rewrites bodies).
     */
    /*
     * Never buffer a content-encoded response by its declared length: that length
     * is the COMPRESSED size, but arrayBuffer() returns the undici-DECODED body —
     * a small gzip can decompress to gigabytes and OOM the proxy heap
     * (decompression bomb). Stream encoded bodies through instead (piped, bounded
     * by backpressure).
     */
    const shouldBufferResponse =
      !upstreamWasEncoded && Number.isFinite(contentLength) && contentLength > 0 && contentLength <= MAX_BUFFER_BYTES;

    if (shouldBufferResponse) {
      /*
       * Bound the body phase here too: the connect timeout was already cleared
       * once headers arrived, so a slow-loris upstream that honestly advertises a
       * small Content-Length then stalls the bytes would pin arrayBuffer() (and
       * this reply) open indefinitely. Mirror the streaming branch's deadline.
       */
      const bufferDeadline = setTimeout(() => controller.abort(), BODY_MAX_DURATION_MS);
      bufferDeadline.unref?.();

      try {
        return reply.send(Buffer.from(await upstreamResponse.arrayBuffer()));
      } finally {
        clearTimeout(bufferDeadline);
      }
    }

    /*
     * Stream large provider responses through instead of buffering them whole.
     * connector-proxy never rewrites binary bodies, and provider downloads can
     * be large enough that buffering risks avoidable memory pressure. The
     * client-disconnect abort handler is registered above (it covers both the
     * buffered and streamed branches).
     */

    /*
     * Bound the BODY phase too. The connect timeout was cleared once headers
     * arrived (so legit large downloads aren't truncated), but nothing then capped
     * the transfer — a slow-loris upstream that dribbles/stalls the body could pin
     * the proxy connection indefinitely. Abort after an absolute max duration;
     * cleared when the response finishes normally.
     */
    const bodyDeadline = setTimeout(() => controller.abort(), BODY_MAX_DURATION_MS);
    bodyDeadline.unref?.();
    reply.raw.on('finish', () => clearTimeout(bodyDeadline));
    reply.raw.on('close', () => clearTimeout(bodyDeadline));

    return reply.send(readableFromWebStream(upstreamResponse.body as ReadableStream<Uint8Array>));
  });

  return app;
}

type TokenVerificationFailure = {
  ok: false;
  status: number;
  code: ConnectorErrorCode;
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
        code: 'CONNECTOR_TOKEN_EXPIRED',
      };
    }

    return {
      ok: false,
      status: 401,
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
