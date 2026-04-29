import websocket from '@fastify/websocket';
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

  app.get('/metrics', async () => ({
    workspaceProcesses: processes.size,
    maxProcesses,
    maxFileBytes,
    maxOutputBytes,
  }));

  app.register(async (terminalApp) => {
    await terminalApp.register(websocket);
    terminalApp.get('/terminal', { websocket: true }, (rawSocket) => {
      const socket = normalizeWebSocket(rawSocket);

      socket.send(JSON.stringify({ type: 'ready', cwd: '/workspace' }));
      socket.onMessage((message) => {
        socket.send(JSON.stringify({ type: 'input', data: message.toString() }));
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

  const id = createHash('sha256').update(`${command}:${args.join('\0')}:${Date.now()}`).digest('hex').slice(0, 12);
  const child = spawn(command, args, { cwd, shell: false, env: process.env });
  const record = { id, command: [command, ...args].join(' '), startedAt: new Date().toISOString(), process: child };
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

function detectPorts(processes: Map<string, ProcessRecord>) {
  return [...processes.values()].flatMap((record) => {
    const matches = record.command.matchAll(/(?:localhost:|127\.0\.0\.1:|0\.0\.0\.0:|--port\s+)(\d{2,5})/g);
    return [...matches].map((match) => ({ port: Number(match[1]), processId: record.id }));
  });
}
