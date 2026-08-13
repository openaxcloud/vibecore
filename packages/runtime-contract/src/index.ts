export type RuntimeMode = 'webcontainer' | 'remote-kubernetes';

export type WorkspaceStatus = 'booting' | 'starting' | 'running' | 'stopped' | 'error';

export type RuntimeCapability =
  | 'filesystem'
  | 'file-watch'
  | 'commands'
  | 'terminal'
  | 'ports'
  | 'preview'
  | 'snapshots'
  | 'zip-import-export'
  | 'logs';

export interface WorkspaceSession {
  id: string;
  runtimeMode: RuntimeMode;
  status: WorkspaceStatus;
  workdir: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;

  /**
   * True when `startWorkspace` adopted a pod that the manager reported as ALREADY
   * running (a warm/reused pod) rather than one it had to cold-provision and poll
   * to readiness. Lets the IDE reattach to a still-serving workspace on reopen
   * instead of wiping + reseeding it. Undefined when the runtime cannot tell warm
   * from cold (treated as NOT reused — the safe, reseed default).
   */
  reused?: boolean;
}

export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  content?: string;
  encoding?: 'utf8' | 'base64' | 'binary';
  children?: FileNode[];
  modifiedAt?: string;
}

export interface FileChange {
  path: string;
  type: 'create' | 'update' | 'delete' | 'rename';
  content?: string;
  oldPath?: string;
  binary?: boolean;
  timestamp?: string;
}

export interface FileSearchMatch {
  path: string;
  lineNumber: number;
  line: string;
  startColumn: number;
  endColumn: number;
}

export interface FileSearchOptions {
  includes?: string[];
  excludes?: string[];
  caseSensitive?: boolean;
  isRegex?: boolean;
  resultLimit?: number;
}

export interface CommandRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  terminal?: {
    cols: number;
    rows: number;
  };
  timeoutMs?: number;
}

export interface CommandEvent {
  type: 'stdout' | 'stderr' | 'exit' | 'error';
  data?: string;
  exitCode?: number;
  error?: RuntimeError;
  timestamp: string;
}

export interface CommandResult {
  exitCode: number;
  output: string;
  events: CommandEvent[];
}

export interface TerminalSession {
  id: string;
  processId: string;
  cols: number;
  rows: number;
  write(data: string): void | Promise<void>;
  resize(cols: number, rows: number): void | Promise<void>;
  kill(): void | Promise<void>;
  events: AsyncIterable<CommandEvent>;
}

export interface WorkspaceProcess {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  status: 'running' | 'exited' | 'killed';
  startedAt?: string;
  exitCode?: number;
}

export interface WorkspacePort {
  port: number;
  type: 'open' | 'close';
  url?: string;
  ready?: boolean;
}

export interface PreviewRoute {
  port: number;
  url: string;
  ready: boolean;
}

export interface Snapshot {
  id: string;
  workspaceId: string;
  createdAt: string;
  files: FileNode[];
  metadata?: Record<string, unknown>;
}

export interface RuntimePatchOperation {
  type: 'write' | 'delete' | 'rename' | 'move';
  path: string;
  content?: string;
  newPath?: string;
}

export interface RuntimePatch {
  operations: RuntimePatchOperation[];
}

export class RuntimeError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options: { code?: string; status?: number; details?: unknown; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'RuntimeError';
    this.code = options.code ?? 'RUNTIME_ERROR';
    this.status = options.status;
    this.details = options.details;
  }
}

export interface RuntimeAdapter {
  readonly mode: RuntimeMode;
  readonly workdir: string;
  readonly capabilities: RuntimeCapability[];

  /**
   * Whether this adapter is bound to a workspace yet. The remote adapter created
   * as the module singleton (before ProjectWorkspaceProvider.configureRuntime
   * wires the project-scoped adapter) has no workspace id, so starting a file/
   * port watch on it throws "Remote workspace has not been started". Stores probe
   * this to skip watching until a real workspace is configured. Optional —
   * runtimes that are always workspace-bound (WebContainer) may omit it.
   */
  hasWorkspaceId?(): boolean;

  boot(): Promise<void>;
  startWorkspace(session?: Partial<WorkspaceSession>): Promise<WorkspaceSession>;
  stopWorkspace(workspaceId?: string): Promise<void>;
  restartWorkspace(workspaceId?: string): Promise<WorkspaceSession>;
  getWorkspaceStatus(workspaceId?: string): Promise<WorkspaceSession>;

  listFiles(path?: string): Promise<FileNode[]>;
  /**
   * Read a file's content. Binary files (images/fonts/wasm) come back base64-
   * encoded with `encoding: 'base64'`; text comes back as utf8 (encoding 'utf8'
   * or omitted). Callers that only handle text take `.content`; callers that
   * hydrate a file-store entry must set `isBinary` from `encoding === 'base64'`.
   */
  readFile(path: string): Promise<{ content: string; encoding?: 'utf8' | 'base64' }>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  renameFile(path: string, newPath: string): Promise<void>;
  moveFile(path: string, newPath: string): Promise<void>;
  searchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchMatch[]>;
  watchFiles(paths: string[], onChange: (change: FileChange) => void): Promise<() => void>;
  applyPatch(patch: RuntimePatch): Promise<FileChange[]>;

  runCommand(request: CommandRequest): Promise<CommandResult>;
  streamCommand(request: CommandRequest): AsyncIterable<CommandEvent>;
  openTerminal(request?: Partial<CommandRequest>): Promise<TerminalSession>;
  resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void>;
  killProcess(processId: string): Promise<void>;
  listProcesses(): Promise<WorkspaceProcess[]>;

  listPorts(): Promise<WorkspacePort[]>;
  watchPorts(onChange: (port: WorkspacePort) => void): Promise<() => void>;
  getPreviewUrl(port: number): Promise<PreviewRoute>;

  createSnapshot(label?: string): Promise<Snapshot>;
  restoreSnapshot(snapshotId: string): Promise<void>;
  exportZip(path?: string): Promise<Uint8Array>;
  importZip(data: Uint8Array, targetPath?: string): Promise<void>;
}

const HEAD_TAIL_OBSOLETE = /\b(head|tail)\s+-(\d+)(?=[\s;|&)]|$)/g;
const POSIX_SHELLS = new Set(['ash', 'bash', 'jsh', 'sh', 'zsh']);

/**
 * Normalize known shell dialect quirks before commands reach WebContainer jsh,
 * BusyBox, or the remote workspace-agent. The rewrite is intentionally narrow:
 * obsolete `head -20` / `tail -20` syntax is converted to the POSIX form while
 * quoted user text remains byte-for-byte unchanged.
 */
export function normalizeShellCommand(command: string): string {
  if (!command || typeof command !== 'string') {
    return command;
  }

  let normalized = '';
  let unquoted = '';
  let quote: '"' | "'" | null = null;
  let escape = false;

  const flushUnquoted = () => {
    normalized += unquoted.replace(
      HEAD_TAIL_OBSOLETE,
      (_match, utility: string, count: string) => `${utility} -n ${count}`,
    );
    unquoted = '';
  };

  for (const char of command) {
    if (escape) {
      if (quote) {
        normalized += char;
      } else {
        unquoted += char;
      }

      escape = false;
      continue;
    }

    if (char === '\\') {
      if (quote) {
        normalized += char;
      } else {
        unquoted += char;
      }

      escape = true;
      continue;
    }

    if (quote) {
      normalized += char;

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      flushUnquoted();
      quote = char;
      normalized += char;
      continue;
    }

    unquoted += char;
  }

  flushUnquoted();

  return normalized;
}

export function splitPipeSegments(command: string): string[] {
  const segments: string[] = [];

  let buffer = '';
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (const char of command) {
    if (escape) {
      buffer += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      buffer += char;
      escape = true;
      continue;
    }

    if (quote) {
      buffer += char;

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
      continue;
    }

    if (char === '|') {
      segments.push(buffer.trim());
      buffer = '';
      continue;
    }

    buffer += char;
  }

  if (buffer.trim()) {
    segments.push(buffer.trim());
  }

  return segments;
}

export function normalizeShellCommandArgs(command: string, args: string[] = []): string[] {
  if (!args.length) {
    return args;
  }

  const shellIndex = findShellInvocationIndex(command, args);

  if (shellIndex === null) {
    return args;
  }

  const commandFlagIndex = args.findIndex((arg, index) => index >= shellIndex && /^-[A-Za-z]*c[A-Za-z]*$/.test(arg));

  if (commandFlagIndex === -1 || typeof args[commandFlagIndex + 1] !== 'string') {
    return args;
  }

  const normalizedCommand = normalizeShellCommand(args[commandFlagIndex + 1]);

  if (normalizedCommand === args[commandFlagIndex + 1]) {
    return args;
  }

  const normalizedArgs = [...args];
  normalizedArgs[commandFlagIndex + 1] = normalizedCommand;

  return normalizedArgs;
}

export function normalizeShellCommandRequest<T extends { command: string; args?: string[] }>(request: T): T {
  const originalArgs = request.args ?? [];
  const normalizedArgs = normalizeShellCommandArgs(request.command, originalArgs);

  if (normalizedArgs === originalArgs) {
    return request;
  }

  return { ...request, args: normalizedArgs };
}

function findShellInvocationIndex(command: string, args: string[]): number | null {
  const commandName = baseCommandName(command);

  if (POSIX_SHELLS.has(commandName)) {
    return 0;
  }

  if (commandName !== 'env') {
    return null;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg || arg === '-' || arg.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) {
      continue;
    }

    return POSIX_SHELLS.has(baseCommandName(arg)) ? index : null;
  }

  return null;
}

function baseCommandName(command: string): string {
  return command.split(/[\\/]/).pop()?.toLowerCase() ?? command.toLowerCase();
}
