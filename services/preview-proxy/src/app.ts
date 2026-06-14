import { Readable } from 'node:stream';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { INSPECTOR_SCRIPT } from './inspector-script.js';

/*
 * Upper bound on how large an HTML document we will buffer in memory to inject
 * the inspector script. Anything larger is streamed through unmodified — a
 * multi-MB HTML page never needs inspector injection, and buffering arbitrary
 * upstream bodies would let a large response OOM the proxy.
 */
const MAX_INJECT_BYTES = 4 * 1024 * 1024;

export interface PreviewProxyOptions {
  logger?: boolean;
  workspaceManagerUrl?: string;
  proxySharedSecret?: string;
  isProduction?: boolean;
  fetchImpl?: typeof fetch;
  resolveAgent?: (workspaceId: string) => Promise<{ baseUrl: string; token: string } | undefined>;
  requestTimeoutMs?: number;
  /**
   * Inject the inspect-to-code bridge into proxied HTML so "Inspect to code"
   * works on remote previews (the same capability WebContainer previews get).
   * Defaults to true.
   */
  injectInspector?: boolean;
}

// Same-origin path the injected <script src> points at, served below. Same
// origin keeps it compatible with a `script-src 'self'` CSP on the preview app.
const INSPECTOR_SCRIPT_PATH = '/__vibecore/inspector-script.js';
const INSPECTOR_MARKER = 'data-vibecore-inspector';

type PreviewRouteParams = { workspaceId: string; port: string; '*'?: string };

export async function buildPreviewProxyApp(options: PreviewProxyOptions = {}): Promise<FastifyInstance> {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';

  if (isProduction && !options.resolveAgent) {
    assertProductionDefaultResolverConfig(options);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const injectInspector = options.injectInspector ?? true;
  const app = Fastify({ logger: options.logger ?? false });

  /*
   * We stream request.raw straight to the upstream agent, so Fastify's default
   * application/json and text/plain parsers must NOT consume the body first.
   * A catch-all no-op parser leaves request.raw intact for every content type;
   * without it, POST/PUT/PATCH bodies are silently dropped.
   */
  app.addContentTypeParser('*', (_req, _payload, done) => done(null, undefined));

  app.get('/health', async () => ({ status: 'ok', service: 'preview-proxy' }));

  // Serve the inspect-to-code bridge from the proxy origin so injected pages
  // can load it under a `script-src 'self'` policy.
  app.get(INSPECTOR_SCRIPT_PATH, async (_request, reply) => {
    reply.header('content-type', 'application/javascript; charset=utf-8');
    reply.header('cache-control', 'public, max-age=3600');

    return reply.send(INSPECTOR_SCRIPT);
  });

  const resolveAgent = options.resolveAgent ?? defaultResolveAgent(options, fetchImpl);

  const handlePreviewRequest = async (request: FastifyRequest<{ Params: PreviewRouteParams }>, reply: FastifyReply) => {
    const params = request.params;
    const portNumber = Number(params.port);

    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      return reply.code(400).send({ error: 'Invalid preview port', code: 'PREVIEW_PORT_INVALID' });
    }

    const agent = await resolveAgent(params.workspaceId).catch(() => undefined);

    if (!agent) {
      return reply.code(404).send({ error: 'Workspace agent not reachable', code: 'PREVIEW_AGENT_NOT_FOUND' });
    }

    const proxyPath = params['*'] ?? '';

    /*
     * Fastify URL-DECODES the wildcard param, so an encoded '?' (%3F) or '#'
     * (%23) in the path arrives literally and, concatenated into the upstream URL
     * string below, is mis-read as the query/fragment delimiter — truncating or
     * corrupting the path. Re-encode just those two delimiters (other special
     * chars are handled by the URL constructor) before building the URL.
     */
    const safeProxyPath = proxyPath.replace(/\?/g, '%3F').replace(/#/g, '%23');
    const upstreamPath = `/preview/${portNumber}/${safeProxyPath}`;
    const queryString = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
    let upstream: URL;

    try {
      upstream = new URL(`${agent.baseUrl.replace(/\/$/, '')}${upstreamPath}${queryString}`);
    } catch {
      return reply.code(400).send({ error: 'Invalid preview path', code: 'PREVIEW_PATH_INVALID' });
    }

    /*
     * Reject dot-segment traversal: after URL normalization the resolved path
     * must still live under the agent's /preview/{port}/ prefix. Without this,
     * `..%2f..%2ffiles/read` etc. escape to the agent's privileged endpoints
     * (/files/read, /commands/run), which the proxy would then hit WITH the
     * valid agent bearer token — unauthenticated traversal escalating to RCE.
     */
    const expectedPrefix = `${new URL(`${agent.baseUrl.replace(/\/$/, '')}/`).pathname.replace(/\/$/, '')}/preview/${portNumber}/`;

    if (!upstream.pathname.startsWith(expectedPrefix)) {
      return reply.code(400).send({ error: 'Invalid preview path', code: 'PREVIEW_PATH_INVALID' });
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${agent.token}`,
      'x-vibecore-workspace': params.workspaceId,
      'x-vibecore-preview-port': String(portNumber),
    };

    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value !== 'string') continue;
      const lower = name.toLowerCase();
      if (
        lower === 'host' ||
        lower === 'authorization' ||
        lower === 'cookie' ||
        lower === 'connection' ||
        lower === 'keep-alive' ||
        lower === 'transfer-encoding' ||
        lower === 'content-length' ||
        lower === 'upgrade' ||
        lower === 'forwarded' ||
        lower.startsWith('x-forwarded-') ||
        lower.startsWith('x-vibecore-')
      ) {
        continue;
      }

      headers[name] = value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    /*
     * When we hand a Readable to reply.send the body streams AFTER this function
     * returns, so the finally-block clearTimeout would kill the abort timer
     * before the transfer finishes — leaving a stalled upstream body with no
     * timeout. Mark a streaming handoff and clear the timer on stream
     * end/close/error instead so the body transfer stays bounded.
     */
    let streamingHandoff = false;
    const sendStream = (readable: Readable) => {
      streamingHandoff = true;
      const clear = () => clearTimeout(timeout);
      readable.on('close', clear);
      readable.on('end', clear);
      readable.on('error', clear);

      return reply.send(readable);
    };

    try {
      const upstreamResponse = await fetchImpl(upstream, {
        method: request.method,
        headers,
        body: shouldStreamBody(request.method) ? (request.raw as unknown as ReadableStream<Uint8Array>) : undefined,
        signal: controller.signal,
        /*
         * Do NOT follow redirects. The path-traversal sandbox + agent resolution
         * validate the INITIAL upstream URL only; with the default redirect:'follow'
         * the workspace dev server (attacker-controlled app code) could 3xx us to
         * an internal address or out of the /preview/{port}/ sandbox while carrying
         * the agent bearer token. Surface the 3xx to the client verbatim instead.
         */
        redirect: 'manual',
        ...({ duplex: 'half' } as Record<string, unknown>),
      });

      /*
       * The timeout bounds connection+headers only. Once the upstream response
       * headers have arrived the connection succeeded, so clear it — otherwise it
       * aborts long-lived/large streamed bodies (SSE, big downloads, slow clients)
       * at 30s mid-transfer. The streamed-body paths below already bound their own
       * lifecycle via stream end/close/error.
       */
      clearTimeout(timeout);

      reply.status(upstreamResponse.status);

      const contentType = upstreamResponse.headers.get('content-type') ?? '';
      /*
       * Only treat the body as injectable HTML when it is UTF-8 (or has no
       * declared charset, which we read as UTF-8). The inspector injection
       * buffers + toString('utf8'); doing that to an ISO-8859-1 / Shift_JIS / etc.
       * page corrupts every non-ASCII byte. For non-UTF-8 HTML, fall through to
       * the byte-exact stream-through path instead of rewriting it.
       */
      const charset = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType)?.[1]?.toLowerCase();
      const isUtf8 = !charset || charset === 'utf-8' || charset === 'utf8';
      const isHtml = contentType.includes('text/html') && isUtf8;

      /*
       * undici's fetch transparently DECODES gzip/deflate/br bodies — the body
       * we stream is decompressed, but upstreamResponse.headers still reports the
       * original (compressed) content-length. Forwarding that stale length with a
       * decoded body truncates/corrupts every compressed asset. So whenever the
       * upstream declared a content-encoding (which we strip below), we must also
       * drop content-length and let the transfer be length-less/chunked.
       */
      const upstreamWasEncoded = upstreamResponse.headers.has('content-encoding');

      upstreamResponse.headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        if (
          lower === 'content-encoding' ||
          lower === 'transfer-encoding' ||
          lower === 'connection' ||
          lower === 'keep-alive' ||
          // length no longer matches the decoded body
          (upstreamWasEncoded && lower === 'content-length') ||
          // recomputed after a possible body rewrite below
          (isHtml && injectInspector && lower === 'content-length')
        ) {
          return;
        }
        reply.header(name, value);
      });

      if (!upstreamResponse.body) {
        return reply.send();
      }

      /*
       * Only buffer when we actually rewrite the body (HTML inspector injection).
       * The bulk of preview traffic (JS/CSS/images/data) is streamed straight
       * through, so a large asset can never be buffered into the proxy heap.
       */
      if (!(isHtml && injectInspector)) {
        return sendStream(Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>));
      }

      // Inspector-injection path: bound the in-memory buffer. If the document is
      // implausibly large for injection, stream it through unmodified instead.
      const declaredLength = Number(upstreamResponse.headers.get('content-length') ?? '');

      if (Number.isFinite(declaredLength) && declaredLength > MAX_INJECT_BYTES) {
        // Only re-assert content-length when the body is NOT decoded. If the
        // upstream was content-encoded, undici hands us the DECODED stream while
        // declaredLength is the compressed size — setting it truncates the body.
        if (!upstreamWasEncoded) {
          reply.header('content-length', String(declaredLength));
        }

        return sendStream(Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>));
      }

      /*
       * Content-Length absent/chunked (Number('')===0, Number(undefined)===NaN):
       * the old arrayBuffer() here still materialized the whole body before the
       * size check, so a large no-Content-Length response could OOM the proxy.
       * Read through a bounded reader instead and bail to pass-through streaming
       * the moment we cross the cap, so nothing is ever fully buffered.
       */
      const reader = (upstreamResponse.body as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      let overflow = false;

      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (value) {
          chunks.push(value);
          total += value.length;

          if (total > MAX_INJECT_BYTES) {
            overflow = true;
            break;
          }
        }
      }

      if (overflow) {
        // Too large to inject — stream the prefix already read, then the rest.
        const prefix = chunks;
        async function* passthrough() {
          try {
            for (const chunk of prefix) {
              yield chunk;
            }

            for (;;) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              if (value) {
                yield value;
              }
            }
          } finally {
            /*
             * Cancel the upstream reader when the generator terminates — including
             * early termination when the client disconnects and Readable.from()
             * calls generator.return(). Without this the reader keeps its lock on
             * the upstream body and the upstream socket is never released.
             */
            await reader.cancel().catch(() => {});
          }
        }

        return sendStream(Readable.from(passthrough()));
      }

      /*
       * Non-overflow path: the body was fully read (done), so release the reader's
       * lock on the upstream stream. Only the overflow path hands the reader off to
       * the passthrough generator (which cancels it); here it would otherwise stay
       * locked, leaking the upstream connection.
       */
      reader.releaseLock();

      const bodyBuffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
      const injected = injectInspectorScript(bodyBuffer.toString('utf8'));
      const outBuffer = Buffer.from(injected, 'utf8');
      reply.header('content-length', String(outBuffer.length));

      return reply.send(outBuffer);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return reply.code(504).send({ error: 'Preview upstream timeout', code: 'PREVIEW_UPSTREAM_TIMEOUT' });
      }
      return reply
        .code(502)
        .send({ error: 'Preview upstream error', code: 'PREVIEW_UPSTREAM_ERROR', detail: error?.message });
    } finally {
      // Streamed responses clear the timer on stream completion (see sendStream);
      // only clear here for the fully-buffered/early-return paths.
      if (!streamingHandoff) {
        clearTimeout(timeout);
      }
    }
  };

  app.all('/p/:workspaceId/:port', handlePreviewRequest);
  app.all('/p/:workspaceId/:port/*', handlePreviewRequest);

  return app;
}

function shouldStreamBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

/*
 * Insert the inspect-to-code bridge <script> into a proxied HTML document. The
 * script is inert until the parent IDE activates it (INSPECTOR_ACTIVATE), so
 * injecting it unconditionally has no effect on the running app. Idempotent:
 * never injects twice, even if an upstream page already carries the marker.
 */
export function injectInspectorScript(html: string): string {
  if (html.includes(INSPECTOR_MARKER)) {
    return html;
  }

  const tag = `<script src="${INSPECTOR_SCRIPT_PATH}" ${INSPECTOR_MARKER}></script>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${tag}</head>`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1${tag}`);
  }

  // No <head>/<body> (fragment or minimal doc): prepend so it still loads.
  return `${tag}${html}`;
}

function defaultResolveAgent(options: PreviewProxyOptions, fetchImpl: typeof fetch) {
  return async (workspaceId: string) => {
    const managerUrl = options.workspaceManagerUrl;
    const secret = normalizeSharedSecret(options.proxySharedSecret);

    if (!managerUrl || !secret) {
      return undefined;
    }

    const response = await fetchImpl(
      `${managerUrl.replace(/\/$/, '')}/internal/workspaces/${encodeURIComponent(workspaceId)}/agent`,
      {
        headers: { authorization: `Bearer ${secret}` },
        // Don't let a hung workspace-manager stall every preview request indefinitely.
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) return undefined;

    const body = (await response.json()) as { baseUrl?: string; token?: string };
    if (!body.baseUrl || !body.token) return undefined;
    return { baseUrl: body.baseUrl, token: body.token };
  };
}

function assertProductionDefaultResolverConfig(options: PreviewProxyOptions) {
  const managerUrl = options.workspaceManagerUrl?.trim();
  const secret = normalizeSharedSecret(options.proxySharedSecret);

  if (!managerUrl) {
    throw new Error('WORKSPACE_MANAGER_URL is required in production for preview-proxy.');
  }

  if (!secret) {
    throw new Error('PREVIEW_PROXY_SHARED_SECRET is required in production for preview-proxy.');
  }

  let url: URL;

  try {
    url = new URL(managerUrl);
  } catch {
    throw new Error('WORKSPACE_MANAGER_URL must be an absolute URL in production for preview-proxy.');
  }

  const isInternalKubernetesService =
    url.protocol === 'http:' && (url.hostname.endsWith('.svc') || url.hostname.endsWith('.svc.cluster.local'));
  const isHttps = url.protocol === 'https:';

  if (!isHttps && !isInternalKubernetesService) {
    throw new Error('WORKSPACE_MANAGER_URL must use HTTPS or an internal Kubernetes service DNS URL in production.');
  }

  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) {
    throw new Error('WORKSPACE_MANAGER_URL must not point to localhost in production.');
  }
}

function normalizeSharedSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
