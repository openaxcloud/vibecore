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

  boot(): Promise<void>;
  startWorkspace(session?: Partial<WorkspaceSession>): Promise<WorkspaceSession>;
  stopWorkspace(workspaceId?: string): Promise<void>;
  restartWorkspace(workspaceId?: string): Promise<WorkspaceSession>;
  getWorkspaceStatus(workspaceId?: string): Promise<WorkspaceSession>;

  listFiles(path?: string): Promise<FileNode[]>;
  readFile(path: string): Promise<string>;
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
