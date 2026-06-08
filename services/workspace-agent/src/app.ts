import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import websocket from '@fastify/websocket';
import { createPrometheusRegistry } from '@vibecore/observability';
import { normalizeShellCommandArgs } from '@vibecore/runtime-contract';
import { detectCommandAbuse, requireProductionSecret } from '@vibecore/security';
import { verifyAgentToken } from '@vibecore/workspace-sdk';
import Fastify, { type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TerminalSessionManager, type TerminalSession } from './terminal-session.js';

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

const createSchema = writeSchema
  .partial({ content: true })
  .extend({ path: z.string().min(1), directory: z.boolean().default(false) });

const renameSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });

const commandSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().optional(),
});

const snapshotSchema = z.object({ files: z.array(writeSchema).default([]) });

export function buildWorkspaceAgentApp(options: WorkspaceAgentOptions = {}) {
  const root = resolve(options.workspaceRoot ?? process.env.WORKSPACE_ROOT ?? '/workspace');

  const tokenSecret = requireProductionSecret(
    'WORKSPACE_AGENT_TOKEN_SECRET',
    options.tokenSecret ?? process.env.WORKSPACE_AGENT_TOKEN_SECRET,
    'dev-workspace-agent-secret',
  );

  const workspaceId = options.workspaceId ?? process.env.WORKSPACE_ID;

  const numericEnv = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const maxFileBytes = options.maxFileBytes ?? numericEnv(process.env.WORKSPACE_MAX_FILE_BYTES, 2 * 1024 * 1024);
  const maxOutputBytes = options.maxOutputBytes ?? numericEnv(process.env.WORKSPACE_MAX_OUTPUT_BYTES, 1024 * 1024);
  const commandTimeoutMs = options.commandTimeoutMs ?? numericEnv(process.env.WORKSPACE_COMMAND_TIMEOUT_MS, 30_000);
  const maxProcesses = options.maxProcesses ?? numericEnv(process.env.WORKSPACE_MAX_PROCESSES, 8);
  const processes = new Map<string, ProcessRecord>();
  const metrics = createPrometheusRegistry();

  const terminalManager = new TerminalSessionManager({
    cwd: root,
    env: process.env,
    maxSessions: maxProcesses,

    /*
     * The Bolt client opens terminals as `/bin/jsh --osc` and the action-runner
     * handshakes on OSC 654 markers; emulate that protocol over the real shell
     * so the terminal and AI shell/start/build actions don't hang. See
     * terminal-session.ts and app/utils/shell.ts.
     */
    osc: true,
  });

  let terminalSessions = 0;

  const app = Fastify({ logger: false });

  /*
   * Catch-all parser so the preview proxy can forward binary/multipart/other
   * POST bodies as raw bytes instead of rejecting them with 415. This only
   * handles content types Fastify has no built-in parser for — application/json
   * and the urlencoded/text bodies the agent's own API routes rely on are still
   * parsed by the built-in parsers.
   */
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

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

    /*
     * Resolve symlinks and re-check containment so a link inside the workspace
     * can't be followed to read a file outside the workspace root.
     */
    const realPath = await realpath(safePath).catch(rethrowFsError);
    const realRel = relative(await canonicalRoot(root), realPath);

    if (realRel === '..' || realRel.startsWith(`..${sep}`)) {
      throw Object.assign(new Error('Path escapes workspace root'), { statusCode: 400, code: 'EACCES' });
    }

    const fileStat = await stat(realPath).catch(rethrowFsError);

    if (fileStat.size > maxFileBytes) {
      throw new Error('File is too large to read');
    }

    if (fileStat.isDirectory()) {
      throw Object.assign(new Error('Path is a directory'), { statusCode: 400, code: 'EISDIR' });
    }

    return { path, content: await readFile(realPath, 'utf8').catch(rethrowFsError), size: fileStat.size };
  });

  app.post('/files/write', async (request) => {
    const body = writeSchema.parse(request.body);
    assertContentSize(body.content, maxFileBytes);

    const safePath = resolveWorkspacePath(root, body.path);
    await mkdir(dirname(safePath), { recursive: true });
    await assertRealPathContained(root, safePath);
    await writeFile(safePath, body.content, 'utf8');

    return { path: body.path, bytes: Buffer.byteLength(body.content) };
  });

  app.post('/files/create', async (request) => {
    const body = createSchema.parse(request.body);
    const safePath = resolveWorkspacePath(root, body.path);

    if (body.directory) {
      await assertRealPathContained(root, safePath);
      await mkdir(safePath, { recursive: true });
      return { path: body.path, type: 'directory' };
    }

    const content = body.content ?? '';
    assertContentSize(content, maxFileBytes);
    await mkdir(dirname(safePath), { recursive: true });
    await assertRealPathContained(root, safePath);
    await writeFile(safePath, content, { flag: 'wx' });

    return { path: body.path, type: 'file' };
  });

  app.post('/files/delete', async (request) => {
    const { path } = filePathSchema.parse(request.body);
    const safePath = resolveWorkspacePath(root, path);
    await assertRealPathContained(root, dirname(safePath));
    await rm(safePath, { recursive: true, force: true });

    return { path };
  });

  app.post('/files/rename', async (request) => {
    const body = renameSchema.parse(request.body);
    const from = resolveWorkspacePath(root, body.from);
    const to = resolveWorkspacePath(root, body.to);
    await mkdir(dirname(to), { recursive: true });
    await assertRealPathContained(root, dirname(from));
    await assertRealPathContained(root, to);
    await rename(from, to);

    return { from: body.from, to: body.to };
  });

  app.post('/patch/apply', async (request) => {
    const body = z.object({ files: z.array(writeSchema) }).parse(request.body);

    for (const file of body.files) {
      assertContentSize(file.content, maxFileBytes);

      const safePath = resolveWorkspacePath(root, file.path);
      await mkdir(dirname(safePath), { recursive: true });
      await assertRealPathContained(root, safePath);
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

  app.get('/ports', async () => ({ ports: await detectPorts(processes) }));

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
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : serializePreviewBody(request.body, request.headers['content-type']),
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
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
      await assertRealPathContained(root, safePath);
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

      /*
       * Track EVERY child spawned on this socket, not just the most recent one. A client
       * can send multiple `hello` frames (or reconnect/re-handshake); previously only the
       * last child was referenced, so earlier ones were orphaned on disconnect and — since
       * streamed commands have no timeout — leaked until they exited on their own, filling
       * the maxProcesses budget cluster-wide.
       */
      const activeChildren = new Set<ChildProcessWithoutNullStreams>();

      let socketClosed = false;

      terminalSessions += 1;
      socket.onMessage((message) => {
        const payload = parseCommandStreamMessage(message);

        if (!payload || socketClosed) {
          return;
        }

        runCommandStream(root, payload.command, payload.args ?? [], {
          maxOutputBytes,
          maxProcesses,
          processes,
          socket,
          isOpen: () => !socketClosed,
          onActiveProcess: (process) => {
            activeChildren.add(process);
          },
          onComplete: (process) => {
            activeChildren.delete(process);
          },
        }).catch((error) => {
          if (socketClosed) {
            return;
          }

          try {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: { message: error instanceof Error ? error.message : String(error) },
                timestamp: new Date().toISOString(),
              }),
            );
          } catch {
            // The socket can transition to CLOSING after the socketClosed check
            // above; sending then throws synchronously. Drop the late error frame.
          }
        });
      });
      socket.onClose(() => {
        socketClosed = true;

        for (const child of activeChildren) {
          child.kill('SIGTERM');
        }

        activeChildren.clear();
        terminalSessions = Math.max(0, terminalSessions - 1);
      });
    });

    /*
     * Real, persistent terminal. Each connection attaches to a shell session
     * (one long-lived shell process) so cwd, exported env and history persist
     * across commands. Reconnecting with the same ?sessionId reattaches to the
     * running shell and repaints recent scrollback. Backed by a true PTY when
     * node-pty is available, otherwise a process-group shell.
     */
    terminalApp.get('/terminal', { websocket: true }, (rawSocket, request) => {
      const socket = normalizeWebSocket(rawSocket);
      const requestUrl = new URL(request.url ?? '/terminal', 'http://workspace.local');
      const requestedSessionId = (requestUrl.searchParams.get('sessionId') ?? '').trim();

      const sessionId =
        requestedSessionId ||
        createHash('sha256').update(`terminal:${Date.now()}:${terminalSessions}`).digest('hex').slice(0, 16);

      const cols = Number(requestUrl.searchParams.get('cols')) || 80;
      const rows = Number(requestUrl.searchParams.get('rows')) || 24;

      terminalSessions += 1;

      let session: TerminalSession | undefined;
      let detach: (() => void) | undefined;
      let closed = false;

      const earlyInput: string[] = [];

      /*
       * The remote-runtime client (packages/runtime-remote) consumes this socket as a
       * stream of JSON `CommandEvent`s ({ type, data, timestamp }). Sending raw terminal
       * bytes makes the client's JSON.parse throw on every chunk, which both loses all
       * output and tears the socket down, producing an endless "[terminal reconnected]"
       * flap. Always frame output as a stdout CommandEvent.
       */
      const sendOutput = (data: string) => {
        if (!data) {
          return;
        }

        // The PTY's attach() callback can fire after the client disconnects
        // (scrollback flush, in-flight chunk). socket.send then throws on the
        // closed socket; swallow it so the terminal teardown stays clean.
        try {
          socket.send(JSON.stringify({ type: 'stdout', data, timestamp: new Date().toISOString() }));
        } catch {
          // Socket closed; drop the chunk.
        }
      };

      terminalManager
        .getOrCreate(sessionId, { cols, rows })
        .then((created) => {
          if (closed) {
            return;
          }

          session = created;

          // Repaint the screen for a reattaching client.
          sendOutput(created.scrollback());

          detach = created.attach((chunk) => sendOutput(chunk));

          // Flush any keystrokes that arrived before the shell was ready.
          for (const data of earlyInput.splice(0)) {
            created.write(data);
          }
        })
        .catch((error) => {
          sendOutput(`\r\n[terminal error] ${error instanceof Error ? error.message : String(error)}\r\n`);
        });

      socket.onMessage((message) => {
        try {
          const payload = parseTerminalMessage(message);

          if (payload.type === 'resize') {
            session?.resize(payload.cols ?? cols, payload.rows ?? rows);
            return;
          }

          if (payload.type === 'kill') {
            terminalManager.dispose(sessionId);
            return;
          }

          if (payload.type === 'signal' || payload.signal) {
            const signal = payload.signal ?? 'SIGINT';

            if (signal === 'SIGINT') {
              session?.interrupt();
            } else {
              session?.backend.kill(signal as NodeJS.Signals);
            }

            return;
          }

          const data = payload.data ?? '';

          if (!data) {
            return;
          }

          if (!session) {
            earlyInput.push(data);
            return;
          }

          /*
           * For the no-PTY fallback, a bare Ctrl+C (ETX) can't raise SIGINT on its
           * own, so deliver it to the foreground process group explicitly.
           */
          if (session.backend.mode === 'pipe' && data.includes('\x03')) {
            session.interrupt();
          }

          session.write(data);
        } catch (error) {
          /*
           * Writing to / signalling a PTY whose shell has already exited can throw
           * synchronously (e.g. node-pty "Cannot write to a closed pty"). This runs
           * inside a raw WebSocket event listener with no request-level error
           * boundary, so an uncaught throw would crash the whole agent and every
           * other session in this workspace. Surface it to this client and continue.
           */
          try {
            socket.send(
              JSON.stringify({
                type: 'stdout',
                data: `\r\n[terminal error] ${error instanceof Error ? error.message : String(error)}\r\n`,
                timestamp: new Date().toISOString(),
              }),
            );
          } catch {
            // Socket already gone; nothing to report.
          }
        }
      });

      socket.onClose(() => {
        closed = true;

        // Detach the viewer but keep the shell alive briefly for reattach.
        detach?.();
        terminalSessions = Math.max(0, terminalSessions - 1);
      });
    });

    terminalApp.addHook('onClose', async () => {
      terminalManager.disposeAll();
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

  if (
    typeof candidate.send !== 'function' ||
    (typeof candidate.on !== 'function' && typeof candidate.addEventListener !== 'function')
  ) {
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

/*
 * Map common fs errors to proper HTTP statuses (Fastify honours error.statusCode) so a
 * missing file returns 404 instead of an opaque 500 with a raw Node error message.
 */
function rethrowFsError(error: unknown): never {
  const code = (error as NodeJS.ErrnoException)?.code;

  if (code === 'ENOENT') {
    throw Object.assign(new Error('File not found'), { statusCode: 404, code: 'ENOENT' });
  }

  if (code === 'EISDIR') {
    throw Object.assign(new Error('Path is a directory'), { statusCode: 400, code: 'EISDIR' });
  }

  throw error;
}

function resolveWorkspacePath(root: string, unsafePath: string) {
  const resolved = resolve(root, unsafePath.replace(/^\/+/, ''));
  const rel = relative(root, resolved);

  if (rel.startsWith('..') || rel === '..' || (resolve(root) === resolved && unsafePath.includes('..'))) {
    throw new Error('Path escapes workspace root');
  }

  return resolved;
}

/*
 * Canonical (symlink-resolved) workspace root, used for all containment checks.
 * The lexical root may itself sit under a symlink (e.g. macOS /var -> /private/var),
 * so comparing a resolved real path against the lexical root would spuriously
 * report an escape. Resolved once and cached; falls back to the lexical root
 * until the directory exists on disk.
 */
async function canonicalRoot(root: string): Promise<string> {
  return realpath(root).catch(() => root);
}

/*
 * The lexical resolveWorkspacePath() check can be defeated by a symlink inside
 * the workspace pointing outside it: a user can `ln -s /etc evil`, then a write
 * to `evil/passwd` resolves lexically to `root/evil/passwd` (which passes) but
 * follows the link on disk to escape the root. Re-check the resolved real path:
 * realpath() the deepest existing ancestor (the target itself may not exist yet
 * for a create/write) and confirm it is still contained. Mirrors the symlink
 * guard already applied on the read path.
 */
async function assertRealPathContained(root: string, safePath: string): Promise<void> {
  const realRoot = await canonicalRoot(root);
  let probe = safePath;

  for (;;) {
    const real = await realpath(probe).catch((error) => {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return undefined;
      }

      throw error;
    });

    if (real !== undefined) {
      const rel = relative(realRoot, real);

      if (rel === '..' || rel.startsWith(`..${sep}`)) {
        throw Object.assign(new Error('Path escapes workspace root'), { statusCode: 400, code: 'EACCES' });
      }

      return;
    }

    const parent = dirname(probe);

    if (parent === probe) {
      return;
    }

    probe = parent;
  }
}

function assertContentSize(content: string, maxFileBytes: number) {
  if (Buffer.byteLength(content) > maxFileBytes) {
    throw new Error('File is too large');
  }
}

function parseTerminalMessage(message: Buffer) {
  const text = message.toString();

  try {
    const parsed = JSON.parse(text) as {
      type?: string;
      data?: string;
      cols?: number;
      rows?: number;
      signal?: string;
    };
    return {
      type: parsed.type ?? 'stdin',
      data: typeof parsed.data === 'string' ? parsed.data : '',
      cols: typeof parsed.cols === 'number' ? parsed.cols : undefined,
      rows: typeof parsed.rows === 'number' ? parsed.rows : undefined,
      signal: typeof parsed.signal === 'string' ? parsed.signal : undefined,
    };
  } catch {
    return { type: 'stdin', data: text, cols: undefined, rows: undefined, signal: undefined };
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

/**
 * Turn a parsed Fastify request body back into bytes/string suitable for
 * `fetch`. Without this, a parsed JSON/form object was passed straight to fetch,
 * which coerced it to the literal string "[object Object]" — corrupting every
 * non-GET request (form submissions, API calls) the previewed app makes.
 */
function serializePreviewBody(body: unknown, contentType: string | undefined): string | Buffer | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  // Already raw (binary/multipart via the catch-all parser, or text/plain).
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return body;
  }

  const ct = (contentType ?? '').toLowerCase();

  if (ct.includes('application/x-www-form-urlencoded') && typeof body === 'object') {
    return new URLSearchParams(body as Record<string, string>).toString();
  }

  // application/json (and any other object body) → faithful JSON.
  return JSON.stringify(body);
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

async function listTree(
  root: string,
  current: string,
): Promise<{ path: string; type: 'file' | 'directory'; children?: unknown[] }[]> {
  if (current === root) {
    await mkdir(root, { recursive: true });
  }

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

/*
 * Directories that are regenerable / VCS-internal and must never be walked into
 * a snapshot or export: they routinely blow past the zip-entry cap (a single
 * node_modules easily exceeds the 5000-entry limit, failing the whole export)
 * and waste hundreds of MB reading files that the build reproduces anyway.
 */
const SNAPSHOT_IGNORED_DIRS = new Set(['node_modules', '.git', '.vite', '.next', '.cache', 'dist', '.turbo']);

async function listSnapshotFiles(
  root: string,
  current: string,
): Promise<Array<{ path: string; sha256: string; size: number }>> {
  if (current === root) {
    await mkdir(root, { recursive: true });
  }

  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(current, entry.name);

    if (entry.isDirectory()) {
      if (SNAPSHOT_IGNORED_DIRS.has(entry.name)) {
        continue;
      }

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

  const normalizedArgs = normalizeShellCommandArgs(command, args);
  const signal = detectCommandAbuse(command, normalizedArgs);

  if (signal) {
    throw Object.assign(new Error(`Command blocked by abuse policy: ${signal.reason}`), {
      statusCode: 409,
      code: `ABUSE_${signal.type.toUpperCase()}`,
    });
  }

  const id = createHash('sha256')
    .update(`${command}:${normalizedArgs.join('\0')}:${Date.now()}`)
    .digest('hex')
    .slice(0, 12);

  const child = spawn(command, normalizedArgs, { cwd, shell: false, env: process.env });

  const record = {
    id,
    command: [command, ...normalizedArgs].join(' '),
    startedAt: new Date().toISOString(),
    process: child,
    output: '',
  };
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
    /*
     * Escalate to SIGKILL if the child ignores/traps SIGTERM, so a wedged
     * process cannot permanently hold a slot and hang the request.
     */
    const sigkillTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }, options.timeoutMs + 5_000);

    if (typeof sigkillTimer.unref === 'function') {
      sigkillTimer.unref();
    }

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(sigkillTimer);
      options.processes.delete(id);
      resolvePromise({ id, code, signal, stdout, stderr, truncated });
    });

    /*
     * spawn() emits 'error' (e.g. ENOENT for an unknown command) without a
     * matching 'close'. With no listener Node turns this into an uncaught
     * exception that crashes the agent and leaves this promise unresolved,
     * hanging the request. Surface it as a normal failed-command result.
     */
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(sigkillTimer);
      options.processes.delete(id);
      resolvePromise({
        id,
        code: 1,
        signal: null,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`,
        truncated,
      });
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
    isOpen: () => boolean;
    onActiveProcess: (process: ChildProcessWithoutNullStreams) => void;
    onComplete: (process: ChildProcessWithoutNullStreams) => void;
  },
) {
  if (options.processes.size >= options.maxProcesses) {
    throw new Error('Process limit reached');
  }

  const normalizedArgs = normalizeShellCommandArgs(command, args);
  const signal = detectCommandAbuse(command, normalizedArgs);

  if (signal) {
    throw Object.assign(new Error(`Command blocked by abuse policy: ${signal.reason}`), {
      statusCode: 409,
      code: `ABUSE_${signal.type.toUpperCase()}`,
    });
  }

  const id = createHash('sha256')
    .update(`stream:${command}:${normalizedArgs.join('\0')}:${Date.now()}`)
    .digest('hex')
    .slice(0, 12);

  const child = spawn(command, normalizedArgs, { cwd, shell: false, env: process.env });

  const record: ProcessRecord = {
    id,
    command: [command, ...normalizedArgs].join(' '),
    startedAt: new Date().toISOString(),
    process: child,
    output: '',
  };
  options.processes.set(id, record);
  options.onActiveProcess(child);

  const send = (type: 'stdout' | 'stderr', chunk: Buffer) => {
    const data = chunk.toString('utf8');
    record.output = `${record.output ?? ''}${data}`.slice(-options.maxOutputBytes);

    /*
     * Don't write to a closed socket — the client disconnected and the child is being
     * torn down; the send would throw and the error would be swallowed nowhere useful.
     */
    if (!options.isOpen()) {
      return;
    }

    try {
      options.socket.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
    } catch {
      // Socket transitioned to CLOSING after the isOpen() check; drop the chunk
      // instead of throwing out of the child's 'data' listener.
    }
  };

  child.stdout.on('data', (chunk) => send('stdout', chunk));
  child.stderr.on('data', (chunk) => send('stderr', chunk));

  await new Promise<void>((resolvePromise) => {
    child.on('close', (code) => {
      if (options.isOpen()) {
        try {
          options.socket.send(
            JSON.stringify({ type: 'exit', exitCode: code ?? 0, timestamp: new Date().toISOString() }),
          );
        } catch {
          // Socket closed between the isOpen() check and the send; nothing to deliver.
        }
      }

      options.processes.delete(id);
      options.onComplete(child);
      resolvePromise();
    });

    /*
     * Without an 'error' listener a failed spawn (ENOENT, EACCES, …) becomes an
     * uncaught exception that crashes the agent and leaves the stream promise
     * pending. Report it to the client and resolve cleanly instead.
     */
    child.on('error', (error) => {
      if (options.isOpen()) {
        try {
          options.socket.send(
            JSON.stringify({
              type: 'error',
              error: { message: error instanceof Error ? error.message : String(error) },
              timestamp: new Date().toISOString(),
            }),
          );
        } catch {
          // Socket already gone; drop the message.
        }
      }

      options.processes.delete(id);
      options.onComplete(child);
      resolvePromise();
    });
  });
}

type DetectedPort = { port: number; processId: string };

/*
 * Authoritative port detection: read the kernel's listening TCP sockets from /proc/net/tcp(6) and
 * attribute each to the managed process (or descendant) that owns it via the socket inode -> pid ->
 * process-tree mapping. The workspace agent runs alone in its per-workspace container, so every
 * listening socket here belongs to user processes — the agent's own control port is excluded because
 * its pid is never a descendant of a tracked record. Falls back to the legacy log/heuristic scrape
 * only when /proc is unavailable (e.g. macOS dev) or yields nothing.
 */
async function detectPorts(processes: Map<string, ProcessRecord>): Promise<DetectedPort[]> {
  try {
    const listening = await readListeningPorts();

    if (listening.size > 0) {
      const inodeToPid = await readSocketInodeToPid();
      const managedPids = new Map<number, string>();

      for (const record of processes.values()) {
        if (typeof record.process.pid === 'number') {
          managedPids.set(record.process.pid, record.id);
        }
      }

      const detected: DetectedPort[] = [];

      for (const [port, inode] of listening) {
        const pid = inodeToPid.get(inode);

        if (pid === undefined || pid === process.pid) {
          /*
           * No owning pid, or the agent's own control port — never a user
           * preview. The workspace agent runs alone in its per-workspace
           * container, so every other listening socket belongs to a user
           * process.
           */
          continue;
        }

        /*
         * Prefer attributing the port to a tracked managed command; otherwise
         * it was started outside /commands/run — most importantly a dev server
         * launched from the IDE terminal (the primary "run my app" flow), whose
         * pid is not in the managed map. Previously these were dropped, so the
         * preview never opened for terminal-started servers. Surface them with a
         * synthetic, display-only owner id.
         */
        const managedId = await owningManagedProcess(pid, managedPids);
        detected.push({ port, processId: managedId ?? `pid:${pid}` });
      }

      if (detected.length > 0) {
        return detected;
      }
    }
  } catch {
    // /proc not readable (non-Linux dev host) — fall through to the heuristic scrape below.
  }

  return detectPortsFromOutput(processes);
}

// Parse listening (state 0A) IPv4/IPv6 TCP sockets into a port -> socket-inode map.
async function readListeningPorts(): Promise<Map<number, number>> {
  const ports = new Map<number, number>();

  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let content: string;

    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    for (const line of content.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);

      // Columns: sl local_address rem_address st ... uid timeout inode
      if (cols.length < 10 || cols[3] !== '0A') {
        continue;
      }

      const portHex = cols[1].split(':')[1];
      const inode = Number(cols[9]);

      if (!portHex || !Number.isFinite(inode)) {
        continue;
      }

      const port = Number.parseInt(portHex, 16);

      if (port > 0 && port <= 65535) {
        ports.set(port, inode);
      }
    }
  }

  return ports;
}

// Map socket inodes to the pid holding them by scanning /proc/<pid>/fd symlinks (socket:[inode]).
async function readSocketInodeToPid(): Promise<Map<number, number>> {
  const map = new Map<number, number>();

  let pids: string[];

  try {
    pids = (await readdir('/proc')).filter((name) => /^\d+$/.test(name));
  } catch {
    return map;
  }

  await Promise.all(
    pids.map(async (pid) => {
      let fds: string[];

      try {
        fds = await readdir(`/proc/${pid}/fd`);
      } catch {
        return;
      }

      await Promise.all(
        fds.map(async (fd) => {
          try {
            const target = await readlink(`/proc/${pid}/fd/${fd}`);
            const match = /^socket:\[(\d+)\]$/.exec(target);

            if (match) {
              map.set(Number(match[1]), Number(pid));
            }
          } catch {
            // fd vanished between readdir and readlink — ignore.
          }
        }),
      );
    }),
  );

  return map;
}

// Walk the parent chain from `pid` until a tracked managed pid is reached, returning its record id.
async function owningManagedProcess(pid: number, managedPids: Map<number, string>): Promise<string | undefined> {
  let current: number | undefined = pid;

  for (let depth = 0; current && current > 1 && depth < 32; depth += 1) {
    const recordId = managedPids.get(current);

    if (recordId) {
      return recordId;
    }

    current = await parentPid(current);
  }

  return undefined;
}

async function parentPid(pid: number): Promise<number | undefined> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');

    // Fields after the (comm) — which may contain spaces/parens — are: state ppid ...
    const afterComm = stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .split(/\s+/);

    const ppid = Number(afterComm[1]);

    return Number.isFinite(ppid) ? ppid : undefined;
  } catch {
    return undefined;
  }
}

function detectPortsFromOutput(processes: Map<string, ProcessRecord>): DetectedPort[] {
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
