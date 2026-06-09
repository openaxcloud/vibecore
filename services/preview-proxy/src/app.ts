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

  const handlePreviewRequest = async (
    request: FastifyRequest<{ Params: PreviewRouteParams }>,
    reply: FastifyReply,
  ) => {
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
    const upstreamPath = `/preview/${portNumber}/${proxyPath}`;
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

    try {
      const upstreamResponse = await fetchImpl(upstream, {
        method: request.method,
        headers,
        body: shouldStreamBody(request.method)
          ? (request.raw as unknown as ReadableStream<Uint8Array>)
          : undefined,
        signal: controller.signal,
        ...({ duplex: 'half' } as Record<string, unknown>),
      });

      reply.status(upstreamResponse.status);

      const contentType = upstreamResponse.headers.get('content-type') ?? '';
      const isHtml = contentType.includes('text/html');

      upstreamResponse.headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        if (
          lower === 'content-encoding' ||
          lower === 'transfer-encoding' ||
          lower === 'connection' ||
          lower === 'keep-alive' ||
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
        return reply.send(Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>));
      }

      // Inspector-injection path: bound the in-memory buffer. If the document is
      // implausibly large for injection, stream it through unmodified instead.
      const declaredLength = Number(upstreamResponse.headers.get('content-length') ?? '');

      if (Number.isFinite(declaredLength) && declaredLength > MAX_INJECT_BYTES) {
        reply.header('content-length', String(declaredLength));

        return reply.send(Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>));
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
        }

        return reply.send(Readable.from(passthrough()));
      }

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
      clearTimeout(timeout);
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
