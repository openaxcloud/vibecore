import websocket from '@fastify/websocket';
import { createPrometheusRegistry } from '@vibecore/observability';
import { detectCommandAbuse } from '@vibecore/security';
import { verifyAgentToken } from '@vibecore/workspace-sdk';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import Fastify, { type FastifyRequest } from 'fastify';
import { z } from 'zod';

export interface WorkspaceAgentOptions {
  workspaceRoot?: string;
  tokenSecret?: string;
  workspaceId?: string;
  maxFileBytes?: number;
  maxOutputBytes?: number;
  commandTimeoutMs?: number;
  maxProcesses?: number;
}

interface ProcessRecord {
  id: string;
  command: string;
  startedAt: string;
  process: ChildProcessWithoutNullStreams;
  output?: string;
}

const filePathSchema = z.object({ path: z.string().min(1) });
const writeSchema = z.object({ path: z.string().min(1), content: z.string() });
const createSchema = writeSchema.partial({ content: true }).extend({ path: z.string().min(1), directory: z.boolean().default(false) });
const renameSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });
const commandSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().optional(),
});
const snapshotSchema = z.object({ files: z.array(writeSchema).default([]) });

export function buildWorkspaceAgentApp(options: WorkspaceAgentOptions = {}) {
  const root = resolve(options.workspaceRoot ?? process.env.WORKSPACE_ROOT ?? '/workspace');
  const tokenSecret = options.tokenSecret ?? process.env.WORKSPACE_AGENT_TOKEN_SECRET ?? 'dev-workspace-agent-secret';
  const workspaceId = options.workspaceId ?? process.env.WORKSPACE_ID;
  const maxFileBytes = options.maxFileBytes ?? Number(process.env.WORKSPACE_MAX_FILE_BYTES ?? 2 * 1024 * 1024);
  const maxOutputBytes = options.maxOutputBytes ?? Number(process.env.WORKSPACE_MAX_OUTPUT_BYTES ?? 1024 * 1024);
  const commandTimeoutMs = options.commandTimeoutMs ?? Number(process.env.WORKSPACE_COMMAND_TIMEOUT_MS ?? 30_000);
  const maxProcesses = options.maxProcesses ?? Number(process.env.WORKSPACE_MAX_PROCESSES ?? 8);
  const processes = new Map<string, ProcessRecord>();
  const metrics = createPrometheusRegistry();
  let terminalSessions = 0;

  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') {
      return;
    }

    const token = readBearerToken(request);
    const verified = token ? verifyAgentToken(token, tokenSecret, workspaceId) : false;

    if (!verified) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/health', async () => ({ status: 'ok', workspaceRoot: root }));

  app.get('/files/tree', async () => listTree(root, root));
  app.get('/files/read', async (request) => {
    const { path } = filePathSchema.parse(request.query);
    const safePath = resolveWorkspacePath(root, path);
    const fileStat = await stat(safePath);

    if (fileStat.size > maxFileBytes) {
      throw new Error('File is too large to read');
    }

    return { path, content: await readFile(safePath, 'utf8'), size: fileStat.size };
  });

  app.post('/files/write', async (request) => {
    const body = writeSchema.parse(request.body);
    assertContentSize(body.content, maxFileBytes);
    const safePath = resolveWorkspacePath(root, body.path);
    await mkdir(dirname(safePath), { recursive: true });
    await writeFile(safePath, body.content, 'utf8');
    return { path: body.path, bytes: Buffer.byteLength(body.content) };
  });

  app.post('/files/create', async (request) => {
    const body = createSchema.parse(request.body);
    const safePath = resolveWorkspacePath(root, body.path);

    if (body.directory) {
      await mkdir(safePath, { recursive: true });
      return { path: body.path, type: 'directory' };
    }

    const content = body.content ?? '';
    assertContentSize(content, maxFileBytes);
    await mkdir(dirname(safePath), { recursive: true });
    await writeFile(safePath, content, { flag: 'wx' });
    return { path: body.path, type: 'file' };
  });

  app.post('/files/delete', async (request) => {
    const { path } = filePathSchema.parse(request.body);
    await rm(resolveWorkspacePath(root, path), { recursive: true, force: true });
    return { path };
  });

  app.post('/files/rename', async (request) => {
    const body = renameSchema.parse(request.body);
    const from = resolveWorkspacePath(root, body.from);
    const to = resolveWorkspacePath(root, body.to);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return { from: body.from, to: body.to };
  });

  app.post('/patch/apply', async (request) => {
    const body = z.object({ files: z.array(writeSchema) }).parse(request.body);
    for (const file of body.files) {
      assertContentSize(file.content, maxFileBytes);
      const safePath = resolveWorkspacePath(root, file.path);
      await mkdir(dirname(safePath), { recursive: true });
      await writeFile(safePath, file.content, 'utf8');
    }
    return { changedFiles: body.files.map((file) => file.path) };
  });

  app.post('/commands/run', async (request) => {
    const body = commandSchema.parse(request.body);
    return runCommand(root, body.command, body.args, {
      timeoutMs: Math.min(body.timeoutMs ?? commandTimeoutMs, commandTimeoutMs),
      maxOutputBytes,
      maxProcesses,
      processes,
    });
  });

  app.get('/processes', async () => ({
    processes: [...processes.values()].map((record) => ({
      id: record.id,
      command: record.command,
      startedAt: record.startedAt,
      pid: record.process.pid,
    })),
  }));

  app.post('/processes/:id/kill', async (request) => {
    const id = (request.params as { id: string }).id;
    const record = processes.get(id);
    record?.process.kill('SIGTERM');
    processes.delete(id);
    return { killed: Boolean(record), id };
  });

  app.get('/ports', async () => ({ ports: detectPorts(processes) }));

  app.all('/preview/:port/*', async (request, reply) => {
    const port = Number((request.params as { port: string; '*': string }).port);
    const targetPath = (request.params as { '*': string })['*'] ?? '';

    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return reply.code(400).send({ error: 'invalid_port' });
    }

    const target = new URL(`http://127.0.0.1:${port}/${targetPath}`);
    const queryIndex = request.url.indexOf('?');

    if (queryIndex >= 0) {
      target.search = request.url.slice(queryIndex);
    }

    const response = await fetch(target, {
      method: request.method,
      headers: previewProxyHeaders(request.headers),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : (request.body as any),
      redirect: 'manual',
    });

    for (const [key, value] of response.headers.entries()) {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        reply.header(key, value);
      }
    }

    return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
  });

  app.post('/snapshots/create', async () => ({
    id: createHash('sha256').update(`${Date.now()}:${root}`).digest('hex').slice(0, 16),
    createdAt: new Date().toISOString(),
    files: await listSnapshotFiles(root, root),
  }));

  app.post('/snapshots/restore', async (request) => {
    const body = snapshotSchema.parse(request.body);
    for (const file of body.files) {
      assertContentSize(file.content, maxFileBytes);
      const safePath = resolveWorkspacePath(root, file.path);
      await mkdir(dirname(safePath), { recursive: true });
      await writeFile(safePath, file.content, 'utf8');
    }
    return { restoredFiles: body.files.length };
  });

  app.get('/metrics', async (_request, reply) => {
    metrics.setGauge('active_workspaces', { workspaceId: workspaceId ?? 'local' }, 1);
    metrics.setGauge('terminal_sessions', { workspaceId: workspaceId ?? 'local' }, terminalSessions);
    return reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8').send(metrics.render());
  });

  app.register(async (terminalApp) => {
    await terminalApp.register(websocket);
    terminalApp.get('/commands/stream', { websocket: true }, (rawSocket) => {
      const socket = normalizeWebSocket(rawSocket);
      let activeProcess: ChildProcessWithoutNullStreams | undefined;

      terminalSessions += 1;
      socket.onMessage((message) => {
        const payload = parseCommandStreamMessage(message);

        if (!payload) {
          return;
        }

        runCommandStream(root, payload.command, payload.args ?? [], {
          maxOutputBytes,
          maxProcesses,
          processes,
          socket,
          onActiveProcess: (process) => {
            activeProcess = process;
          },
          onComplete: () => {
            activeProcess = undefined;
          },
        }).catch((error) => {
          socket.send(
            JSON.stringify({
              type: 'error',
              error: { message: error instanceof Error ? error.message : String(error) },
              timestamp: new Date().toISOString(),
            }),
          );
        });
      });
      socket.onClose(() => {
        activeProcess?.kill('SIGTERM');
        terminalSessions = Math.max(0, terminalSessions - 1);
      });
    });

    terminalApp.get('/terminal', { websocket: true }, (rawSocket) => {
      const socket = normalizeWebSocket(rawSocket);
      let inputBuffer = '';
      let activeProcess: ChildProcessWithoutNullStreams | undefined;

      terminalSessions += 1;
      sendTerminalPrompt(socket, true);
      socket.onMessage((message) => {
        const payload = parseTerminalMessage(message);

        if (payload.type === 'resize') {
          return;
        }

        if (payload.type === 'kill') {
          activeProcess?.kill('SIGTERM');
          return;
        }

        const data = payload.data ?? '';

        if (!data) {
          return;
        }

        inputBuffer += data;

        if (!inputBuffer.includes('\n') && !inputBuffer.includes('\r')) {
          return;
        }

        const command = inputBuffer.replace(/\r/g, '\n').split('\n')[0]?.trim() ?? '';
        inputBuffer = '';

        if (!command) {
          sendTerminalPrompt(socket);
          return;
        }

        runTerminalCommand(root, command, {
          maxOutputBytes,
          maxProcesses,
          processes,
          socket,
          onActiveProcess: (process) => {
            activeProcess = process;
          },
          onComplete: () => {
            activeProcess = undefined;
          },
        }).catch((error) => {
          socket.send(`${error instanceof Error ? error.message : String(error)}\n`);
          sendTerminalExit(socket, 1);
          sendTerminalPrompt(socket);
        });
      });
      socket.onClose(() => {
        activeProcess?.kill('SIGTERM');
        terminalSessions = Math.max(0, terminalSessions - 1);
      });
    });
  });

  return app;
}

function normalizeWebSocket(rawSocket: unknown) {
  const socket = (rawSocket as { socket?: unknown }).socket ?? rawSocket;
  const candidate = socket as {
    send?: (message: string) => void;
    addEventListener?: (event: string, listener: (event: { data?: unknown }) => void) => void;
    on?: (event: string, listener: (message: Buffer) => void) => void;
  };

  if (typeof candidate.send !== 'function' || (typeof candidate.on !== 'function' && typeof candidate.addEventListener !== 'function')) {
    throw new Error('Unsupported WebSocket implementation');
  }

  return {
    send: candidate.send.bind(candidate),
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

function readBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    if (typeof (request.query as { token?: unknown } | undefined)?.token === 'string') {
      return (request.query as { token: string }).token;
    }

    return new URL(request.url, 'http://workspace-agent.local').searchParams.get('token') ?? undefined;
  }
  return authorization.slice('Bearer '.length);
}

function resolveWorkspacePath(root: string, unsafePath: string) {
  const resolved = resolve(root, unsafePath.replace(/^\/+/, ''));
  const rel = relative(root, resolved);

  if (rel.startsWith('..') || rel === '..' || resolve(root) === resolved && unsafePath.includes('..')) {
    throw new Error('Path escapes workspace root');
  }

  return resolved;
}

function assertContentSize(content: string, maxFileBytes: number) {
  if (Buffer.byteLength(content) > maxFileBytes) {
    throw new Error('File is too large');
  }
}

function parseTerminalMessage(message: Buffer) {
  const text = message.toString();

  try {
    const parsed = JSON.parse(text) as { type?: string; data?: string };
    return {
      type: parsed.type ?? 'stdin',
      data: typeof parsed.data === 'string' ? parsed.data : '',
    };
  } catch {
    return { type: 'stdin', data: text };
  }
}

function parseCommandStreamMessage(message: Buffer): { command: string; args?: string[] } | undefined {
  try {
    const parsed = JSON.parse(message.toString()) as { type?: string; payload?: { command?: string; args?: string[] } };

    if (parsed.type === 'hello' && typeof parsed.payload?.command === 'string') {
      return { command: parsed.payload.command, args: parsed.payload.args ?? [] };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function sendTerminalPrompt(socket: ReturnType<typeof normalizeWebSocket>, interactive = false) {
  socket.send(`${interactive ? '\x1b]654;interactive\x07' : ''}\x1b]654;prompt\x07`);
}

function sendTerminalExit(socket: ReturnType<typeof normalizeWebSocket>, exitCode: number) {
  socket.send(`\x1b]654;exit=${exitCode}:${exitCode}\x07`);
}

function previewProxyHeaders(headers: FastifyRequest['headers']) {
  const forwarded = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();

    if (['host', 'authorization', 'cookie', 'connection', 'content-length'].includes(lower)) {
      continue;
    }

    if (typeof value === 'string') {
      forwarded.set(key, value);
    } else if (Array.isArray(value)) {
      forwarded.set(key, value.join(','));
    }
  }

  return forwarded;
}

async function listTree(root: string, current: string): Promise<{ path: string; type: 'file' | 'directory'; children?: unknown[] }[]> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(current, { withFileTypes: true });
  const nodes = [];

  for (const entry of entries) {
    const fullPath = resolve(current, entry.name);
    const path = relative(root, fullPath);
    const type: 'file' | 'directory' = entry.isDirectory() ? 'directory' : 'file';
    nodes.push({
      path,
      type,
      children: entry.isDirectory() ? await listTree(root, fullPath) : undefined,
    });
  }

  return nodes;
}

async function listSnapshotFiles(root: string, current: string): Promise<Array<{ path: string; sha256: string; size: number }>> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSnapshotFiles(root, fullPath)));
      continue;
    }

    const fileStat = await stat(fullPath);
    const hash = createHash('sha256');

    await new Promise<void>((resolvePromise, reject) => {
      createReadStream(fullPath)
        .on('data', (chunk) => hash.update(chunk))
        .on('error', reject)
        .on('end', () => resolvePromise());
    });

    files.push({ path: relative(root, fullPath), sha256: hash.digest('hex'), size: fileStat.size });
  }

  return files;
}

async function runCommand(
  cwd: string,
  command: string,
  args: string[],
  options: {
    timeoutMs: number;
    maxOutputBytes: number;
    maxProcesses: number;
    processes: Map<string, ProcessRecord>;
  },
) {
  if (options.processes.size >= options.maxProcesses) {
    throw new Error('Process limit reached');
  }
  const signal = detectCommandAbuse(command, args);

  if (signal) {
    throw Object.assign(new Error(`Command blocked by abuse policy: ${signal.reason}`), {
      statusCode: 409,
      code: `ABUSE_${signal.type.toUpperCase()}`,
    });
  }

  const id = createHash('sha256').update(`${command}:${args.join('\0')}:${Date.now()}`).digest('hex').slice(0, 12);
  const child = spawn(command, args, { cwd, shell: false, env: process.env });
  const record = { id, command: [command, ...args].join(' '), startedAt: new Date().toISOString(), process: child, output: '' };
  options.processes.set(id, record);

  let stdout = '';
  let stderr = '';
  let truncated = false;
  const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs);

  const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
    const next = (target === 'stdout' ? stdout : stderr) + chunk.toString('utf8');
    if (Buffer.byteLength(next) > options.maxOutputBytes) {
      truncated = true;
      const limited = next.slice(0, options.maxOutputBytes);
      if (target === 'stdout') {
        stdout = limited;
      } else {
        stderr = limited;
      }
      child.kill('SIGTERM');
      return;
    }
    if (target === 'stdout') {
      stdout = next;
    } else {
      stderr = next;
    }
    record.output = `${stdout}\n${stderr}`.slice(-options.maxOutputBytes);
  };

  child.stdout.on('data', (chunk) => append('stdout', chunk));
  child.stderr.on('data', (chunk) => append('stderr', chunk));

  return new Promise((resolvePromise) => {
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      options.processes.delete(id);
      resolvePromise({ id, code, signal, stdout, stderr, truncated });
    });
  });
}

async function runTerminalCommand(
  cwd: string,
  command: string,
  options: {
    maxOutputBytes: number;
    maxProcesses: number;
    processes: Map<string, ProcessRecord>;
    socket: ReturnType<typeof normalizeWebSocket>;
    onActiveProcess: (process: ChildProcessWithoutNullStreams) => void;
    onComplete: () => void;
  },
) {
  if (options.processes.size >= options.maxProcesses) {
    throw new Error('Process limit reached');
  }

  const signal = detectCommandAbuse('/bin/sh', ['-lc', command]);

  if (signal) {
    throw Object.assign(new Error(`Command blocked by abuse policy: ${signal.reason}`), {
      statusCode: 409,
      code: `ABUSE_${signal.type.toUpperCase()}`,
    });
  }

  const id = createHash('sha256').update(`terminal:${command}:${Date.now()}`).digest('hex').slice(0, 12);
  const child = spawn('/bin/sh', ['-lc', command], { cwd, shell: false, env: process.env });
  const record: ProcessRecord = {
    id,
    command,
    startedAt: new Date().toISOString(),
    process: child,
    output: '',
  };
  options.processes.set(id, record);
  options.onActiveProcess(child);

  const append = (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    record.output = `${record.output ?? ''}${text}`.slice(-options.maxOutputBytes);
    options.socket.send(text);
  };

  child.stdout.on('data', append);
  child.stderr.on('data', append);

  await new Promise<void>((resolvePromise) => {
    child.on('close', (code) => {
      sendTerminalExit(options.socket, code ?? 0);
      sendTerminalPrompt(options.socket);
      options.processes.delete(id);
      options.onComplete();
      resolvePromise();
    });
  });
}

async function runCommandStream(
  cwd: string,
  command: string,
  args: string[],
  options: {
    maxOutputBytes: number;
    maxProcesses: number;
    processes: Map<string, ProcessRecord>;
    socket: ReturnType<typeof normalizeWebSocket>;
    onActiveProcess: (process: ChildProcessWithoutNullStreams) => void;
    onComplete: () => void;
  },
) {
  if (options.processes.size >= options.maxProcesses) {
    throw new Error('Process limit reached');
  }

  const signal = detectCommandAbuse(command, args);

  if (signal) {
    throw Object.assign(new Error(`Command blocked by abuse policy: ${signal.reason}`), {
      statusCode: 409,
      code: `ABUSE_${signal.type.toUpperCase()}`,
    });
  }

  const id = createHash('sha256').update(`stream:${command}:${args.join('\0')}:${Date.now()}`).digest('hex').slice(0, 12);
  const child = spawn(command, args, { cwd, shell: false, env: process.env });
  const record: ProcessRecord = {
    id,
    command: [command, ...args].join(' '),
    startedAt: new Date().toISOString(),
    process: child,
    output: '',
  };
  options.processes.set(id, record);
  options.onActiveProcess(child);

  const send = (type: 'stdout' | 'stderr', chunk: Buffer) => {
    const data = chunk.toString('utf8');
    record.output = `${record.output ?? ''}${data}`.slice(-options.maxOutputBytes);
    options.socket.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
  };

  child.stdout.on('data', (chunk) => send('stdout', chunk));
  child.stderr.on('data', (chunk) => send('stderr', chunk));

  await new Promise<void>((resolvePromise) => {
    child.on('close', (code) => {
      options.socket.send(JSON.stringify({ type: 'exit', exitCode: code ?? 0, timestamp: new Date().toISOString() }));
      options.processes.delete(id);
      options.onComplete();
      resolvePromise();
    });
  });
}

function detectPorts(processes: Map<string, ProcessRecord>) {
  return [...processes.values()].flatMap((record) => {
    const source = `${record.command}\n${record.output ?? ''}`;
    const matches = source.matchAll(
      /(?:https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\])[:/]|localhost:|127\.0\.0\.1:|0\.0\.0\.0:|--port\s+|LISTEN\s+)(\d{2,5})/gi,
    );
    const ports = new Set([...matches].map((match) => Number(match[1])).filter((port) => port > 0 && port <= 65535));

    if (!ports.size && /\b(vite|next dev|astro dev|remix dev|npm run dev|pnpm dev|yarn dev)\b/i.test(record.command)) {
      ports.add(/\bnext dev\b/i.test(record.command) ? 3000 : 5173);
    }

    return [...ports].map((port) => ({ port, processId: record.id }));
  });
}
