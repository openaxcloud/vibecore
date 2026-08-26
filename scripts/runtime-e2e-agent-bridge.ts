import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import WebSocket, { WebSocketServer, type RawData } from 'ws';

const WORKSPACE_ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/;
const K8S_NAME = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
const SAFE_CLUSTER_PREFIX = 'vibecore-e2e-runtime-';

export interface AgentBridgeOptions {
  host?: string;
  port?: number;
  resolveAgentPort: (workspaceId: string) => Promise<number>;
}

export interface AgentBridge {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export interface BridgeRoute {
  workspaceId: string;
  upstreamPath: string;
}

/**
 * Route `/<workspaceId>/<agent path>` to one workspace-agent. The workspace id
 * is deliberately a single strict path segment: accepting encoded slashes or
 * dot segments here would turn this CI-only bridge into an arbitrary service
 * proxy with the runner's Kubernetes credentials.
 */
export function parseBridgeRoute(rawUrl: string | undefined): BridgeRoute | undefined {
  if (!rawUrl) {
    return undefined;
  }

  const rawPathSegments = rawUrl.split(/[?#]/, 1)[0].split('/');

  for (const segment of rawPathSegments) {
    try {
      const decoded = decodeURIComponent(segment);

      if (decoded === '.' || decoded === '..' || decoded.includes('/')) {
        return undefined;
      }
    } catch {
      return undefined;
    }
  }

  const parsed = new URL(rawUrl, 'http://runtime-e2e-bridge.local');
  const match = /^\/([^/]+)(\/.*)?$/.exec(parsed.pathname);

  if (!match) {
    return undefined;
  }

  let workspaceId: string;

  try {
    workspaceId = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }

  if (!WORKSPACE_ID.test(workspaceId) || workspaceId === '.' || workspaceId === '..') {
    return undefined;
  }

  const upstreamPath = `${match[2] || '/'}${parsed.search}`;

  return { workspaceId, upstreamPath };
}

export async function startAgentBridge(options: AgentBridgeOptions): Promise<AgentBridge> {
  const host = options.host ?? '127.0.0.1';
  const webSocketServer = new WebSocketServer({ noServer: true });

  const server = createServer((request, response) => {
    void handleHttpRequest(request, response, options.resolveAgentPort);
  });

  server.on('upgrade', (request, socket, head) => {
    const route = parseBridgeRoute(request.url);

    if (!route) {
      socket.destroy();
      return;
    }

    void options
      .resolveAgentPort(route.workspaceId)
      .then((port) => {
        const protocols = String(request.headers['sec-websocket-protocol'] ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        const upstream = new WebSocket(
          `ws://127.0.0.1:${port}${route.upstreamPath}`,
          protocols.length > 0 ? protocols : undefined,
          { headers: forwardHeaders(request.headers, true) },
        );

        const queuedUpstreamMessages: Array<{ data: RawData; binary: boolean }> = [];

        const queueUpstreamMessage = (data: RawData, binary: boolean) => {
          queuedUpstreamMessages.push({ data, binary });
        };

        let downstream: WebSocket | undefined;

        upstream.on('message', queueUpstreamMessage);

        upstream.once('open', () => {
          webSocketServer.handleUpgrade(request, socket, head, (accepted) => {
            downstream = accepted;
            upstream.off('message', queueUpstreamMessage);
            pipeWebSockets(accepted, upstream, queuedUpstreamMessages);
          });
        });
        upstream.once('unexpected-response', (_upstreamRequest, upstreamResponse) => {
          if (!socket.destroyed) {
            socket.end(`HTTP/1.1 ${upstreamResponse.statusCode ?? 502} Bad Gateway\r\nConnection: close\r\n\r\n`);
          }
        });
        upstream.once('error', () => {
          downstream?.terminate();

          if (!socket.destroyed) {
            socket.destroy();
          }
        });
      })
      .catch(() => socket.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://${host}:${address.port}`,
    async close() {
      for (const client of webSocketServer.clients) {
        client.terminate();
      }

      webSocketServer.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        server.closeAllConnections();
      });
    },
  };
}

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  resolveAgentPort: AgentBridgeOptions['resolveAgentPort'],
) {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'runtime-e2e-agent-bridge' }));

    return;
  }

  const route = parseBridgeRoute(request.url);

  if (!route) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'invalid_workspace_route' }));

    return;
  }

  try {
    const port = await resolveAgentPort(route.workspaceId);

    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: route.upstreamPath,
        method: request.method,
        headers: forwardHeaders(request.headers, false),
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );

    upstream.once('error', (error) => {
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'application/json' });
      }

      response.end(JSON.stringify({ error: 'workspace_agent_unreachable', detail: error.message }));
    });
    request.pipe(upstream);
  } catch (error) {
    response.writeHead(502, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: 'workspace_port_forward_failed',
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

function forwardHeaders(headers: IncomingMessage['headers'], websocket: boolean): Record<string, string | string[]> {
  const blocked = new Set([
    'host',
    'connection',
    'upgrade',
    'proxy-connection',
    ...(websocket
      ? ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol']
      : []),
  ]);

  const forwarded: Record<string, string | string[]> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!blocked.has(name.toLowerCase()) && value !== undefined) {
      forwarded[name] = value;
    }
  }

  return forwarded;
}

function pipeWebSockets(
  downstream: WebSocket,
  upstream: WebSocket,
  queuedUpstreamMessages: Array<{ data: RawData; binary: boolean }>,
) {
  downstream.on('message', (data, binary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary });
    }
  });
  upstream.on('message', (data, binary) => {
    if (downstream.readyState === WebSocket.OPEN) {
      downstream.send(data, { binary });
    }
  });

  for (const message of queuedUpstreamMessages) {
    downstream.send(message.data, { binary: message.binary });
  }
  downstream.on('close', (code, reason) => closeWebSocketPeer(upstream, code, reason));
  upstream.on('close', (code, reason) => closeWebSocketPeer(downstream, code, reason));
  downstream.on('error', () => upstream.terminate());
  upstream.on('error', () => downstream.terminate());
}

function closeWebSocketPeer(peer: WebSocket, code: number, reason: Buffer) {
  if (peer.readyState === WebSocket.CLOSED || peer.readyState === WebSocket.CLOSING) {
    return;
  }

  /*
   * RFC 6455 reserves 1005/1006/1015 for local reporting; ws rejects them as
   * close-frame status codes. Terminate the peer when no wire-safe code exists.
   */
  if (code === 1000 || (code >= 3000 && code <= 4999)) {
    peer.close(code, reason);
  } else {
    peer.terminate();
  }
}

interface ForwardRecord {
  child: ChildProcess;
  port: number;
}

export class KubectlPortForwardRegistry {
  readonly #records = new Map<string, Promise<ForwardRecord>>();

  constructor(
    readonly kubeconfig: string,
    readonly context: string,
    readonly namespace: string,
  ) {
    if (!isAbsolute(kubeconfig)) {
      throw new Error('E2E_RUNTIME_KUBECONFIG must be an absolute path.');
    }

    if (!context.startsWith(`kind-${SAFE_CLUSTER_PREFIX}`)) {
      throw new Error(`Refusing non-audit Kubernetes context: ${context}`);
    }

    if (!K8S_NAME.test(namespace)) {
      throw new Error(`Invalid runtime namespace: ${namespace}`);
    }
  }

  resolve(workspaceId: string): Promise<number> {
    if (!WORKSPACE_ID.test(workspaceId)) {
      return Promise.reject(new Error(`Invalid workspace id: ${workspaceId}`));
    }

    let record = this.#records.get(workspaceId);

    if (!record) {
      record = this.#start(workspaceId);
      this.#records.set(workspaceId, record);
      record.catch(() => this.#records.delete(workspaceId));
    }

    return record.then((value) => value.port);
  }

  async close() {
    const records = await Promise.allSettled(this.#records.values());

    for (const record of records) {
      if (record.status === 'fulfilled' && record.value.child.exitCode === null) {
        record.value.child.kill('SIGTERM');
      }
    }

    this.#records.clear();
  }

  async #start(workspaceId: string): Promise<ForwardRecord> {
    const port = await freePort();

    const child = spawn(
      'kubectl',
      [
        '--kubeconfig',
        this.kubeconfig,
        '--context',
        this.context,
        '--namespace',
        this.namespace,
        'port-forward',
        `service/workspace-${workspaceId}`,
        `${port}:8080`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let output = '';

    child.stdout?.on('data', (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-8_192);
    });
    child.stderr?.on('data', (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-8_192);
    });

    await waitFor(
      () => {
        if (child.exitCode !== null) {
          throw new Error(`kubectl port-forward exited (${child.exitCode}): ${output}`);
        }

        return output.includes(`127.0.0.1:${port}`) || output.includes(`[::1]:${port}`);
      },
      30_000,
      `service/workspace-${workspaceId} port-forward`,
    );

    child.once('exit', () => {
      const current = this.#records.get(workspaceId);

      if (current) {
        void current.then((value) => value.child === child && this.#records.delete(workspaceId)).catch(() => undefined);
      }
    });

    return { child, port };
  }
}

async function freePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  return address.port;
}

async function waitFor(predicate: () => boolean, timeoutMs: number, description: string) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

async function runCli() {
  const clusterName = requireEnv('E2E_RUNTIME_CLUSTER_NAME');
  const kubeconfig = requireEnv('E2E_RUNTIME_KUBECONFIG');
  const namespace = requireEnv('E2E_RUNTIME_NAMESPACE');

  if (!clusterName.startsWith(SAFE_CLUSTER_PREFIX) || !K8S_NAME.test(clusterName)) {
    throw new Error(`Refusing unsafe E2E runtime cluster name: ${clusterName}`);
  }

  const context = `kind-${clusterName}`;
  const registry = new KubectlPortForwardRegistry(kubeconfig, context, namespace);

  const bridge = await startAgentBridge({
    host: '127.0.0.1',
    port: Number(process.env.RUNTIME_E2E_BRIDGE_PORT ?? 18080),
    resolveAgentPort: (workspaceId) => registry.resolve(workspaceId),
  });

  let closing = false;

  const close = async () => {
    if (closing) {
      return;
    }

    closing = true;
    await bridge.close().catch(() => undefined);
    await registry.close();
  };

  process.once('SIGINT', () => void close().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void close().finally(() => process.exit(0)));

  console.log(JSON.stringify({ ok: true, service: 'runtime-e2e-agent-bridge', baseUrl: bridge.baseUrl, context }));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
