import websocket from '@fastify/websocket';
import { RemoteKubernetesRuntimeAdapter } from '@vibecore/runtime-remote';
import { signAgentToken } from '@vibecore/workspace-sdk';
import Fastify from 'fastify';
import JSZip from 'jszip';
import { execFile as execFileCallback, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const clusterName = process.env.KIND_CLUSTER_NAME ?? 'vibecore-runtime-e2e';
const namespace = process.env.RUNTIME_E2E_NAMESPACE ?? 'vibecore-runtime-e2e';
const workspaceId = process.env.RUNTIME_E2E_WORKSPACE_ID ?? 'workspace-e2e';
const image = process.env.RUNTIME_E2E_AGENT_IMAGE ?? 'vibecore/workspace-agent:e2e';
const apiToken = process.env.RUNTIME_E2E_API_TOKEN ?? 'remote-runtime-e2e-token';
const agentSecret = process.env.RUNTIME_E2E_AGENT_SECRET ?? 'remote-runtime-e2e-agent-secret';
const skipKind = process.env.RUNTIME_E2E_SKIP_KIND === '1';
const k3sContainer = process.env.RUNTIME_E2E_K3S_CONTAINER;
const skipImageLoad = process.env.RUNTIME_E2E_SKIP_IMAGE_LOAD === '1';

let portForward: ChildProcess | undefined;
let bridge: Awaited<ReturnType<typeof startRuntimeBridge>> | undefined;

async function main() {
  await ensureKindCluster();
  await buildAndLoadAgentImage();
  await deployWorkspace();
  const localAgentPort = await startPortForward();
  bridge = await startRuntimeBridge(localAgentPort);

  const adapter = new RemoteKubernetesRuntimeAdapter({
    baseUrl: bridge.baseUrl,
    authToken: apiToken,
    workspaceId,
  });

  await adapter.boot();
  const session = await adapter.startWorkspace({ id: workspaceId, metadata: { validation: 'real-kubernetes' } });
  assert(session.status === 'running', `workspace did not start as running: ${session.status}`);

  await adapter.writeFile('src/index.js', 'console.log("hello from real kubernetes")\n');
  assert((await adapter.readFile('src/index.js')).includes('real kubernetes'), 'readFile did not return written content');

  await adapter.createDirectory('notes');
  await adapter.createFile('notes/check.txt', 'adapter-e2e\n');
  assert((await adapter.listFiles()).some((node) => node.path === 'src' || node.path === 'src/index.js'), 'listFiles did not include expected file tree');
  assert((await adapter.searchFiles('adapter-e2e')).some((match) => match.path === 'notes/check.txt'), 'searchFiles did not find content');

  const patchChanges = await adapter.applyPatch({
    operations: [{ type: 'write', path: 'src/patched.txt', content: 'patched through RuntimeAdapter\n' }],
  });
  assert(patchChanges.some((change) => change.path === 'src/patched.txt'), 'applyPatch did not report patched file');

  const command = await adapter.runCommand({ command: 'node', args: ['-e', 'console.log("command-ok")'] });
  assert(command.exitCode === 0 && command.output.includes('command-ok'), `runCommand failed: ${JSON.stringify(command)}`);

  const terminal = await adapter.openTerminal({ terminal: { cols: 80, rows: 24 } });
  const terminalEvent = await nextEvent(terminal.events, 5_000);
  assert(terminalEvent.type === 'stdout' && String(terminalEvent.data).includes('ready'), 'terminal did not stream ready event');
  await terminal.kill();

  const processes = await adapter.listProcesses();
  assert(Array.isArray(processes), 'listProcesses did not return an array');

  const ports = await adapter.listPorts();
  assert(Array.isArray(ports), 'listPorts did not return an array');

  const preview = await adapter.getPreviewUrl(8080);
  assert(preview.ready && preview.url.includes(String(localAgentPort)), 'getPreviewUrl did not return live local preview URL');

  const snapshot = await adapter.createSnapshot('e2e');
  assert(snapshot.workspaceId === workspaceId && snapshot.files.some((file) => file.path === 'src/index.js'), 'createSnapshot did not include workspace files');

  const zip = await adapter.exportZip();
  assert(zip.byteLength > 0, 'exportZip returned an empty archive');
  await adapter.importZip(zip, 'imported');
  assert((await adapter.readFile('imported/src/index.js')).includes('real kubernetes'), 'importZip did not restore exported file');

  await adapter.stopWorkspace();

  console.log(
    JSON.stringify(
      {
        ok: true,
        clusterName,
        namespace,
        workspaceId,
        pod: `workspace-${workspaceId}`,
        image,
        checks: [
          'boot',
          'startWorkspace',
          'writeFile/readFile',
          'createDirectory/createFile/listFiles/searchFiles',
          'applyPatch',
          'runCommand',
          'openTerminal',
          'listProcesses/listPorts',
          'getPreviewUrl',
          'createSnapshot',
          'exportZip/importZip',
          'stopWorkspace',
        ],
      },
      null,
      2,
    ),
  );
}

async function ensureKindCluster() {
  if (skipKind) {
    await execFile('kubectl', ['cluster-info'], { maxBuffer: 10 * 1024 * 1024 });
    return;
  }

  await execFile('kind', ['version']);
  const clusters = (await execFile('kind', ['get', 'clusters']).catch(() => ({ stdout: '' }))).stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!clusters.includes(clusterName)) {
    await execFile('kind', ['create', 'cluster', '--name', clusterName, '--image', process.env.KIND_NODE_IMAGE ?? 'kindest/node:v1.34.0', '--wait', '120s'], {
      maxBuffer: 20 * 1024 * 1024,
    });
  }

  await execFile('kubectl', ['config', 'use-context', `kind-${clusterName}`]);
}

async function buildAndLoadAgentImage() {
  await execFile('docker', ['build', '-f', 'services/workspace-agent/Dockerfile', '-t', image, '.'], {
    maxBuffer: 40 * 1024 * 1024,
  });

  if (skipImageLoad) {
    return;
  }

  if (k3sContainer) {
    const dir = await mkdtemp(join(tmpdir(), 'vibecore-agent-image-'));
    const tarFile = join(dir, 'workspace-agent.tar');
    try {
      await execFile('docker', ['save', image, '-o', tarFile], { maxBuffer: 20 * 1024 * 1024 });
      await execFile('docker', ['cp', tarFile, `${k3sContainer}:/tmp/workspace-agent.tar`], { maxBuffer: 20 * 1024 * 1024 });
      await execFile('docker', ['exec', k3sContainer, 'ctr', 'images', 'import', '/tmp/workspace-agent.tar'], { maxBuffer: 40 * 1024 * 1024 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    return;
  }

  await execFile('kind', ['load', 'docker-image', image, '--name', clusterName], { maxBuffer: 20 * 1024 * 1024 });
}

async function deployWorkspace() {
  await execFile('kubectl', ['create', 'namespace', namespace]).catch(() => undefined);
  await execFile('kubectl', ['-n', namespace, 'delete', 'pod', `workspace-${workspaceId}`, '--ignore-not-found=true']);
  await execFile('kubectl', ['-n', namespace, 'delete', 'service', `workspace-${workspaceId}`, '--ignore-not-found=true']);
  await execFile('kubectl', ['-n', namespace, 'delete', 'pvc', `pvc-${workspaceId}`, '--ignore-not-found=true']);
  await execFile('kubectl', ['-n', namespace, 'delete', 'secret', `agent-token-${workspaceId}`, '--ignore-not-found=true']);

  const manifest = {
    apiVersion: 'v1',
    kind: 'List',
    items: [
      {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: { name: `pvc-${workspaceId}`, namespace },
        spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '1Gi' } } },
      },
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: `agent-token-${workspaceId}`, namespace },
        stringData: { tokenSecret: agentSecret },
      },
      {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: `workspace-${workspaceId}`,
          namespace,
          labels: {
            'app.kubernetes.io/name': 'vibecore-workspace',
            'vibecore.ai/workspace-id': workspaceId,
            'vibecore.ai/org-id': 'org-e2e',
            'vibecore.ai/project-id': 'project-e2e',
          },
        },
        spec: {
          securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
          containers: [
            {
              name: 'workspace-agent',
              image,
              imagePullPolicy: 'IfNotPresent',
              ports: [{ containerPort: 8080, name: 'agent' }],
              env: [
                { name: 'WORKSPACE_ROOT', value: '/workspace' },
                { name: 'WORKSPACE_ID', value: workspaceId },
                { name: 'WORKSPACE_AGENT_TOKEN_SECRET', valueFrom: { secretKeyRef: { name: `agent-token-${workspaceId}`, key: 'tokenSecret' } } },
              ],
              volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
              readinessProbe: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 2, periodSeconds: 2 },
              livenessProbe: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 10, periodSeconds: 10 },
              securityContext: {
                allowPrivilegeEscalation: false,
                privileged: false,
                runAsNonRoot: true,
                runAsUser: 1000,
                capabilities: { drop: ['ALL'] },
                seccompProfile: { type: 'RuntimeDefault' },
              },
            },
          ],
          volumes: [{ name: 'workspace', persistentVolumeClaim: { claimName: `pvc-${workspaceId}` } }],
        },
      },
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: `workspace-${workspaceId}`, namespace },
        spec: {
          selector: { 'vibecore.ai/workspace-id': workspaceId },
          ports: [{ name: 'agent', port: 8080, targetPort: 8080 }],
        },
      },
    ],
  };

  const dir = await mkdtemp(join(tmpdir(), 'vibecore-runtime-e2e-'));
  const file = join(dir, 'workspace.json');
  await import('node:fs/promises').then((fs) => fs.writeFile(file, JSON.stringify(manifest)));

  try {
    await execFile('kubectl', ['apply', '-f', file], { maxBuffer: 10 * 1024 * 1024 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  await execFile('kubectl', ['-n', namespace, 'wait', '--for=condition=Ready', `pod/workspace-${workspaceId}`, '--timeout=180s'], {
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function startPortForward() {
  const port = await freePort();
  portForward = spawn('kubectl', ['-n', namespace, 'port-forward', `service/workspace-${workspaceId}`, `${port}:8080`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const spawned = portForward;
  spawned.stdout?.on('data', (chunk) => {
    output += chunk.toString();
  });
  spawned.stderr?.on('data', (chunk) => {
    output += chunk.toString();
  });

  await waitFor(async () => {
    if (spawned.exitCode !== null) {
      throw new Error(`kubectl port-forward exited early: ${output}`);
    }
    return output.includes(`:${port}`) || output.includes(`127.0.0.1:${port}`);
  }, 30_000);

  return port;
}

async function startRuntimeBridge(agentPort: number) {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  app.addContentTypeParser('application/zip', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  const snapshots = new Map<string, Array<{ path: string; content: string }>>();

  app.addHook('onRequest', async (request, reply) => {
    const token =
      request.headers.authorization?.replace(/^Bearer\s+/i, '') ??
      (request.query as { token?: string } | undefined)?.token ??
      new URL(request.url, 'http://runtime-bridge.local').searchParams.get('token') ??
      undefined;
    if (token !== apiToken) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  app.setErrorHandler((error: Error, _request, reply) => {
    console.error('runtime bridge error:', error);
    reply.code(500).send({ error: 'runtime_bridge_error', message: error.message });
  });

  const agentToken = () => signAgentToken({ workspaceId, secret: agentSecret, expiresAt: Date.now() + 5 * 60_000 });
  const agentFetch = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${agentToken()}`);
    if (init.body && typeof init.body === 'string' && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const response = await fetch(`http://127.0.0.1:${agentPort}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
    }
    return response;
  };

  const readAllFiles = async () => {
    const tree = await (await agentFetch('/files/tree')).json() as AgentNode[];
    const files: Array<{ path: string; content: string }> = [];
    for (const file of flattenFiles(tree)) {
      const read = await (await agentFetch(`/files/read?path=${encodeURIComponent(file.path)}`)).json() as { content: string };
      files.push({ path: file.path, content: read.content });
    }
    return files;
  };

  app.post('/runtime/boot', async (_request, reply) => reply.code(204).send());
  app.post('/workspaces', async (_request) => session());
  app.post('/workspaces/:workspaceId/stop', async (_request, reply) => reply.code(204).send());
  app.post('/workspaces/:workspaceId/restart', async () => session());
  app.get('/workspaces/:workspaceId/status', async () => session());

  app.get('/workspaces/:workspaceId/files', async () => mapNodes(await (await agentFetch('/files/tree')).json() as AgentNode[]));
  app.get('/workspaces/:workspaceId/files/read', async (request) => agentFetchJson(`/files/read?path=${encodeURIComponent((request.query as { path: string }).path)}`, agentFetch));
  app.put('/workspaces/:workspaceId/files/write', async (request, reply) => {
    await agentFetch('/files/write', { method: 'POST', body: JSON.stringify(request.body) });
    return reply.code(204).send();
  });
  app.post('/workspaces/:workspaceId/files', async (request, reply) => {
    await agentFetch('/files/create', { method: 'POST', body: JSON.stringify(request.body) });
    return reply.code(204).send();
  });
  app.post('/workspaces/:workspaceId/directories', async (request, reply) => {
    await agentFetch('/files/create', { method: 'POST', body: JSON.stringify({ ...(request.body as object), directory: true }) });
    return reply.code(204).send();
  });
  app.delete('/workspaces/:workspaceId/files', async (request, reply) => {
    await agentFetch('/files/delete', { method: 'POST', body: JSON.stringify({ path: (request.query as { path: string }).path }) });
    return reply.code(204).send();
  });
  app.post('/workspaces/:workspaceId/files/move', async (request, reply) => {
    const body = request.body as { path: string; newPath: string };
    await agentFetch('/files/rename', { method: 'POST', body: JSON.stringify({ from: body.path, to: body.newPath }) });
    return reply.code(204).send();
  });
  app.post('/workspaces/:workspaceId/files/search', async (request) => {
    const { query } = request.body as { query: string };
    const matches = [];
    for (const file of await readAllFiles()) {
      const lines = file.content.split('\n');
      for (const [index, line] of lines.entries()) {
        const start = line.indexOf(query);
        if (start >= 0) {
          matches.push({ path: file.path, lineNumber: index + 1, line, startColumn: start + 1, endColumn: start + query.length + 1 });
        }
      }
    }
    return matches;
  });
  app.post('/workspaces/:workspaceId/patch', async (request) => {
    const changes = [];
    for (const operation of (request.body as { operations: Array<{ type: string; path: string; content?: string; newPath?: string }> }).operations) {
      if (operation.type === 'write') {
        await agentFetch('/files/write', { method: 'POST', body: JSON.stringify({ path: operation.path, content: operation.content ?? '' }) });
        changes.push({ path: operation.path, type: 'update', content: operation.content, timestamp: new Date().toISOString() });
      } else if (operation.type === 'delete') {
        await agentFetch('/files/delete', { method: 'POST', body: JSON.stringify({ path: operation.path }) });
        changes.push({ path: operation.path, type: 'delete', timestamp: new Date().toISOString() });
      } else if ((operation.type === 'rename' || operation.type === 'move') && operation.newPath) {
        await agentFetch('/files/rename', { method: 'POST', body: JSON.stringify({ from: operation.path, to: operation.newPath }) });
        changes.push({ path: operation.newPath, oldPath: operation.path, type: 'rename', timestamp: new Date().toISOString() });
      }
    }
    return changes;
  });
  app.post('/workspaces/:workspaceId/commands', async (request) => {
    const result = await agentFetchJson('/commands/run', agentFetch, { method: 'POST', body: JSON.stringify(request.body) }) as { code: number; stdout: string; stderr: string };
    const events = [
      ...(result.stdout ? [{ type: 'stdout', data: result.stdout, timestamp: new Date().toISOString() }] : []),
      ...(result.stderr ? [{ type: 'stderr', data: result.stderr, timestamp: new Date().toISOString() }] : []),
      { type: 'exit', exitCode: result.code ?? 0, timestamp: new Date().toISOString() },
    ];
    return { exitCode: result.code ?? 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`, events };
  });
  app.get('/workspaces/:workspaceId/processes', async () => {
    const result = await agentFetchJson('/processes', agentFetch) as { processes: Array<{ id: string; command: string; startedAt: string }> };
    return result.processes.map((process) => ({ ...process, status: 'running' }));
  });
  app.post('/workspaces/:workspaceId/processes/:id/kill', async (request, reply) => {
    await agentFetch(`/processes/${(request.params as { id: string }).id}/kill`, { method: 'POST' });
    return reply.code(204).send();
  });
  app.get('/workspaces/:workspaceId/ports', async () => {
    const result = await agentFetchJson('/ports', agentFetch) as { ports: Array<{ port: number; processId?: string }> };
    return result.ports.map((port) => ({ ...port, type: 'open', ready: true, url: `http://127.0.0.1:${agentPort}` }));
  });
  app.get('/workspaces/:workspaceId/preview/:port', async (request) => ({ port: Number((request.params as { port: string }).port), url: `http://127.0.0.1:${agentPort}`, ready: true }));
  app.post('/workspaces/:workspaceId/snapshots', async (request) => {
    const id = `snapshot-${Date.now()}`;
    const files = await readAllFiles();
    snapshots.set(id, files);
    return { id, workspaceId, createdAt: new Date().toISOString(), files: files.map((file) => ({ path: file.path, name: file.path.split('/').pop() ?? file.path, type: 'file' })) };
  });
  app.post('/workspaces/:workspaceId/snapshots/:snapshotId/restore', async (request, reply) => {
    const files = snapshots.get((request.params as { snapshotId: string }).snapshotId);
    if (!files) {
      return reply.code(404).send({ error: 'snapshot not found' });
    }
    await agentFetch('/snapshots/restore', { method: 'POST', body: JSON.stringify({ files }) });
    return reply.code(204).send();
  });
  app.get('/workspaces/:workspaceId/export', async (_request, reply) => {
    const zip = new JSZip();
    for (const file of await readAllFiles()) {
      zip.file(file.path, file.content);
    }
    return reply.header('content-type', 'application/zip').send(await zip.generateAsync({ type: 'nodebuffer' }));
  });
  app.post('/workspaces/:workspaceId/import', async (request, reply) => {
    const targetPath = (request.query as { targetPath?: string }).targetPath ?? '.';
    const zip = await JSZip.loadAsync(request.body as Buffer);
    for (const [path, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        const prefix = targetPath === '.' ? '' : `${targetPath.replace(/\/+$/, '')}/`;
        await agentFetch('/files/write', { method: 'POST', body: JSON.stringify({ path: `${prefix}${path}`, content: await entry.async('string') }) });
      }
    }
    return reply.code(204).send();
  });
  app.get('/workspaces/:workspaceId/terminal', { websocket: true } as any, (clientSocket: any) => {
    const client = normalizeFastifyWebSocket(clientSocket);
    const upstream = new WebSocket(`ws://127.0.0.1:${agentPort}/terminal?token=${encodeURIComponent(agentToken())}`);
    upstream.addEventListener('message', (event) => {
      void normalizeWebSocketData(event.data)
        .then((data) => client.send(JSON.stringify({ type: 'stdout', data, timestamp: new Date().toISOString() })))
        .catch((error) => client.send(JSON.stringify({ type: 'stderr', data: String(error), timestamp: new Date().toISOString() })));
    });
    upstream.addEventListener('close', () => client.close());
    client.onMessage((message) => upstream.readyState === WebSocket.OPEN && upstream.send(message.toString()));
    client.onClose(() => upstream.close());
  });

  const port = await freePort();
  await app.listen({ host: '127.0.0.1', port });

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

function session() {
  return {
    id: workspaceId,
    runtimeMode: 'remote-kubernetes',
    status: 'running',
    workdir: '/workspace',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { namespace, pod: `workspace-${workspaceId}` },
  };
}

interface AgentNode {
  path: string;
  type: 'file' | 'directory';
  children?: AgentNode[];
}

function mapNodes(nodes: AgentNode[]): unknown[] {
  return nodes.map((node) => ({
    path: node.path,
    name: node.path.split('/').pop() || node.path,
    type: node.type,
    children: node.children ? mapNodes(node.children) : undefined,
  }));
}

function flattenFiles(nodes: AgentNode[]): AgentNode[] {
  return nodes.flatMap((node) => (node.type === 'file' ? [node] : flattenFiles(node.children ?? [])));
}

async function agentFetchJson(path: string, agentFetch: (path: string, init?: RequestInit) => Promise<Response>, init?: RequestInit) {
  return (await agentFetch(path, init)).json();
}

async function nextEvent<T>(events: AsyncIterable<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    events[Symbol.asyncIterator]().next().then((result) => {
      if (result.done) {
        throw new Error('event stream closed');
      }
      return result.value;
    }),
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('timed out waiting for event')), timeoutMs)),
  ]);
}

async function normalizeWebSocketData(data: unknown) {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Buffer) {
    return data.toString();
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString();
  }
  if (data instanceof Blob) {
    return Buffer.from(await data.arrayBuffer()).toString();
  }
  return String(data);
}

function normalizeFastifyWebSocket(rawSocket: unknown) {
  const socket = (rawSocket as { socket?: unknown }).socket ?? rawSocket;
  const candidate = socket as {
    send?: (message: string) => void;
    close?: () => void;
    terminate?: () => void;
    addEventListener?: (event: string, listener: (event: { data?: unknown }) => void) => void;
    on?: (event: string, listener: (message: Buffer) => void) => void;
  };

  if (typeof candidate.send !== 'function' || (typeof candidate.on !== 'function' && typeof candidate.addEventListener !== 'function')) {
    throw new Error(`Unsupported Fastify WebSocket implementation: ${describeUnknownSocket(rawSocket)}`);
  }

  return {
    send: candidate.send.bind(candidate),
    close: () => {
      if (typeof candidate.close === 'function') {
        candidate.close();
      } else {
        candidate.terminate?.();
      }
    },
    onMessage: (listener: (message: Buffer) => void) => {
      if (typeof candidate.on === 'function') {
        candidate.on('message', listener);
      } else {
        candidate.addEventListener?.('message', (event) => listener(Buffer.from(String(event.data ?? ''))));
      }
    },
    onClose: (listener: () => void) => {
      if (typeof candidate.on === 'function') {
        candidate.on('close', listener);
      } else {
        candidate.addEventListener?.('close', listener);
      }
    },
  };
}

function describeUnknownSocket(rawSocket: unknown) {
  const socket = (rawSocket as { socket?: unknown }).socket ?? rawSocket;
  const object = socket && typeof socket === 'object' ? socket : {};
  const proto = Object.getPrototypeOf(object);
  return JSON.stringify({
    rawConstructor: (rawSocket as { constructor?: { name?: string } } | undefined)?.constructor?.name,
    socketConstructor: (socket as { constructor?: { name?: string } } | undefined)?.constructor?.name,
    rawKeys: rawSocket && typeof rawSocket === 'object' ? Object.keys(rawSocket) : [],
    socketKeys: socket && typeof socket === 'object' ? Object.keys(socket) : [],
    protoKeys: proto ? Object.getOwnPropertyNames(proto) : [],
    nestedSocket: Boolean((rawSocket as { socket?: unknown } | undefined)?.socket),
  });
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise<void>((resolvePromise, reject) => server.close((error) => (error ? reject(error) : resolvePromise())));
  if (!port) {
    throw new Error('Could not allocate a free port');
  }
  return port;
}

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error('Timed out waiting for condition');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await bridge?.app.close().catch(() => undefined);
    portForward?.kill('SIGTERM');
  });
