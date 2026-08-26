import {
  RuntimeError,
  normalizeShellCommandRequest,
  type CommandEvent,
  type CommandRequest,
  type CommandResult,
  type FileChange,
  type FileNode,
  type FileSearchMatch,
  type FileSearchOptions,
  type PreviewRoute,
  type RuntimeAdapter,
  type RuntimeCapability,
  type RuntimePatch,
  type Snapshot,
  type TerminalSession,
  type WorkspacePort,
  type WorkspaceProcess,
  type WorkspaceSession,
} from '@vibecore/runtime-contract';
import JSZip from 'jszip';

export interface WebContainerProcessLike {
  input: WritableStream<string>;
  output: ReadableStream<string>;
  exit: Promise<number>;
  kill(): void;
  resize(size: { cols: number; rows: number }): void;
}

export interface WebContainerFileSystemLike {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /*
   * The real WebContainer fs returns a Uint8Array when no encoding is given and a
   * string when 'utf-8' is passed — model both so binary reads aren't mistyped.
   */
  readFile(path: string, encoding?: string | { encoding?: string }): Promise<string | Uint8Array>;
  writeFile(path: string, content: string | Uint8Array, encoding?: string | { encoding?: string }): Promise<void>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  readdir(path: string, options?: { withFileTypes?: boolean }): Promise<WebContainerDirentLike[]>;
}

export interface WebContainerDirentLike {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  type?: 'file' | 'directory';
}

export interface WebContainerLike {
  workdir: string;
  fs: WebContainerFileSystemLike;
  spawn(command: string, args?: string[], options?: Record<string, unknown>): Promise<WebContainerProcessLike>;
  on(event: 'server-ready', listener: (port: number, url: string) => void): () => void;
  on(event: 'port', listener: (port: number, type: 'open' | 'close', url: string) => void): () => void;
  on(event: string, listener: (...args: any[]) => void): () => void;
  setPreviewScript(script: string): Promise<void>;
  internal: {
    watchPaths: (
      paths: string[] | Record<string, unknown>,
      callback: (...events: any[]) => void,
    ) => { close?: () => void } | (() => void);
    textSearch?: (
      query: string,
      options: TextSearchOptionsLike,
      onProgress: TextSearchOnProgressCallbackLike,
    ) => Promise<unknown>;
  };
}

export interface PathWatcherEventLike {
  type: string;
  kind?: string;
  path: string;
  paths?: string[];
  buffer?: Uint8Array;
}

export interface TextSearchOptionsLike extends FileSearchOptions {
  folders?: string[];
  homeDir?: string;
  gitignore?: boolean;
  requireGit?: boolean;
  globalIgnoreFiles?: boolean;
  ignoreSymlinks?: boolean;
  isWordMatch?: boolean;
}

export type TextSearchOnProgressCallbackLike = (filePath: string, matches: any[]) => void;

export interface WebContainerRuntimeAdapterOptions {
  webcontainer?: Promise<WebContainerLike> | WebContainerLike;
  bootWebContainer?: () => Promise<WebContainerLike>;
  workdir?: string;
}

export interface BrowserWebContainerRuntimeContext {
  loaded: boolean;
}

export interface BrowserWebContainerRuntimeOptions {
  workdir?: string;
  workdirName: string;
  coep?: 'credentialless' | 'require-corp' | 'none';
  forwardPreviewErrors?: boolean;
  inspectorScript?: string | Promise<string>;
  onPreviewMessage?: (message: any) => void;
  hotData?: Record<string, any>;
  context?: BrowserWebContainerRuntimeContext;
  ssr?: boolean;
}

export interface BrowserWebContainerRuntime {
  webcontainer: Promise<WebContainerLike>;
  adapter: WebContainerRuntimeAdapter;
  context: BrowserWebContainerRuntimeContext;
}

export const webContainerConnectModuleUrl = 'https://cdn.jsdelivr.net/npm/@webcontainer/api@latest/dist/connect.js';

export async function loadWebContainerAuth() {
  const { auth } = await import('@webcontainer/api');
  return auth;
}

export function createBrowserWebContainerRuntime(
  options: BrowserWebContainerRuntimeOptions,
): BrowserWebContainerRuntime {
  const context = options.context ?? { loaded: false };

  let webcontainer: Promise<WebContainerLike> = new Promise(() => {
    // WebContainer is browser-only; SSR receives a pending promise and never boots it.
  });

  const adapter = new WebContainerRuntimeAdapter({
    bootWebContainer: () => webcontainer,
    workdir: options.workdir,
  });

  if (!options.ssr) {
    webcontainer =
      options.hotData?.webcontainer ??
      Promise.resolve()
        .then(async () => {
          const { WebContainer } = await import('@webcontainer/api');
          return WebContainer.boot({
            coep: options.coep ?? 'credentialless',
            workdirName: options.workdirName,
            forwardPreviewErrors: options.forwardPreviewErrors ?? true,
          }) as unknown as Promise<WebContainerLike>;
        })
        .then(async (bootedWebContainer) => {
          context.loaded = true;

          if (options.inspectorScript) {
            await bootedWebContainer.setPreviewScript(await options.inspectorScript);
          }

          if (options.onPreviewMessage) {
            bootedWebContainer.on('preview-message', options.onPreviewMessage);
          }

          return bootedWebContainer;
        });

    if (options.hotData) {
      options.hotData.webcontainer = webcontainer;
    }
  }

  return { webcontainer, adapter, context };
}

export class WebContainerRuntimeAdapter implements RuntimeAdapter {
  readonly mode = 'webcontainer' as const;
  readonly capabilities: RuntimeCapability[] = [
    'filesystem',
    'file-watch',
    'commands',
    'terminal',
    'ports',
    'preview',
    'snapshots',
    'zip-import-export',
  ];

  readonly workdir: string;
  #webcontainer?: Promise<WebContainerLike>;
  #bootWebContainer?: () => Promise<WebContainerLike>;
  #session?: WorkspaceSession;
  #ports = new Map<number, WorkspacePort>();
  #processes = new Map<string, WorkspaceProcess & { process?: WebContainerProcessLike }>();
  #snapshots = new Map<string, Snapshot>();
  #terminalProcesses = new Map<string, WebContainerProcessLike>();
  #portSubscribers = new Set<(port: WorkspacePort) => void>();
  #unsubscribePortEvents?: () => void;
  #unsubscribeServerReady?: () => void;

  constructor(options: WebContainerRuntimeAdapterOptions = {}) {
    this.workdir = options.workdir ?? '/home/project';
    this.#bootWebContainer = options.bootWebContainer;

    if (options.webcontainer) {
      this.#webcontainer = Promise.resolve(options.webcontainer);
    }
  }

  async boot(): Promise<void> {
    const webcontainer = await this.#getWebContainer();

    if (!this.#unsubscribeServerReady) {
      this.#unsubscribeServerReady = webcontainer.on('server-ready', (port, url) => {
        this.#setPort({ port, type: 'open', url, ready: true });
      });
    }

    if (!this.#unsubscribePortEvents) {
      this.#unsubscribePortEvents = webcontainer.on('port', (port, type, url) => {
        if (type === 'close') {
          this.#setPort({ port, type, url, ready: false });
        } else {
          this.#setPort({ port, type, url, ready: true });
        }
      });
    }
  }

  async startWorkspace(session: Partial<WorkspaceSession> = {}): Promise<WorkspaceSession> {
    await this.boot();

    const now = new Date().toISOString();
    this.#session = {
      id: session.id ?? 'webcontainer-local',
      runtimeMode: 'webcontainer',
      status: 'running',
      workdir: session.workdir ?? this.workdir,
      createdAt: session.createdAt ?? now,
      updatedAt: now,
      metadata: session.metadata,
    };

    return this.#session;
  }

  async stopWorkspace(): Promise<void> {
    this.#session = this.#session
      ? { ...this.#session, status: 'stopped', updatedAt: new Date().toISOString() }
      : undefined;

    for (const [id, process] of this.#processes) {
      process.process?.kill();
      this.#processes.set(id, { ...process, status: 'killed' });
    }
  }

  async restartWorkspace(): Promise<WorkspaceSession> {
    await this.stopWorkspace();
    return this.startWorkspace(this.#session);
  }

  async getWorkspaceStatus(): Promise<WorkspaceSession> {
    if (!this.#session) {
      return this.startWorkspace();
    }

    return this.#session;
  }

  async listFiles(path = '.'): Promise<FileNode[]> {
    const webcontainer = await this.#getWebContainer();
    return this.#listFiles(webcontainer, this.#toRuntimePath(path));
  }

  async readFile(path: string): Promise<{ content: string; encoding?: 'utf8' | 'base64' }> {
    const webcontainer = await this.#getWebContainer();

    /*
     * Read raw bytes (not 'utf-8') so binary assets (images/fonts/wasm) survive
     * the round-trip. utf8-decoding binary lossily corrupts it. Classify by
     * content: text → utf8 string, binary → base64, mirroring the file-tree
     * read path and the remote adapter so consumers handle both identically.
     */
    const raw = await webcontainer.fs.readFile(this.#toRuntimePath(path));
    const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;

    if (isUtf8(bytes)) {
      return { content: new TextDecoder().decode(bytes), encoding: 'utf8' };
    }

    return { content: toBase64(bytes), encoding: 'base64' };
  }

  async writeFile(path: string, content: string, encoding?: 'utf8' | 'base64'): Promise<void> {
    const webcontainer = await this.#getWebContainer();
    const runtimePath = this.#toRuntimePath(path);
    await this.#ensureParentDirectory(webcontainer, runtimePath);

    /*
     * Binary assets (images/fonts/wasm) arrive base64-encoded with
     * encoding:'base64'. Decode to raw bytes before writing — passing the
     * base64 STRING through to fs.writeFile stores it verbatim as the file's
     * text body, corrupting the asset. This mirrors the read/restore side
     * (#listFiles, #restoreNodes) which base64-encodes the same bytes.
     */
    if (encoding === 'base64') {
      await webcontainer.fs.writeFile(runtimePath, fromBase64(content));
      return;
    }

    await webcontainer.fs.writeFile(runtimePath, content);
  }

  async createFile(path: string, content = '', encoding?: 'utf8' | 'base64'): Promise<void> {
    await this.writeFile(path, content, encoding);
  }

  async createDirectory(path: string): Promise<void> {
    const webcontainer = await this.#getWebContainer();
    await webcontainer.fs.mkdir(this.#toRuntimePath(path), { recursive: true });
  }

  async deleteFile(path: string): Promise<void> {
    const webcontainer = await this.#getWebContainer();
    await webcontainer.fs.rm(this.#toRuntimePath(path), { recursive: true, force: true });
  }

  async renameFile(path: string, newPath: string): Promise<void> {
    await this.moveFile(path, newPath);
  }

  async moveFile(path: string, newPath: string): Promise<void> {
    const webcontainer = await this.#getWebContainer();
    const runtimePath = this.#toRuntimePath(path);
    const newRuntimePath = this.#toRuntimePath(newPath);
    await this.#ensureParentDirectory(webcontainer, newRuntimePath);
    await webcontainer.fs.rename(runtimePath, newRuntimePath);
  }

  async searchFiles(query: string, options: FileSearchOptions = {}): Promise<FileSearchMatch[]> {
    const webcontainer = await this.#getWebContainer();

    if (typeof webcontainer.internal?.textSearch === 'function') {
      const matches: FileSearchMatch[] = [];
      await webcontainer.internal.textSearch(query, { ...options, folders: ['.'] }, (filePath, apiMatches) => {
        for (const apiMatch of apiMatches) {
          const previewText = String(apiMatch.preview?.text ?? '');

          for (const range of apiMatch.ranges ?? []) {
            matches.push({
              path: filePath,
              lineNumber: Number(range.startLineNumber ?? 1),
              line: previewText.split('\n')[0] ?? '',
              startColumn: Number(range.startColumn ?? 0),
              endColumn: Number(range.endColumn ?? 0),
            });
          }
        }
      });

      return matches.slice(0, options.resultLimit);
    }

    return this.#searchByReadingFiles(query, options);
  }

  async watchFiles(paths: string[], onChange: (change: FileChange) => void): Promise<() => void> {
    const webcontainer = await this.#getWebContainer();

    const watchTarget = {
      include: paths.map((path) => `${path.replace(/\/+$/, '')}/**`),
      exclude: ['**/node_modules', '.git', '**/package-lock.json'],
      includeContent: true,
    };
    const watcher = webcontainer.internal?.watchPaths?.(watchTarget, (eventOrEvents) => {
      const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];

      for (const event of events) {
        const eventPaths = event.paths ?? [event.path];

        for (const path of eventPaths) {
          const eventType = event.type ?? event.kind;
          const isFileEvent = eventType === 'add_file' || eventType === 'change';
          const buffer = event.buffer as Uint8Array | undefined;
          const binary = buffer ? !isUtf8(buffer) : undefined;
          onChange({
            path,
            type: this.#mapWatchEvent(eventType),
            ...(eventType === 'add_dir' || eventType === 'remove_dir'
              ? { entryType: 'directory' as const }
              : eventType === 'add_file' || eventType === 'remove_file' || eventType === 'change'
                ? { entryType: 'file' as const }
                : {}),

            /*
             * Honor the binary ⟹ base64-content invariant the rest of the app
             * relies on. Decoding a binary buffer as UTF-8 here corrupted it
             * (replacement chars) and, since `binary:true` was also set, the
             * consumer treated lossy text as base64 → garbage written to disk.
             */
            content: buffer
              ? binary
                ? toBase64(buffer)
                : new TextDecoder().decode(buffer)
              : isFileEvent
                ? ''
                : undefined,
            binary,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    if (!watcher) {
      return () => {};
    }

    if (typeof watcher === 'function') {
      return watcher;
    }

    return () => watcher.close?.();
  }

  async applyPatch(patch: RuntimePatch): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    for (const operation of patch.operations) {
      if (operation.type === 'write') {
        await this.writeFile(operation.path, operation.content ?? '');
        changes.push({ path: operation.path, type: 'update', content: operation.content });
      } else if (operation.type === 'delete') {
        await this.deleteFile(operation.path);
        changes.push({ path: operation.path, type: 'delete' });
      } else if (operation.type === 'rename' || operation.type === 'move') {
        if (!operation.newPath) {
          throw new RuntimeError('Patch operation requires newPath', { code: 'INVALID_PATCH' });
        }

        await this.moveFile(operation.path, operation.newPath);
        changes.push({ path: operation.newPath, oldPath: operation.path, type: 'rename' });
      }
    }

    return changes;
  }

  async runCommand(request: CommandRequest): Promise<CommandResult> {
    const events: CommandEvent[] = [];

    let output = '';

    for await (const event of this.streamCommand(request)) {
      events.push(event);

      if (event.data) {
        output += event.data;
      }
    }

    const exitEvent = events.findLast((event) => event.type === 'exit');

    /*
     * An 'error' event with no 'exit' means the command failed to run/complete;
     * defaulting exitCode to 0 there falsely reported success (callers then
     * proceed as if e.g. the build passed). Treat that case as a failure.
     */
    if (!exitEvent) {
      const errorEvent = events.findLast((event) => event.type === 'error');

      if (errorEvent) {
        return { exitCode: 1, output, events };
      }
    }

    return { exitCode: exitEvent?.exitCode ?? 0, output, events };
  }

  async *streamCommand(request: CommandRequest): AsyncIterable<CommandEvent> {
    const process = await this.#spawnTracked(request);
    const reader = process.output.getReader();

    let completed = false;

    try {
      while (true) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        yield { type: 'stdout', data: chunk.value, timestamp: new Date().toISOString() };
      }

      const exitCode = await process.exit;
      completed = true;
      yield { type: 'exit', exitCode, timestamp: new Date().toISOString() };
    } catch (error) {
      yield {
        type: 'error',
        error: toRuntimeError(error),
        timestamp: new Date().toISOString(),
      };
    } finally {
      reader.releaseLock();

      /*
       * The consumer broke or threw out of the loop before the command finished —
       * kill the process so we never leak a live shell per cancelled command.
       */
      if (!completed) {
        process.kill();
      }
    }
  }

  async openTerminal(request: Partial<CommandRequest> = {}): Promise<TerminalSession> {
    const process = await this.#spawnTracked({
      command: request.command ?? '/bin/jsh',
      args: request.args ?? ['--osc'],
      cwd: request.cwd,
      env: request.env,
      terminal: request.terminal ?? { cols: 80, rows: 15 },
    });

    const id = `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.#terminalProcesses.set(id, process);

    const writer = process.input.getWriter();
    const events = this.#processEvents(process);

    return {
      id,
      processId: id,
      cols: request.terminal?.cols ?? 80,
      rows: request.terminal?.rows ?? 15,
      write: (data) => {
        /*
         * Guard like the remote adapter: the underlying input stream is closed
         * once the spawned shell exits or killProcess() kills it, so a keystroke
         * arriving in that window would otherwise reject the write() Promise with
         * nothing to catch it (unhandled rejection in the browser/desktop runtime).
         * Dropping input across an exited process is acceptable.
         */
        void writer.write(data).catch(() => {});
      },
      resize: (cols, rows) => this.resizeTerminal(id, cols, rows),
      kill: () => this.killProcess(id),
      events,
    };
  }

  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    this.#terminalProcesses.get(terminalId)?.resize?.({ cols, rows });
  }

  async killProcess(processId: string): Promise<void> {
    const tracked = this.#processes.get(processId);
    tracked?.process?.kill();
    this.#terminalProcesses.get(processId)?.kill();

    if (tracked) {
      this.#processes.set(processId, { ...tracked, status: 'killed' });
    }
  }

  async listProcesses(): Promise<WorkspaceProcess[]> {
    return [...this.#processes.values()].map(({ process: _process, ...metadata }) => metadata);
  }

  async listPorts(): Promise<WorkspacePort[]> {
    return [...this.#ports.values()];
  }

  async watchPorts(onChange: (port: WorkspacePort) => void): Promise<() => void> {
    await this.boot();
    this.#portSubscribers.add(onChange);

    for (const port of this.#ports.values()) {
      onChange(port);
    }

    return () => this.#portSubscribers.delete(onChange);
  }

  async getPreviewUrl(port: number): Promise<PreviewRoute> {
    const route = this.#ports.get(port);

    if (!route?.url) {
      throw new RuntimeError(`No preview URL found for port ${port}`, { code: 'PREVIEW_NOT_READY' });
    }

    return { port, url: route.url, ready: route.ready ?? route.type === 'open' };
  }

  async createSnapshot(label?: string): Promise<Snapshot> {
    const session = await this.getWorkspaceStatus();

    const snapshot: Snapshot = {
      id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      workspaceId: session.id,
      createdAt: new Date().toISOString(),
      files: await this.listFiles('.'),
      metadata: label ? { label } : undefined,
    };
    this.#snapshots.set(snapshot.id, snapshot);

    return snapshot;
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.#snapshots.get(snapshotId);

    if (!snapshot) {
      throw new RuntimeError(`Snapshot ${snapshotId} not found`, { code: 'SNAPSHOT_NOT_FOUND' });
    }

    await this.#restoreNodes(snapshot.files);
  }

  async exportZip(path = '.'): Promise<Uint8Array> {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), files: await this.listFiles(path) });
    return new TextEncoder().encode(payload);
  }

  async importZip(data: Uint8Array, targetPath = '.'): Promise<void> {
    if (await this.#tryImportLegacyJsonExport(data, targetPath)) {
      return;
    }

    const zip = await JSZip.loadAsync(data);
    const webcontainer = await this.#getWebContainer();
    const basePath = this.#toRuntimePath(targetPath);

    for (const entry of Object.values(zip.files)) {
      const safePath = normalizeZipEntryPath(entry.name);

      if (!safePath) {
        continue;
      }

      const runtimePath = basePath === '.' ? safePath : joinPath(basePath, safePath);

      if (entry.dir) {
        await webcontainer.fs.mkdir(runtimePath, { recursive: true });
        continue;
      }

      const content = await entry.async('uint8array');
      await this.#ensureParentDirectory(webcontainer, runtimePath);
      await webcontainer.fs.writeFile(runtimePath, content);
    }
  }

  async #getWebContainer(): Promise<WebContainerLike> {
    if (!this.#webcontainer) {
      if (!this.#bootWebContainer) {
        throw new RuntimeError('WebContainer boot function was not provided', { code: 'WEBCONTAINER_BOOT_MISSING' });
      }

      this.#webcontainer = this.#bootWebContainer();
    }

    return this.#webcontainer;
  }

  #setPort(port: WorkspacePort) {
    this.#ports.set(port.port, port);

    for (const subscriber of this.#portSubscribers) {
      subscriber(port);
    }
  }

  #toRuntimePath(path: string) {
    if (!path || path === '/' || path === this.workdir) {
      return '.';
    }

    if (path.startsWith(`${this.workdir}/`)) {
      return path.slice(this.workdir.length + 1) || '.';
    }

    return path.replace(/^\/+/, '') || '.';
  }

  async #spawnTracked(request: CommandRequest): Promise<WebContainerProcessLike> {
    const normalizedRequest = normalizeShellCommandRequest(request);
    const webcontainer = await this.#getWebContainer();
    const id = `process-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const process = await webcontainer.spawn(normalizedRequest.command, normalizedRequest.args ?? [], {
      cwd: normalizedRequest.cwd,
      env: normalizedRequest.env,
      terminal: normalizedRequest.terminal,
    });
    this.#processes.set(id, {
      id,
      command: normalizedRequest.command,
      args: normalizedRequest.args,
      cwd: normalizedRequest.cwd,
      status: 'running',
      startedAt: new Date().toISOString(),
      process,
    });
    process.exit
      .then((exitCode) => {
        const metadata = this.#processes.get(id);

        if (metadata) {
          this.#processes.set(id, { ...metadata, status: 'exited', exitCode });
        }
      })
      .catch(() => {
        // A rejected exit promise (spawn/teardown failure) must not become an unhandled rejection.
        const metadata = this.#processes.get(id);

        if (metadata) {
          this.#processes.set(id, { ...metadata, status: 'killed' });
        }
      });

    return process;
  }

  async *#processEvents(process: WebContainerProcessLike): AsyncIterable<CommandEvent> {
    const reader = process.output.getReader();

    try {
      while (true) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        yield { type: 'stdout', data: chunk.value, timestamp: new Date().toISOString() };
      }

      yield { type: 'exit', exitCode: await process.exit, timestamp: new Date().toISOString() };
    } catch (error) {
      /*
       * reader.read() or process.exit can reject on a spawn/teardown failure.
       * The terminal consumer (app/utils/shell.ts) iterates this generator in a
       * fire-and-forget async IIFE whose try/catch only wraps terminal.write, so
       * a throw here would escape as an unhandled promise rejection. Surface it
       * as an 'error' event instead, mirroring streamCommand.
       */
      yield { type: 'error', error: toRuntimeError(error), timestamp: new Date().toISOString() };
    } finally {
      reader.releaseLock();
    }
  }

  async #listFiles(webcontainer: WebContainerLike, dirPath: string): Promise<FileNode[]> {
    const entries = await webcontainer.fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const path = joinPath(dirPath, name);

      const isDirectory =
        typeof entry === 'string' ? false : entry.type === 'directory' || entry.isDirectory?.() === true;

      const node: FileNode = { path, name, type: isDirectory ? 'directory' : 'file' };

      if (isDirectory) {
        node.children = await this.#listFiles(webcontainer, path);
      } else {
        try {
          /*
           * Read raw bytes, not 'utf-8'. The old code decoded every file as UTF-8
           * (lossily corrupting binary assets) and, on decode failure, set
           * encoding:'binary' with NO content — so restoreSnapshot wrote '' and
           * ZEROED the file (#38). Classify by content and base64-encode binary so
           * it round-trips through snapshot/restore intact.
           */
          const raw = await webcontainer.fs.readFile(path);
          const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;

          if (isUtf8(bytes)) {
            node.content = new TextDecoder().decode(bytes);
            node.encoding = 'utf8';
          } else {
            node.content = toBase64(bytes);
            node.encoding = 'base64';
          }

          node.size = bytes.length;
        } catch {
          // Truly unreadable (vanished/permission) — record as empty text, not binary-with-no-content.
          node.content = '';
          node.encoding = 'utf8';
        }
      }

      nodes.push(node);
    }

    return nodes;
  }

  async #searchByReadingFiles(query: string, options: FileSearchOptions): Promise<FileSearchMatch[]> {
    const matches: FileSearchMatch[] = [];
    const isRegex = options.isRegex === true;
    const needle = options.caseSensitive ? query : query.toLowerCase();
    const resultLimit = typeof options.resultLimit === 'number' ? options.resultLimit : Infinity;

    /*
     * The query is user-supplied. A malformed pattern (e.g. '[' or '(') makes
     * the RegExp constructor throw, which would reject the whole searchFiles()
     * promise. Treat an invalid regex as "no matches" instead of crashing.
     */
    let matcher: RegExp | undefined;

    if (isRegex) {
      try {
        matcher = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
      } catch {
        return [];
      }
    }

    const scanFile = (path: string, content: string) => {
      const lines = content.split('\n');

      for (let index = 0; index < lines.length; index += 1) {
        if (matches.length >= resultLimit) {
          return;
        }

        const line = lines[index];
        const haystack = options.caseSensitive ? line : line.toLowerCase();

        /*
         * matcher is built with the global flag and reused across lines; reset
         * lastIndex so its stateful cursor doesn't skip matches on later lines.
         */
        if (matcher) {
          matcher.lastIndex = 0;
        }

        const match = matcher?.exec(line);
        const column = matcher ? (match?.index ?? -1) : haystack.indexOf(needle);

        if (column >= 0) {
          matches.push({
            path,
            lineNumber: index + 1,
            line,
            startColumn: column,
            endColumn: column + (match?.[0].length ?? query.length),
          });
        }
      }
    };

    const webcontainer = await this.#getWebContainer();

    /*
     * Traverse the tree lazily instead of reading every file (incl. node_modules
     * and binary blobs as base64) into memory up front. Skip noisy/huge dirs and
     * binary files, and stop descending once resultLimit matches are collected —
     * so the fallback bounds both traversal and memory on real projects.
     */
    const walk = async (dirPath: string): Promise<void> => {
      if (matches.length >= resultLimit) {
        return;
      }

      let entries: WebContainerDirentLike[] | string[];

      try {
        entries = await webcontainer.fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= resultLimit) {
          return;
        }

        const name = typeof entry === 'string' ? entry : entry.name;

        if (SEARCH_SKIP_DIRECTORIES.has(name)) {
          continue;
        }

        const path = joinPath(dirPath, name);

        const isDirectory =
          typeof entry === 'string' ? false : entry.type === 'directory' || entry.isDirectory?.() === true;

        if (isDirectory) {
          await walk(path);
          continue;
        }

        try {
          const raw = await webcontainer.fs.readFile(path);
          const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;

          // Skip binary files — base64 content yields meaningless matches and bloats memory.
          if (!isUtf8(bytes)) {
            continue;
          }

          scanFile(path, new TextDecoder().decode(bytes));
        } catch {
          // Unreadable file (vanished/permission) — skip it.
        }
      }
    };

    await walk(this.#toRuntimePath('.'));

    return matches.slice(0, options.resultLimit);
  }

  async #ensureParentDirectory(webcontainer: WebContainerLike, filePath: string): Promise<void> {
    const parent = filePath.split('/').slice(0, -1).join('/');

    if (parent) {
      await webcontainer.fs.mkdir(parent, { recursive: true });
    }
  }

  async #restoreNodes(nodes: FileNode[], basePath = '.'): Promise<void> {
    for (const node of nodes) {
      const targetPath = basePath === '.' ? node.path : joinPath(basePath, node.path);

      if (node.type === 'directory') {
        const webcontainer = await this.#getWebContainer();
        await webcontainer.fs.mkdir(targetPath, { recursive: true });
        await this.#restoreNodes(node.children ?? [], basePath);
      } else if (node.encoding === 'base64' && typeof node.content === 'string') {
        /*
         * Restore binary files from their base64 bytes — writing the base64 string
         * as text (or '') would corrupt/zero the asset.
         */
        const webcontainer = await this.#getWebContainer();
        const runtimePath = this.#toRuntimePath(targetPath);
        await this.#ensureParentDirectory(webcontainer, runtimePath);
        await webcontainer.fs.writeFile(runtimePath, fromBase64(node.content));
      } else {
        await this.writeFile(targetPath, node.content ?? '');
      }
    }
  }

  async #tryImportLegacyJsonExport(data: Uint8Array, targetPath: string): Promise<boolean> {
    let decoded: string;

    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(data).trim();
    } catch {
      return false;
    }

    if (!decoded.startsWith('{')) {
      return false;
    }

    try {
      const payload = JSON.parse(decoded) as { files?: FileNode[] };
      await this.#restoreNodes(payload.files ?? [], targetPath);

      return true;
    } catch {
      return false;
    }
  }

  #mapWatchEvent(type?: string): FileChange['type'] {
    if (type === 'delete' || type === 'remove' || type === 'remove_file' || type === 'remove_dir') {
      return 'delete';
    }

    if (type === 'create' || type === 'add' || type === 'add_file' || type === 'add_dir') {
      return 'create';
    }

    if (type === 'rename') {
      return 'rename';
    }

    return 'update';
  }
}

/*
 * Directories the file-reading search fallback must never descend into: they
 * are huge (node_modules), irrelevant build output (dist/build/coverage), or
 * VCS internals (.git) whose contents would pollute results and exhaust memory.
 */
const SEARCH_SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.cache']);

function joinPath(left: string, right: string) {
  if (left === '.' || left === '') {
    return right;
  }

  return `${left.replace(/\/+$/, '')}/${right.replace(/^\/+/, '')}`;
}

function normalizeZipEntryPath(path: string) {
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.');

  if (parts.some((part) => part === '..')) {
    return null;
  }

  return parts.join('/');
}

function toRuntimeError(error: unknown) {
  if (error instanceof RuntimeError) {
    return error;
  }

  if (error instanceof Error) {
    return new RuntimeError(error.message, { cause: error });
  }

  return new RuntimeError(String(error));
}

function isUtf8(buffer: Uint8Array) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function toBase64(buffer: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }

  let binary = '';

  for (let i = 0; i < buffer.length; i += 1) {
    binary += String.fromCharCode(buffer[i]);
  }

  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
