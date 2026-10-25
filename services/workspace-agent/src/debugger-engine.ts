import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Duplex } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ProcessRecord } from './app.js';
import { debuggerBootstrapSource } from './debugger-bootstrap.js';

const pathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const startSchema = z
  .object({
    operationId: z.string().uuid(),
    program: pathSchema,
    cwd: pathSchema.optional(),
    args: z.array(z.string().max(8192)).max(128).default([]),
    breakpoints: z
      .array(z.object({ file: pathSchema, line: z.number().int().min(1).max(1_000_000) }).strict())
      .max(100)
      .default([]),
    watches: z.array(z.string().min(1).max(1024)).max(32).default([]),
    stopOnEntry: z.boolean().default(true),
  })
  .strict();
const controlSchema = z
  .object({ action: z.enum(['continue', 'pause', 'step-over', 'step-into', 'step-out']) })
  .strict();
type Start = z.infer<typeof startSchema>;
type InspectorValue = {
  type?: string;
  value?: unknown;
  description?: string;
  unserializableValue?: string;
  objectId?: string;
};
type Frame = {
  callFrameId: string;
  functionName: string;
  url: string;
  location: { lineNumber: number; columnNumber: number };
  scopeChain: { type: string; object: InspectorValue }[];
};
type Snapshot = {
  id: string;
  status: string;
  expiresAt?: string;
  reason?: string;
  output?: string;
  callStack: { id: string; name: string; file: string; line: number; column: number }[];
  variables: { name: string; value: string; type: string }[];
  watches: { expression: string; value: string; error?: string }[];
};
type Session = {
  fingerprint: string;
  record: ProcessRecord;
  channel: Duplex;
  state: Snapshot;
  pending: Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >;
  sequence: number;
  epoch: number;
  commandPending: boolean;
  inspection: Promise<void>;
  post: (method: string, params?: Record<string, unknown>) => Promise<any>;
};
interface Options {
  root: string;
  processes: Map<string, ProcessRecord>;
  maxProcesses: number;
  timeoutMs: number;
  maxOutputBytes: number;
  env: NodeJS.ProcessEnv;
  rememberTerminal: (record: ProcessRecord, code: number | null, signal: string | null) => void;
  terminalResult: (id: string) => unknown;
  stop: (id: string) => Promise<unknown>;
}
// Protocol error codes are consumed by the translated UI, never human copy.
const watchUnavailableCode = 'DEBUGGER_WATCH_UNAVAILABLE';
const controlUncertainCode = 'DEBUGGER_CONTROL_UNCERTAIN';
const failure = (code: string, statusCode = 409) => Object.assign(new Error(code), { code, statusCode });
const formatValue = (value?: InspectorValue) => {
  if (!value) return 'undefined';
  const text =
    value.unserializableValue ??
    (value.value !== undefined ? JSON.stringify(value.value) : (value.description ?? value.type ?? 'undefined'));
  return String(text).slice(0, 2048);
};

export function registerDebuggerEngine(app: FastifyInstance, options: Options) {
  const sessions = new Map<string, Session>();
  const launches = new Map<string, { fingerprint: string; promise: Promise<Snapshot> }>();
  const inside = async (path: string) => {
    if (isAbsolute(path)) throw failure('DEBUGGER_PATH_OUTSIDE_WORKSPACE', 400);
    const root = await realpath(options.root);
    const target = await realpath(resolve(root, path)).catch(() => {
      throw failure('DEBUGGER_PATH_NOT_FOUND', 400);
    });
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw failure('DEBUGGER_PATH_OUTSIDE_WORKSPACE', 400);
    return target;
  };
  const snapshot = (session: Session) => ({ ...session.state, output: session.record.output ?? '' });
  const getSession = (id: string) => {
    const session = sessions.get(id);
    if (!session) throw failure('DEBUGGER_SESSION_NOT_FOUND', 404);
    return session;
  };
  const start = async (body: Start, fingerprint: string): Promise<Snapshot> => {
    const program = await inside(body.program);
    const cwd = await inside(body.cwd ?? '.');
    if (!['.js', '.mjs', '.cjs'].includes(extname(program)) || !(await stat(program)).isFile())
      throw failure('DEBUGGER_NODE_PROGRAM_REQUIRED', 400);
    if (!(await stat(cwd)).isDirectory()) throw failure('DEBUGGER_CWD_REQUIRED', 400);
    const resolvedBreakpoints = await Promise.all(
      body.breakpoints.map(async (bp) => ({ url: pathToFileURL(await inside(bp.file)).href, line: bp.line })),
    );
    // Multiple persisted UI entries (or symlink aliases) may name the same
    // source location. Inspector rejects duplicate setBreakpointByUrl calls.
    // Canonicalize first, then deduplicate without removing a user breakpoint.
    const breakpoints = [...new Map(resolvedBreakpoints.map((bp) => [JSON.stringify([bp.url, bp.line]), bp])).values()];

    // Check after asynchronous path resolution: parallel launches share this quota.
    if (options.processes.size >= options.maxProcesses) throw failure('DEBUGGER_PROCESS_LIMIT', 429);
    if (options.processes.has(body.operationId) || options.terminalResult(body.operationId))
      throw failure('DEBUGGER_OPERATION_CONFLICT');
    const env = { ...options.env };
    // User NODE_OPTIONS could reopen an inspector TCP listener or inject bootstrap code.
    delete env.NODE_OPTIONS;
    delete env.NODE_INSPECT_RESUME_ON_START;
    const child = spawn(
      process.execPath,
      [
        '-e',
        debuggerBootstrapSource,
        JSON.stringify({
          program,
          args: body.args,
          breakpoints,
          entryUrl: body.stopOnEntry ? pathToFileURL(program).href : undefined,
        }),
      ],
      {
        cwd,
        env,
        shell: false,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      },
    );
    const channel = child.stdio[3] as Duplex;
    const record: ProcessRecord = {
      id: body.operationId,
      command: `node ${body.program}`,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + options.timeoutMs).toISOString(),
      process: child as ChildProcessWithoutNullStreams,
      output: '',
      forceStopAfterMs: 1000,
    };
    options.processes.set(record.id, record);
    const session: Session = {
      fingerprint,
      record,
      channel,
      sequence: 0,
      epoch: 0,
      commandPending: false,
      inspection: Promise.resolve(),
      state: {
        id: record.id,
        status: 'running',
        expiresAt: record.expiresAt,
        callStack: [],
        variables: [],
        watches: [],
      },
      pending: new Map(),
      post: (method, params = {}) =>
        new Promise((resolveRequest, reject) => {
          if (channel.destroyed) return reject(failure('DEBUGGER_TRANSPORT_CLOSED'));
          const id = ++session.sequence;
          const timer = setTimeout(() => {
            session.pending.delete(id);
            reject(failure('DEBUGGER_COMMAND_TIMEOUT'));
          }, 3000);
          session.pending.set(id, { resolve: resolveRequest, reject, timer });
          channel.write(`${JSON.stringify({ id, method, params })}\n`);
        }),
    };
    sessions.set(record.id, session);
    // Keep finite terminal reconciliation history; never evict a live child.
    for (const [id, prior] of sessions) {
      if (sessions.size <= 200) break;
      if (!options.processes.has(id)) sessions.delete(id);
    }
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          /* already gone */
        }
      }
    };
    const timer = setTimeout(() => {
      record.timedOut = true;
      kill('SIGTERM');
    }, options.timeoutMs);
    const escalation = setTimeout(() => kill('SIGKILL'), options.timeoutMs + 5000);
    timer.unref();
    escalation.unref();
    let resolveReady: () => void;
    let rejectReady: (error: Error) => void;
    const ready = new Promise<void>((resolvePromise, reject) => {
      resolveReady = resolvePromise;
      rejectReady = reject;
    });
    const readyTimeout = setTimeout(() => {
      rejectReady(failure('DEBUGGER_START_TIMEOUT'));
      kill('SIGKILL');
    }, 5000);
    let closed = false;
    const finish = (code: number | null, signal: string | null) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      clearTimeout(escalation);
      clearTimeout(readyTimeout);
      session.epoch++;
      options.rememberTerminal(record, code, signal);
      options.processes.delete(record.id);
      Object.assign(session.state, options.terminalResult(record.id), { callStack: [], variables: [], watches: [] });
      for (const pending of session.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(failure('DEBUGGER_TRANSPORT_CLOSED'));
      }
      session.pending.clear();
      channel.destroy();
      rejectReady(failure('DEBUGGER_START_FAILED'));
    };
    child.once('close', finish);
    child.once('error', () => finish(1, null));
    for (const stream of [child.stdout, child.stderr]) {
      stream!.on('data', (chunk: Buffer) => {
        const next = (record.output ?? '') + chunk.toString('utf8');
        record.output = next.slice(-options.maxOutputBytes);
        if (Buffer.byteLength(next) > options.maxOutputBytes) kill('SIGKILL');
      });
      stream!.on('error', () => kill('SIGKILL'));
    }
    let buffer = '';
    channel.setEncoding('utf8');
    channel.on('error', () => {
      rejectReady(failure('DEBUGGER_TRANSPORT_CLOSED'));
      kill('SIGKILL');
    });
    channel.on('close', () => {
      // Pipe closure precedes the child exit notification during normal shutdown.
      // Give that notification time to arrive before treating a lost worker as fatal.
      const disconnected = setTimeout(() => {
        if (!closed && child.exitCode === null && child.signalCode === null) {
          rejectReady(failure('DEBUGGER_TRANSPORT_CLOSED'));
          kill('SIGKILL');
        }
      }, 1000);
      disconnected.unref();
      child.once('close', () => clearTimeout(disconnected));
    });
    channel.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 2 * 1024 * 1024) {
        kill('SIGKILL');
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message: any;
        try {
          message = JSON.parse(line);
        } catch {
          kill('SIGKILL');
          return;
        }
        if (message.id) {
          const pending = session.pending.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            session.pending.delete(message.id);
            if (message.error) pending.reject(failure(message.error));
            else pending.resolve(message.result);
          }
        } else if (message.event === 'ready') {
          clearTimeout(readyTimeout);
          resolveReady!();
        } else if (message.event === 'failed') {
          rejectReady!(failure('DEBUGGER_START_FAILED'));
          kill('SIGKILL');
        } else if (message.event === 'resumed') {
          session.epoch++;
          Object.assign(session.state, {
            status: 'running',
            reason: undefined,
            callStack: [],
            variables: [],
            watches: [],
          });
        } else if (message.event === 'paused') {
          const epoch = ++session.epoch;
          session.state.status = 'paused';
          session.state.reason = message.params.reason;
          const frames = message.params.callFrames as Frame[];
          session.state.callStack = frames.map((frame) => {
            let file = frame.url;
            try {
              file = relative(options.root, fileURLToPath(frame.url));
            } catch {
              /* Node internal frame */
            }
            return {
              id: frame.callFrameId,
              name: frame.functionName || '(anonymous)',
              file,
              line: frame.location.lineNumber + 1,
              column: frame.location.columnNumber + 1,
            };
          });
          session.inspection = inspectPause(session, frames, body.watches, epoch).catch(() => {
            if (session.epoch === epoch) session.state.reason = 'inspection-unavailable';
          });
        }
      }
    });
    await ready;
    return snapshot(session);
  };

  app.post('/debugger/v1/start', async (request) => {
    const body = startSchema.parse(request.body);
    const fingerprint = JSON.stringify(body);
    const existing = sessions.get(body.operationId);
    const pending = launches.get(body.operationId);
    if ((existing && existing.fingerprint !== fingerprint) || (pending && pending.fingerprint !== fingerprint))
      throw failure('DEBUGGER_OPERATION_CONFLICT');
    if (pending) return pending.promise;
    if (existing) return snapshot(existing);
    const promise = start(body, fingerprint);
    launches.set(body.operationId, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      launches.delete(body.operationId);
    }
  });
  app.get('/debugger/v1/:id', async (request) => snapshot(getSession((request.params as { id: string }).id)));
  app.post('/debugger/v1/:id/control', async (request) => {
    const { action } = controlSchema.parse(request.body);
    const session = getSession((request.params as { id: string }).id);
    if (session.commandPending) throw failure('DEBUGGER_COMMAND_IN_PROGRESS');
    if (action === 'pause' ? session.state.status !== 'running' : session.state.status !== 'paused')
      throw failure('DEBUGGER_STATE_CONFLICT');
    session.commandPending = true;
    let dispatchedEpoch: number | undefined;
    let previousState: Snapshot | undefined;
    try {
      // Finish current inspection before stepping: never evaluate stale frames.
      await session.inspection;
      const methods = {
        continue: 'Debugger.resume',
        pause: 'Debugger.pause',
        'step-over': 'Debugger.stepOver',
        'step-into': 'Debugger.stepInto',
        'step-out': 'Debugger.stepOut',
      };
      previousState = { ...session.state };
      dispatchedEpoch = ++session.epoch;
      if (action !== 'pause') {
        Object.assign(session.state, {
          status: 'running',
          reason: undefined,
          callStack: [],
          variables: [],
          watches: [],
        });
      }
      await session.post(methods[action]);
      return snapshot(session);
    } catch (error) {
      // Resume can let a short program exit before the worker's acknowledgement.
      // The confirmed terminal result is authoritative, not a transport failure.
      if (!options.processes.has(session.record.id)) return snapshot(session);
      // Roll back only a definite protocol rejection, never an uncertain timeout.
      if (
        previousState &&
        session.epoch === dispatchedEpoch &&
        (error as { code?: string }).code === 'DEBUGGER_COMMAND_FAILED'
      ) {
        session.state = previousState;
      } else if (session.epoch === dispatchedEpoch) {
        Object.assign(session.state, {
          status: 'unknown',
          reason: controlUncertainCode,
          callStack: [],
          variables: [],
          watches: [],
        });
      }
      throw error;
    } finally {
      session.commandPending = false;
    }
  });
  app.post('/debugger/v1/:id/stop', async (request) => {
    const id = (request.params as { id: string }).id;
    getSession(id);
    return options.stop(id);
  });
  app.addHook('onClose', async () => {
    await Promise.all(
      [...sessions.values()]
        .filter((session) => options.processes.has(session.record.id))
        .map(async (session) => {
          await options.stop(session.record.id);
          if (options.processes.has(session.record.id) && session.record.process.pid) {
            try {
              process.kill(-session.record.process.pid, 'SIGKILL');
            } catch {
              /* already gone */
            }
            await new Promise<void>((resolveClose) => session.record.process.once('close', () => resolveClose()));
          }
        }),
    );
  });
}

async function inspectPause(session: Session, frames: Frame[], expressions: string[], epoch: number) {
  const frame = frames[0];
  if (!frame) return;
  const variables: Snapshot['variables'] = [];
  for (const scope of frame.scopeChain
    .filter((scope) => scope.type === 'local' || scope.type === 'block')
    .slice(0, 4)) {
    if (session.epoch !== epoch) return;
    if (!scope.object.objectId) continue;
    const properties = await session.post('Runtime.getProperties', {
      objectId: scope.object.objectId,
      ownProperties: true,
      generatePreview: false,
    });
    for (const property of (properties.result ?? []).slice(0, 64)) {
      // Never invoke getters or expand arbitrary objects while inspecting locals.
      variables.push({
        name: property.name,
        value: property.get ? '[Getter]' : formatValue(property.value),
        type: property.value?.type ?? 'accessor',
      });
    }
  }
  const watches: Snapshot['watches'] = [];
  for (const expression of expressions) {
    if (session.epoch !== epoch) return;
    try {
      const result = await session.post('Debugger.evaluateOnCallFrame', {
        callFrameId: frame.callFrameId,
        expression,
        silent: true,
        throwOnSideEffect: true,
        timeout: 100,
        returnByValue: false,
      });
      watches.push({
        expression,
        value: formatValue(result.result),
        ...(result.exceptionDetails ? { error: watchUnavailableCode } : {}),
      });
    } catch {
      watches.push({ expression, value: '', error: watchUnavailableCode });
      break; // One transport timeout ends inspection; never accumulate 32 × 3s.
    }
  }
  if (session.epoch === epoch && session.state.status === 'paused') {
    session.state.variables = variables;
    session.state.watches = watches;
  }
}
