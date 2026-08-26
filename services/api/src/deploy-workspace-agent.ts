import type { StaticBuildLogLevel } from './deployments.js';
import type { WorkspaceBuildAgent, WorkspaceBuildStepResult, WorkspaceListedFile } from './deploy-workspace-build.js';

/*
 * Real workspace-agent adapter for the P1 deploy build. Turns the pure
 * `WorkspaceBuildAgent` contract (see deploy-workspace-build.ts) into calls
 * against a project's workspace pod:
 *  - build steps stream over the agent WS `/commands/stream` (30-min budget,
 *    live output — this is what P2 surfaces),
 *  - the built `dist/` is enumerated via `/files/tree?path=dist` and pulled
 *    file-by-file via `/files/read`.
 *
 * Both the WebSocket implementation and the HTTP `agentRequest` are injected so
 * the adapter is unit-testable without a live pod.
 */

/** Minimal structural WebSocket type (Node's global WebSocket satisfies it). */
export interface WsLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: any) => void): void;
}

export type WsFactory = (url: string, headers: Record<string, string>) => WsLike;

interface AgentTreeNode {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: AgentTreeNode[];
}

/** Flatten the agent's nested `/files/tree` response into a flat file list. */
export function flattenAgentTree(nodes: AgentTreeNode[] | undefined): WorkspaceListedFile[] {
  const files: WorkspaceListedFile[] = [];

  const walk = (list: AgentTreeNode[] | undefined) => {
    for (const node of list ?? []) {
      if (node.type === 'directory') {
        walk(node.children);
      } else if (node.type === 'file') {
        files.push({ path: node.path, size: node.size });
      }
    }
  };

  walk(nodes);

  return files;
}

/**
 * Build tools write far more than errors to stderr. npm in particular sends its
 * warnings there, so classifying the whole stream as `error` painted a working
 * install red: a deploy log showed a wall of
 * `[Erreur] npm warn tar TAR_ENTRY_ERROR …` lines that were merely warnings, and
 * the one line that actually explained the failure was lost among them.
 *
 * Deliberately conservative: only a line that DECLARES itself a warning is
 * downgraded. Anything else keeps `error`, so no real failure is ever softened.
 */
export function stderrLevel(line: string): StaticBuildLogLevel {
  return /^\s*(?:npm\s+warn\b|warn\b|warning\b)/i.test(line) ? 'info' : 'error';
}

/**
 * Run one command in the workspace pod over the agent's `/commands/stream` WS,
 * forwarding each output line to `onLine`. Resolves (never rejects) with the
 * exit result; a dropped connection before `exit` is reported as an error so the
 * orchestrator can fail the deploy cleanly instead of hanging.
 */
export function streamAgentCommand(
  wsUrl: string,
  token: string,
  step: { command: string; args: string[]; cwd: string; onLine: (level: StaticBuildLogLevel, line: string) => void },
  deadlineMs: number,
  wsFactory: WsFactory,
): Promise<WorkspaceBuildStepResult> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: WsLike | undefined;

    const finish = (result: WorkspaceBuildStepResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      try {
        socket?.close();
      } catch {
        // ignore
      }

      resolve(result);
    };

    const timer = setTimeout(() => finish({ exitCode: null, timedOut: true }), deadlineMs);

    const emit = (level: StaticBuildLogLevel, chunk: unknown) => {
      const text = typeof chunk === 'string' ? chunk : String(chunk ?? '');

      for (const line of text.split('\n')) {
        if (line.length > 0) {
          step.onLine(level, line.replace(/\r$/, ''));
        }
      }
    };

    try {
      socket = wsFactory(wsUrl, { authorization: `Bearer ${token}` });
    } catch {
      finish({ exitCode: null, timedOut: false, error: 'WORKSPACE_STREAM_OPEN_FAILED' });
      return;
    }

    socket.addEventListener('open', () => {
      try {
        socket?.send(
          JSON.stringify({ type: 'hello', payload: { command: step.command, args: step.args, cwd: step.cwd } }),
        );
      } catch {
        finish({ exitCode: null, timedOut: false, error: 'WORKSPACE_STREAM_SEND_FAILED' });
      }
    });

    socket.addEventListener('message', (event: { data: unknown }) => {
      let message: { type?: string; data?: unknown; exitCode?: number; error?: { message?: string } };

      try {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        message = JSON.parse(raw);
      } catch {
        return;
      }

      switch (message.type) {
        case 'stdout':
          emit('info', message.data);
          break;
        case 'stderr':
          emit(stderrLevel(String(message.data ?? '')), message.data);
          break;
        case 'exit':
          finish({ exitCode: typeof message.exitCode === 'number' ? message.exitCode : null, timedOut: false });
          break;
        case 'error':
          finish({ exitCode: null, timedOut: false, error: 'WORKSPACE_STREAM_COMMAND_FAILED' });
          break;
        default:
          break;
      }
    });

    socket.addEventListener('error', () =>
      finish({ exitCode: null, timedOut: false, error: 'WORKSPACE_STREAM_CONNECTION_FAILED' }),
    );
    socket.addEventListener('close', () =>
      finish({ exitCode: null, timedOut: false, error: 'WORKSPACE_STREAM_CLOSED' }),
    );
  });
}

export interface WorkspaceBuildAgentDeps {
  /** ws:// base for the workspace-agent, e.g. ws://workspace-<id>.<ns>.svc:8080 */
  agentWsBaseUrl: string;
  /** Per-workspace agent bearer token, sent only in the Authorization header. */
  token: string;
  /** HTTP GET against the agent (already authed), returns parsed JSON. */
  agentGet: <T>(path: string) => Promise<T>;
  /** Shared build deadline (ms) — one budget across install + build. */
  deadlineMs: number;
  wsFactory: WsFactory;
}

/** Build a real `WorkspaceBuildAgent` bound to one workspace pod. */
export function createWorkspaceBuildAgent(deps: WorkspaceBuildAgentDeps): WorkspaceBuildAgent {
  return {
    runStep: (step) =>
      streamAgentCommand(`${deps.agentWsBaseUrl}/commands/stream`, deps.token, step, deps.deadlineMs, deps.wsFactory),

    listFiles: async (dirPath) => {
      try {
        const tree = await deps.agentGet<AgentTreeNode[]>(`/files/tree?path=${encodeURIComponent(dirPath)}`);
        return { files: flattenAgentTree(tree) };
      } catch (error) {
        return { files: [], error: (error as Error).message };
      }
    },

    readFile: (filePath) =>
      deps
        .agentGet<{ content: string; encoding?: 'utf8' | 'base64' }>(`/files/read?path=${encodeURIComponent(filePath)}`)
        .then((result) => ({ content: result.content, encoding: result.encoding === 'base64' ? 'base64' : 'utf8' })),
  };
}
