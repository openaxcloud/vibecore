import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

export interface PreviewProxyOptions {
  logger?: boolean;
  workspaceManagerUrl?: string;
  proxySharedSecret?: string;
  fetchImpl?: typeof fetch;
  resolveAgent?: (workspaceId: string) => Promise<{ baseUrl: string; token: string } | undefined>;
  requestTimeoutMs?: number;
}

type PreviewRouteParams = { workspaceId: string; port: string; '*'?: string };

export async function buildPreviewProxyApp(options: PreviewProxyOptions = {}): Promise<FastifyInstance> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/health', async () => ({ status: 'ok', service: 'preview-proxy' }));

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
    const upstream = new URL(`${agent.baseUrl.replace(/\/$/, '')}${upstreamPath}${queryString}`);
    const headers: Record<string, string> = {
      authorization: `Bearer ${agent.token}`,
      'x-vibecore-workspace': params.workspaceId,
      'x-vibecore-preview-port': String(portNumber),
    };

    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value !== 'string') continue;
      const lower = name.toLowerCase();
      if (lower === 'host' || lower === 'authorization' || lower === 'cookie' || lower.startsWith('x-vibecore-'))
        continue;
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
      upstreamResponse.headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        if (
          lower === 'content-encoding' ||
          lower === 'transfer-encoding' ||
          lower === 'connection' ||
          lower === 'keep-alive'
        ) {
          return;
        }
        reply.header(name, value);
      });

      if (!upstreamResponse.body) {
        return reply.send();
      }

      return reply.send(Buffer.from(await upstreamResponse.arrayBuffer()));
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

function defaultResolveAgent(options: PreviewProxyOptions, fetchImpl: typeof fetch) {
  return async (workspaceId: string) => {
    const managerUrl = options.workspaceManagerUrl;
    const secret = normalizeSharedSecret(options.proxySharedSecret);

    if (!managerUrl || !secret) {
      return undefined;
    }

    const response = await fetchImpl(`${managerUrl.replace(/\/$/, '')}/internal/workspaces/${workspaceId}/agent`, {
      headers: { authorization: `Bearer ${secret}` },
    });

    if (!response.ok) return undefined;

    const body = (await response.json()) as { baseUrl?: string; token?: string };
    if (!body.baseUrl || !body.token) return undefined;
    return { baseUrl: body.baseUrl, token: body.token };
  };
}

function normalizeSharedSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
