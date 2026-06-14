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
  type WorkspaceStatus,
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
  #socketConnectTimeoutMs = 30_000;
  /*
   * Provisioning a cold workspace (PVC + Pod + image pull + readiness) runs in
   * the manager for up to ~3min. The synchronous api->manager start aborts long
   * before that (proxy + ingress idle caps), so startWorkspace can't rely on a
   * single POST returning RUNNING — it polls status until the manager finishes.
   */
  #startReadinessTimeoutMs = 210_000;
  #startPollIntervalMs = 2_500;

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
    const requestedId = session.id ?? this.#workspaceId;
    let payload: WorkspaceSession | undefined;

    try {
      payload = await this.#request<WorkspaceSession>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: requestedId, metadata: session.metadata }),
      });
    } catch (error) {
      /*
       * Cold start: provisioning a brand-new workspace takes far longer than the
       * synchronous api->manager start (which aborts at the proxy/ingress idle
       * cap), so this POST can surface a transient 502/timeout even though the
       * manager keeps provisioning the pod to completion. Don't treat that as
       * fatal — fall through to polling status until the workspace is RUNNING.
       * Genuine client errors (quota 402, auth 401/403, bad request) are NOT
       * transient and must surface immediately.
       */
      if (!requestedId || !this.#isTransientStartError(error)) {
        throw error;
      }

      this.#workspaceId = requestedId;
    }

    if (payload) {
      this.#workspaceId = payload.id;
      this.#session = payload;

      if (payload.status === 'running') {
        return payload;
      }
    }

    const pollId = this.#workspaceId ?? requestedId;

    if (!pollId) {
      throw new RuntimeError('Cannot wait for workspace readiness without a workspace id', {
        code: 'WORKSPACE_ID_REQUIRED',
      });
    }

    return this.#waitForWorkspaceRunning(pollId);
  }

  #isTransientStartError(error: unknown): boolean {
    if (error instanceof RuntimeError) {
      // A 502/503/504 from the api runtime proxy, or a network/abort error with
      // no HTTP status — the workspace may still be provisioning. 4xx (quota,
      // auth, validation) are deterministic and must not be retried.
      return error.status === undefined || error.status === 502 || error.status === 503 || error.status === 504;
    }

    // Raw fetch network/abort failures (no RuntimeError wrapper) are transient.
    return true;
  }

  async #waitForWorkspaceRunning(workspaceId: string): Promise<WorkspaceSession> {
    const deadline = Date.now() + this.#startReadinessTimeoutMs;
    let lastStatus: WorkspaceStatus | undefined;

    for (;;) {
      let session: WorkspaceSession | undefined;

      try {
        session = await this.getWorkspaceStatus(workspaceId);
      } catch (error) {
        // Status itself can 502 transiently while the pod is coming up; keep
        // polling. A deterministic error (auth, etc.) aborts the wait.
        if (!this.#isTransientStartError(error)) {
          throw error;
        }
      }

      if (session) {
        lastStatus = session.status;

        if (session.status === 'running') {
          return session;
        }

        // 'failed' is what the API actually emits for a failed start (the shared
        // WorkspaceStatus type predates it); treat it as terminal alongside
        // stopped/error so the wait fails fast instead of polling to timeout.
        if (
          session.status === 'stopped' ||
          session.status === 'error' ||
          (session.status as string) === 'failed'
        ) {
          throw new RuntimeError(`Workspace failed to start (status: ${session.status})`, {
            code: 'WORKSPACE_START_FAILED',
            status: 409,
            details: session,
          });
        }
      }

      if (Date.now() >= deadline) {
        throw new RuntimeError(
          `Workspace did not become ready within ${Math.round(this.#startReadinessTimeoutMs / 1000)}s` +
            ` (last status: ${lastStatus ?? 'unknown'})`,
          { code: 'WORKSPACE_START_TIMEOUT', status: 504 },
        );
      }

      await new Promise((resolve) => setTimeout(resolve, this.#startPollIntervalMs));
    }
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
    let sawTerminalEvent = false;
    socket.addEventListener('message', (event: { data: string }) => {
      let parsed: CommandEvent;

      try {
        parsed = JSON.parse(event.data) as CommandEvent;
      } catch {
        // Ignore a malformed frame rather than throwing out of the WS message dispatch
        // (which would otherwise leave the queue open and hang the consumer).
        return;
      }

      queue.push(parsed);

      // The command is done once the agent reports exit/error. Close the queue so the
      // consumer's `for await` terminates even if the agent keeps the socket open.
      if (parsed.type === 'exit' || parsed.type === 'error') {
        sawTerminalEvent = true;
        queue.close();
      }
    });
    socket.addEventListener('error', () => {
      sawTerminalEvent = true;
      queue.push({ type: 'error', error: new RuntimeError('Command stream failed'), timestamp: now() });
      queue.close();
    });
    socket.addEventListener('close', () => {
      /*
       * A close *before* any exit/error event means the command was interrupted
       * (pod restart, LB idle-kill, network drop). Surface it as an error instead
       * of letting the queue end cleanly — otherwise the consumer treats the
       * interrupted command as a success (exit code 0) and, e.g., launches a dev
       * server against a half-finished `npm install`.
       */
      if (!sawTerminalEvent) {
        queue.push({
          type: 'error',
          error: new RuntimeError('Command stream closed before completion'),
          timestamp: now(),
        });
      }

      queue.close();
    });

    // Always tear down the socket — including when the consumer breaks/throws out of the
    // loop early — so we never leak a live WebSocket + listeners per cancelled command.
    try {
      for await (const event of queue) {
        yield event;
      }
    } finally {
      queue.close();

      try {
        socket.close();
      } catch {
        // socket may already be closing/closed
      }
    }
  }

  async openTerminal(request: Partial<CommandRequest> = {}): Promise<TerminalSession> {
    const terminalId = `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cols = request.terminal?.cols ?? 80;
    const rows = request.terminal?.rows ?? 24;

    /*
     * Pass the terminal id as `sessionId` (plus geometry) on the query string. The
     * workspace agent keys its persistent shell on `?sessionId` and repaints scrollback
     * on reattach, so reusing the same id across reconnects keeps a single shell alive
     * instead of spawning a fresh one (and losing the running command) each time.
     */
    const terminalPath = `/workspaces/${this.#requireWorkspaceId()}/terminal?sessionId=${encodeURIComponent(
      terminalId,
    )}&cols=${cols}&rows=${rows}`;

    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;
    let stableTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let socket = await this.#openSocket(terminalPath, {
      terminalId,
      ...request,
    });
    const queue = new AsyncQueue<CommandEvent>();
    const onMessage = (event: { data: string }) => {
      /*
       * The socket only ever carries JSON CommandEvents. Guard against a malformed or
       * non-JSON frame so a single bad message can't throw out of the listener and
       * restart the reconnect loop.
       */
      try {
        queue.push(JSON.parse(event.data));
      } catch {
        // Ignore frames that aren't valid CommandEvent JSON.
      }
    };
    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) {
        return;
      }

      if (stableTimer) {
        clearTimeout(stableTimer);
        stableTimer = undefined;
      }

      const delay = Math.min(1000 * 2 ** reconnectAttempts, 10_000);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void reconnect();
      }, delay);
    };
    const unbindSocket = (prevSocket: WebSocketLike) => {
      prevSocket.removeEventListener?.('message', onMessage);
      prevSocket.removeEventListener?.('error', scheduleReconnect);
      prevSocket.removeEventListener?.('close', scheduleReconnect);
    };
    const startHeartbeat = () => {
      if (heartbeatTimer || stopped) {
        return;
      }

      /*
       * Keep the connection warm so ingress/load-balancer idle timeouts don't silently
       * close an otherwise-healthy terminal (the classic reconnect-flap cause). The
       * agent ignores unrecognised control frames.
       */
      heartbeatTimer = setInterval(() => {
        try {
          socket.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // Send failures surface via the socket's close/error handlers.
        }
      }, 20_000);

      /*
       * Don't let the keepalive interval hold the Node event loop open (no-op in the
       * browser, where the timer handle is a number).
       */
      (heartbeatTimer as unknown as { unref?: () => void }).unref?.();
    };
    const bindSocket = (nextSocket: WebSocketLike) => {
      nextSocket.addEventListener('message', onMessage);
      nextSocket.addEventListener('error', scheduleReconnect);
      nextSocket.addEventListener('close', scheduleReconnect);

      /*
       * Only treat the connection as healthy (and reset the backoff) once it has stayed
       * open for a few seconds. Resetting immediately turns a server that accepts then
       * drops the socket into a tight 1s flap that never backs off.
       */
      if (stableTimer) {
        clearTimeout(stableTimer);
      }

      stableTimer = setTimeout(() => {
        stableTimer = undefined;
        reconnectAttempts = 0;
      }, 5_000);
    };
    const reconnect = async () => {
      if (stopped) {
        return;
      }

      try {
        unbindSocket(socket);
        const opened = await this.#openSocket(terminalPath, {
          terminalId,
          ...request,
        });

        /*
         * The terminal may have been stopped while #openSocket was in flight. The stop
         * handler already ran against the previous socket reference, so binding this one
         * would leak it (and its heartbeat) forever.
         */
        if (stopped) {
          opened.close();
          return;
        }

        socket = opened;
        this.#terminals.set(terminalId, socket);
        bindSocket(socket);
        startHeartbeat();
        queue.push({ type: 'stdout', data: '\r\n[terminal reconnected]\r\n', timestamp: now() });
      } catch {
        scheduleReconnect();
      }
    };
    bindSocket(socket);
    startHeartbeat();
    this.#terminals.set(terminalId, socket);
    this.#terminalStops.set(terminalId, () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      if (stableTimer) {
        clearTimeout(stableTimer);
      }

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }

      // Close the live socket so stopping a terminal frees the connection instead
      // of leaking it until the server or GC tears it down.
      unbindSocket(socket);

      try {
        socket.close?.();
      } catch {
        // Already closing/closed.
      }
    });
    this.#eventStreams.set(terminalId, queue);

    return {
      id: terminalId,
      processId: terminalId,
      cols,
      rows,
      write: (data) => socket.send(JSON.stringify({ type: 'stdin', data })),
      resize: (nextCols, nextRows) => this.resizeTerminal(terminalId, nextCols, nextRows),
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
      // Send the kill frame before the stop handler closes the socket, otherwise the
      // agent never disposes the persistent shell (leaking the PTY) and the send throws
      // on an already-closed socket.
      try {
        terminal.send(JSON.stringify({ type: 'kill' }));
      } catch {
        // Socket may already be closing/closed.
      }

      this.#terminalStops.get(processId)?.();
      this.#terminalStops.delete(processId);
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
    await this.#request(`/workspaces/${this.#requireWorkspaceId()}/snapshots/${encodeURIComponent(snapshotId)}/restore`, {
      method: 'POST',
    });
  }

  /*
   * Whole-workspace zip transfers (seed/restore) move far more data than a normal
   * control request, so they must not inherit the generic 30s #rawRequest cap —
   * any non-trivial project would abort mid-transfer. Allow 5 minutes.
   */
  static readonly #ZIP_TRANSFER_TIMEOUT_MS = 300_000;

  async exportZip(path = '.'): Promise<Uint8Array> {
    const response = await this.#rawRequest(
      `/workspaces/${this.#requireWorkspaceId()}/export?path=${encodeURIComponent(path)}`,
      { signal: AbortSignal.timeout(RemoteKubernetesRuntimeAdapter.#ZIP_TRANSFER_TIMEOUT_MS) },
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
        signal: AbortSignal.timeout(RemoteKubernetesRuntimeAdapter.#ZIP_TRANSFER_TIMEOUT_MS),
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

    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });

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

    /*
     * Resolve against the page origin so a RELATIVE baseUrl (e.g. "/api/runtime")
     * works for the socket the same way it does for #rawRequest's fetch. Without a
     * base, `new URL("/api/runtime/...")` throws "Invalid URL" and silently breaks
     * the remote runtime whenever baseUrl isn't absolute.
     */
    const origin = typeof globalThis !== 'undefined' ? (globalThis as { location?: { origin?: string } }).location?.origin : undefined;
    const url = new URL(`${this.#baseUrl}${path}`, origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

    if (token) {
      url.searchParams.set('token', token);
    }

    const socket = new this.#WebSocket(url.toString());

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const onOpen = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        if (hello) {
          socket.send(JSON.stringify({ type: 'hello', payload: hello }));
        }

        resolve();
      };

      const onError = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        // Close the half-open socket so a failed connect doesn't leak it (reconnect
        // backoff loops would otherwise accumulate dead sockets + listeners).
        try {
          socket.close();
        } catch {
          // already closing/closed
        }

        reject(new RuntimeError('Remote runtime WebSocket failed to connect'));
      };

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
        }

        socket.removeEventListener?.('open', onOpen);
        socket.removeEventListener?.('error', onError);
      };

      // Guard against a socket that connects at the TCP/TLS layer but never receives the
      // upgrade/open event (hung LB) — without this the awaiting caller hangs forever.
      timer = setTimeout(onError, this.#socketConnectTimeoutMs);

      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onError);
    });

    return socket;
  }

  async #watchSocket(path: string, hello: unknown, onMessage: (event: { data: string }) => void): Promise<() => void> {
    let stopped = false;
    let socket: WebSocketLike | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    // The per-caller onMessage callbacks JSON.parse the frame inline; a single malformed
    // frame (or a throwing consumer callback) would otherwise throw out of the WS message
    // dispatch and silently kill the watch without triggering reconnect. Swallow it.
    const safeOnMessage = (event: { data: string }) => {
      try {
        onMessage(event);
      } catch {
        // ignore malformed frame / callback error; keep the stream alive
      }
    };

    const connect = async () => {
      if (stopped) {
        return;
      }

      try {
        const opened = await this.#openSocket(path, hello);

        /*
         * The watch may have been stopped while #openSocket was in flight. If we
         * attach listeners now they will never be torn down (the stop handler
         * already ran against the previous socket reference), leaking the socket
         * and continuing to deliver messages after the caller stopped watching.
         */
        if (stopped) {
          opened.close();
          return;
        }

        /*
         * Detach the previous socket's listeners before swapping it out. Otherwise the
         * stale socket leaks its listeners and a later error/close it emits (a WS often
         * fires error THEN close) would re-trigger scheduleReconnect, tearing down the
         * freshly-established healthy socket and churning the reconnect loop.
         */
        if (socket) {
          socket.removeEventListener?.('message', safeOnMessage);
          socket.removeEventListener?.('close', scheduleReconnect);
          socket.removeEventListener?.('error', scheduleReconnect);
        }

        socket = opened;
        attempts = 0;
        socket.addEventListener('message', safeOnMessage);
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
        socket.removeEventListener?.('message', safeOnMessage);
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
        // Check length, not truthiness: a falsy-but-valid payload (0, '', false, null)
        // must still be delivered, not silently dropped and the iterator desynchronized.
        if (this.#values.length > 0) {
          return Promise.resolve({ value: this.#values.shift() as T, done: false });
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
