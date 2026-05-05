import {
  RuntimeError,
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

export interface RemoteKubernetesRuntimeAdapterOptions {
  baseUrl: string;
  authToken?: string | (() => string | undefined | Promise<string | undefined>);
  workspaceId?: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: WebSocketConstructor;
}

export interface WebSocketConstructor {
  new (url: string, protocols?: string | string[]): WebSocketLike;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: any) => void): void;
  removeEventListener?(type: 'open' | 'message' | 'error' | 'close', listener: (event: any) => void): void;
}

export class RemoteKubernetesRuntimeAdapter implements RuntimeAdapter {
  readonly mode = 'remote-kubernetes' as const;
  readonly capabilities: RuntimeCapability[] = [
    'filesystem',
    'file-watch',
    'commands',
    'terminal',
    'ports',
    'preview',
    'snapshots',
    'zip-import-export',
    'logs',
  ];

  readonly workdir: string;
  #baseUrl: string;
  #authToken?: RemoteKubernetesRuntimeAdapterOptions['authToken'];
  #workspaceId?: string;
  #fetch: typeof fetch;
  #WebSocket?: WebSocketConstructor;
  #session?: WorkspaceSession;
  #terminals = new Map<string, WebSocketLike>();
  #terminalStops = new Map<string, () => void>();
  #eventStreams = new Map<string, AsyncQueue<CommandEvent>>();

  constructor(options: RemoteKubernetesRuntimeAdapterOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#authToken = options.authToken;
    this.#workspaceId = options.workspaceId;
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#WebSocket = options.WebSocketImpl ?? (globalThis.WebSocket as WebSocketConstructor | undefined);
    this.workdir = '/workspace';
  }

  async boot(): Promise<void> {
    await this.#request('/runtime/boot', { method: 'POST' });
  }

  async startWorkspace(session: Partial<WorkspaceSession> = {}): Promise<WorkspaceSession> {
    const payload = await this.#request<WorkspaceSession>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: session.id ?? this.#workspaceId, metadata: session.metadata }),
    });
    this.#workspaceId = payload.id;
    this.#session = payload;

    return payload;
  }

  async stopWorkspace(workspaceId = this.#requireWorkspaceId()): Promise<void> {
    await this.#request(`/workspaces/${workspaceId}/stop`, { method: 'POST' });
    this.#session = this.#session
      ? { ...this.#session, status: 'stopped', updatedAt: new Date().toISOString() }
      : undefined;
  }

  async restartWorkspace(workspaceId = this.#requireWorkspaceId()): Promise<WorkspaceSession> {
    const session = await this.#request<WorkspaceSession>(`/workspaces/${workspaceId}/restart`, { method: 'POST' });
    this.#session = session;
    return session;
  }

  async getWorkspaceStatus(workspaceId = this.#requireWorkspaceId()): Promise<WorkspaceSession> {
    const session = await this.#request<WorkspaceSession>(`/workspaces/${workspaceId}/status`);
    this.#session = session;
    return session;
  }

  async listFiles(path = '.'): Promise<FileNode[]> {
    return this.#request<FileNode[]>(
      `/workspaces/${this.#requireWorkspaceId()}/files?path=${encodeURIComponent(path)}`,
    );
  }

  async readFile(path: string): Promise<string> {
    const result = await this.#request<{ content: string }>(
      `/workspaces/${this.#requireWorkspaceId()}/files/read?path=${encodeURIComponent(path)}`,
    );
    return result.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.#request(`/workspaces/${this.#requireWorkspaceId()}/files/write`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    });
  }

  async createFile(path: string, content = ''): Promise<void> {
    await this.#request(`/workspaces/${this.#requireWorkspaceId()}/files`, {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  }

  async createDirectory(path: string): Promise<void> {
    await this.#request(`/workspaces/${this.#requireWorkspaceId()}/directories`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  async deleteFile(path: string): Promise<void> {
    await this.#request(`/workspaces/${this.#requireWorkspaceId()}/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
  }

  async renameFile(path: string, newPath: string): Promise<void> {
    await this.moveFile(path, newPath);
  }

  async moveFile(path: string, newPath: string): Promise<void> {
    await this.#request(`/workspaces/${this.#requireWorkspaceId()}/files/move`, {
      method: 'POST',
      body: JSON.stringify({ path, newPath }),
    });
  }

  async searchFiles(query: string, options: FileSearchOptions = {}): Promise<FileSearchMatch[]> {
    return this.#request<FileSearchMatch[]>(`/workspaces/${this.#requireWorkspaceId()}/files/search`, {
      method: 'POST',
      body: JSON.stringify({ query, options }),
    });
  }

  async watchFiles(paths: string[], onChange: (change: FileChange) => void): Promise<() => void> {
    return this.#watchSocket(`/workspaces/${this.#requireWorkspaceId()}/files/watch`, { paths }, (event) =>
      onChange(JSON.parse(event.data) as FileChange),
    );
  }

  async applyPatch(patch: RuntimePatch): Promise<FileChange[]> {
    return this.#request<FileChange[]>(`/workspaces/${this.#requireWorkspaceId()}/patch`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
  }

  async runCommand(request: CommandRequest): Promise<CommandResult> {
    return this.#request<CommandResult>(`/workspaces/${this.#requireWorkspaceId()}/commands`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async *streamCommand(request: CommandRequest): AsyncIterable<CommandEvent> {
    const socket = await this.#openSocket(`/workspaces/${this.#requireWorkspaceId()}/commands/stream`, request);
    const queue = new AsyncQueue<CommandEvent>();
    socket.addEventListener('message', (event: { data: string }) => queue.push(JSON.parse(event.data)));
    socket.addEventListener('error', () =>
      queue.push({ type: 'error', error: new RuntimeError('Command stream failed'), timestamp: now() }),
    );
    socket.addEventListener('close', () => queue.close());

    for await (const event of queue) {
      yield event;
    }
  }

  async openTerminal(request: Partial<CommandRequest> = {}): Promise<TerminalSession> {
    const terminalId = `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;
    let socket = await this.#openSocket(`/workspaces/${this.#requireWorkspaceId()}/terminal`, {
      terminalId,
      ...request,
    });
    const queue = new AsyncQueue<CommandEvent>();
    const onMessage = (event: { data: string }) => queue.push(JSON.parse(event.data));
    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) {
        return;
      }

      const delay = Math.min(1000 * 2 ** reconnectAttempts, 10_000);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void reconnect();
      }, delay);
    };
    const bindSocket = (nextSocket: WebSocketLike) => {
      nextSocket.addEventListener('message', onMessage);
      nextSocket.addEventListener('error', scheduleReconnect);
      nextSocket.addEventListener('close', scheduleReconnect);
    };
    const reconnect = async () => {
      if (stopped) {
        return;
      }

      try {
        socket = await this.#openSocket(`/workspaces/${this.#requireWorkspaceId()}/terminal`, {
          terminalId,
          ...request,
        });
        reconnectAttempts = 0;
        this.#terminals.set(terminalId, socket);
        bindSocket(socket);
        queue.push({ type: 'stdout', data: '\r\n[terminal reconnected]\r\n', timestamp: now() });
      } catch {
        scheduleReconnect();
      }
    };
    bindSocket(socket);
    this.#terminals.set(terminalId, socket);
    this.#terminalStops.set(terminalId, () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    });
    this.#eventStreams.set(terminalId, queue);

    return {
      id: terminalId,
      processId: terminalId,
      cols: request.terminal?.cols ?? 80,
      rows: request.terminal?.rows ?? 15,
      write: (data) => socket.send(JSON.stringify({ type: 'stdin', data })),
      resize: (cols, rows) => this.resizeTerminal(terminalId, cols, rows),
      kill: () => this.killProcess(terminalId),
      events: queue,
    };
  }

  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    this.#terminals.get(terminalId)?.send(JSON.stringify({ type: 'resize', cols, rows }));
  }

  async killProcess(processId: string): Promise<void> {
    const terminal = this.#terminals.get(processId);

    if (terminal) {
      this.#terminalStops.get(processId)?.();
      this.#terminalStops.delete(processId);
      terminal.send(JSON.stringify({ type: 'kill' }));
      terminal.close();
      this.#terminals.delete(processId);
      this.#eventStreams.get(processId)?.close();
      this.#eventStreams.delete(processId);
      return;
    }

    await this.#request(`/workspaces/${this.#requireWorkspaceId()}/processes/${processId}/kill`, { method: 'POST' });
  }

  async listProcesses(): Promise<WorkspaceProcess[]> {
    return this.#request<WorkspaceProcess[]>(`/workspaces/${this.#requireWorkspaceId()}/processes`);
  }

  async listPorts(): Promise<WorkspacePort[]> {
    return this.#request<WorkspacePort[]>(`/workspaces/${this.#requireWorkspaceId()}/ports`);
  }

  async watchPorts(onChange: (port: WorkspacePort) => void): Promise<() => void> {
    return this.#watchSocket(`/workspaces/${this.#requireWorkspaceId()}/ports/watch`, undefined, (event) =>
      onChange(JSON.parse(event.data) as WorkspacePort),
    );
  }

  async getPreviewUrl(port: number): Promise<PreviewRoute> {
    return this.#request<PreviewRoute>(`/workspaces/${this.#requireWorkspaceId()}/preview/${port}`);
  }

  async createSnapshot(label?: string): Promise<Snapshot> {
    return this.#request<Snapshot>(`/workspaces/${this.#requireWorkspaceId()}/snapshots`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    await this.#request(`/workspaces/${this.#requireWorkspaceId()}/snapshots/${snapshotId}/restore`, {
      method: 'POST',
    });
  }

  async exportZip(path = '.'): Promise<Uint8Array> {
    const response = await this.#rawRequest(
      `/workspaces/${this.#requireWorkspaceId()}/export?path=${encodeURIComponent(path)}`,
    );
    return new Uint8Array(await response.arrayBuffer());
  }

  async importZip(data: Uint8Array, targetPath = '.'): Promise<void> {
    await this.#request(
      `/workspaces/${this.#requireWorkspaceId()}/import?targetPath=${encodeURIComponent(targetPath)}`,
      {
        method: 'POST',
        body: data,
        headers: { 'content-type': 'application/zip' },
      },
    );
  }

  async watchLogs(onEvent: (event: CommandEvent) => void): Promise<() => void> {
    return this.#watchSocket(`/workspaces/${this.#requireWorkspaceId()}/logs`, undefined, (event) =>
      onEvent(JSON.parse(event.data) as CommandEvent),
    );
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.#rawRequest(path, init);

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async #rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);

    if (init.body && !headers.has('content-type') && typeof init.body === 'string') {
      headers.set('content-type', 'application/json');
    }

    const token = await this.#resolveAuthToken();

    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }

    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });

    if (!response.ok) {
      throw new RuntimeError(`Remote runtime request failed: ${response.status}`, {
        code: 'REMOTE_RUNTIME_REQUEST_FAILED',
        status: response.status,
        details: await response.text().catch(() => undefined),
      });
    }

    return response;
  }

  async #openSocket(path: string, hello?: unknown): Promise<WebSocketLike> {
    if (!this.#WebSocket) {
      throw new RuntimeError('WebSocket is not available for remote runtime', { code: 'WEBSOCKET_UNAVAILABLE' });
    }

    const token = await this.#resolveAuthToken();
    const url = new URL(`${this.#baseUrl}${path}`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

    if (token) {
      url.searchParams.set('token', token);
    }

    const socket = new this.#WebSocket(url.toString());

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => {
        if (hello) {
          socket.send(JSON.stringify({ type: 'hello', payload: hello }));
        }

        resolve();
      });
      socket.addEventListener('error', () => reject(new RuntimeError('Remote runtime WebSocket failed to connect')));
    });

    return socket;
  }

  async #watchSocket(path: string, hello: unknown, onMessage: (event: { data: string }) => void): Promise<() => void> {
    let stopped = false;
    let socket: WebSocketLike | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const connect = async () => {
      if (stopped) {
        return;
      }

      try {
        socket = await this.#openSocket(path, hello);
        attempts = 0;
        socket.addEventListener('message', onMessage);
        socket.addEventListener('close', scheduleReconnect);
        socket.addEventListener('error', scheduleReconnect);
      } catch {
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) {
        return;
      }

      const delay = Math.min(1000 * 2 ** attempts, 15_000);
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void connect();
      }, delay);
    };

    await connect();

    return () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      if (socket) {
        socket.removeEventListener?.('message', onMessage);
        socket.removeEventListener?.('close', scheduleReconnect);
        socket.removeEventListener?.('error', scheduleReconnect);
        socket.close();
      }
    };
  }

  async #resolveAuthToken(): Promise<string | undefined> {
    return typeof this.#authToken === 'function' ? this.#authToken() : this.#authToken;
  }

  #requireWorkspaceId(): string {
    if (!this.#workspaceId) {
      throw new RuntimeError('Remote workspace has not been started', { code: 'WORKSPACE_NOT_STARTED' });
    }

    return this.#workspaceId;
  }
}

class AsyncQueue<T> implements AsyncIterable<T> {
  #values: T[] = [];
  #resolvers: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;

  push(value: T) {
    const resolve = this.#resolvers.shift();

    if (resolve) {
      resolve({ value, done: false });
      return;
    }

    this.#values.push(value);
  }

  close() {
    this.#closed = true;

    for (const resolve of this.#resolvers.splice(0)) {
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.#values.shift();

        if (value) {
          return Promise.resolve({ value, done: false });
        }

        if (this.#closed) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise<IteratorResult<T>>((resolve) => this.#resolvers.push(resolve));
      },
    };
  }
}

function now() {
  return new Date().toISOString();
}
