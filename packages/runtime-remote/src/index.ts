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

  /*
   * Invalidate the cached runtime auth token so the next authToken() call forces
   * a network re-fetch. Called when the backend rejects the token with a 401
   * (session revoked, signing-key rotation, logout-all on another device, pod
   * restart) BEFORE the provider's own client-side expiry clock elapses. Without
   * it the adapter would keep replaying the same dead token on every preview /
   * file / command / status call, so the whole workspace 401s forever and looks
   * crashed even though the user is still logged in. Optional — a static-string
   * token has no way to refresh, so this is a no-op there.
   */
  invalidateAuthToken?: () => void | Promise<void>;
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
  #invalidateAuthToken?: RemoteKubernetesRuntimeAdapterOptions['invalidateAuthToken'];
  #workspaceId?: string;
  #fetch: typeof fetch;
  #WebSocket?: WebSocketConstructor;
  #session?: WorkspaceSession;
  #terminals = new Map<string, WebSocketLike>();
  #terminalStops = new Map<string, () => void>();
  #eventStreams = new Map<string, AsyncQueue<CommandEvent>>();
  #socketConnectTimeoutMs = 30_000;

  /*
   * Deduped in-flight re-provision. When a workspace pod has been garbage-collected
   * (or a stale ws-id is reopened), every agent request 502s with
   * WORKSPACE_AGENT_REQUEST_FAILED (ENOTFOUND). Rather than hammer /files forever,
   * the first such failure triggers a single startWorkspace() that re-creates the
   * pod (PVC reattaches); all concurrent failures await THIS promise, then retry
   * once. Cleared when it settles so a later GC can heal again.
   */
  #reprovisionPromise: Promise<WorkspaceSession> | null = null;

  /*
   * Provisioning a cold workspace (PVC + Pod + image pull + readiness) runs in
   * the manager for up to ~3min. The synchronous api->manager start aborts long
   * before that (proxy + ingress idle caps), so startWorkspace can't rely on a
   * single POST returning RUNNING — it polls status until the manager finishes.
   */
  /*
   * 300s: must outlast the manager's worst-case provision so the client does not
   * time out (and terminal-throw) while a workspace is still legitimately coming up.
   * The manager can spend up to its readiness budget (240s) waiting for the gvisor
   * autoscaler to place the pod, plus the agent-reachable gate (~45s) — ~285s total.
   * A shorter client deadline would surface a false WORKSPACE_START_TIMEOUT during a
   * genuine node scale-up.
   */
  #startReadinessTimeoutMs = 300_000;
  #startPollIntervalMs = 2_500;

  constructor(options: RemoteKubernetesRuntimeAdapterOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#authToken = options.authToken;
    this.#invalidateAuthToken = options.invalidateAuthToken;
    this.#workspaceId = options.workspaceId;
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#WebSocket = options.WebSocketImpl ?? (globalThis.WebSocket as WebSocketConstructor | undefined);

    /*
     * LOGICAL workdir = the app's canonical project root (WORK_DIR = '/home/project'),
     * matching the WebContainer adapter and the FilesStore/EditorStore key space.
     * It is NOT the agent's physical disk root: the workspace-agent stores files
     * under WORKSPACE_ROOT (/workspace) and resolves every path it receives RELATIVE
     * to that root. Callers strip THIS workdir off absolute app paths (FilesStore
     * keys, snapshot-restore keys — all '/home/project/...') to get the relative
     * path the agent expects. When this was '/workspace', those '/home/project/...'
     * paths failed the strip and were sent as 'home/project/...', so the agent
     * materialised files under '/workspace/home/project/...' while the install/dev
     * command ran in '/workspace' → `ENOENT: /workspace/package.json` on reopen.
     * Generation was unaffected (it emits relative paths), which is why only
     * reopened/snapshot-restored projects broke.
     */
    this.workdir = '/home/project';
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
        /*
         * The manager returned a pod that was ALREADY running — a warm/reused
         * workspace (reopen of a not-yet-reaped pod), not a cold provision. Mark
         * it so the IDE can reattach to the live app instead of wiping+reseeding.
         */
        return { ...payload, reused: true };
      }
    }

    const pollId = this.#workspaceId ?? requestedId;

    if (!pollId) {
      throw new RuntimeError('Cannot wait for workspace readiness without a workspace id', {
        code: 'WORKSPACE_ID_REQUIRED',
      });
    }

    /*
     * We had to poll a not-yet-running workspace to readiness: this is a cold
     * (freshly provisioned / STARTING) pod, not a warm reuse. Mark reused:false
     * so the IDE cold-seeds it rather than reattaching to a possibly-empty tree.
     */
    return { ...(await this.#waitForWorkspaceRunning(pollId)), reused: false };
  }

  #isTransientStartError(error: unknown): boolean {
    if (error instanceof RuntimeError) {
      /*
       * A 502/503/504 from the api runtime proxy, or a network/abort error with
       * no HTTP status — the workspace may still be provisioning. 4xx (quota,
       * auth, validation) are deterministic and must not be retried.
       */
      return error.status === undefined || error.status === 502 || error.status === 503 || error.status === 504;
    }

    // Raw fetch network/abort failures (no RuntimeError wrapper) are transient.
    return true;
  }

  /*
   * A runtime op (file write during reseed, status/ports poll) can fire the instant
   * before `POST /workspaces` has created the workspace record. authorizeRuntimeWorkspace
   * then can't resolve the `ws-…` id and answers 404 PROJECT_NOT_FOUND / WORKSPACE_NOT_FOUND
   * (or 425 Too Early) — surfaced to the caller as a hard "Remote runtime request failed:
   * 404" because 404 is not in the transient set. That is a provisioning RACE, not a real
   * missing resource, so let idempotent ops retry it briefly; by the next attempt the record
   * exists. A genuinely deleted project keeps returning it and fails after the bounded
   * retries, exactly as before (just a ~1s later, storm-free).
   */
  #isRetryableProvisioningError(error: unknown): boolean {
    if (!(error instanceof RuntimeError)) {
      return false;
    }

    if (error.status === 425) {
      return true;
    }

    return error.status === 404 && (error.code === 'WORKSPACE_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND');
  }

  async #waitForWorkspaceRunning(workspaceId: string): Promise<WorkspaceSession> {
    const deadline = Date.now() + this.#startReadinessTimeoutMs;

    let lastStatus: WorkspaceStatus | undefined;

    for (;;) {
      let session: WorkspaceSession | undefined;

      try {
        session = await this.getWorkspaceStatus(workspaceId);
      } catch (error) {
        /*
         * Status itself can 502 transiently while the pod is coming up; keep
         * polling. A deterministic error (auth, etc.) aborts the wait.
         */
        if (!this.#isTransientStartError(error)) {
          throw error;
        }
      }

      if (session) {
        lastStatus = session.status;

        if (session.status === 'running') {
          return session;
        }

        /*
         * 'failed' is what the API actually emits for a failed start (the shared
         * WorkspaceStatus type predates it); treat it as terminal alongside
         * stopped/error so the wait fails fast instead of polling to timeout.
         */
        if (session.status === 'stopped' || session.status === 'error' || (session.status as string) === 'failed') {
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
    try {
      const session = await this.#request<WorkspaceSession>(`/workspaces/${workspaceId}/restart`, {
        method: 'POST',
      });
      this.#session = session;

      return session;
    } catch (error) {
      /*
       * "Restart" only has a pod to restart when one EXISTS. After the inactivity
       * GC reaped the pod (stale ws-id), the restart 502s (agent unreachable) or
       * 404s (nothing to restart) — which is why the button appeared to do nothing.
       * Fall back to a full provision that RE-CREATES the pod (the PVC reattaches,
       * so files + node_modules survive) and waits for RUNNING. Deterministic 4xx
       * (auth 401/403, quota 402, validation 400/409) are real and must surface.
       */
      const status = error instanceof RuntimeError ? error.status : undefined;

      const deterministicClientError = typeof status === 'number' && status >= 400 && status < 500 && status !== 404;

      if (deterministicClientError) {
        throw error;
      }

      const session = await this.startWorkspace({ id: workspaceId });
      this.#session = session;

      return session;
    }
  }

  /*
   * Keepalive: bump the workspace's lastActiveAt so the inactivity GC doesn't
   * reap an open-but-idle session. Routed through #request so it uses the remote
   * runtime base URL (api.e-code.ai) and bearer auth — a relative fetch would hit
   * the web origin and 404. Fire-and-forget: swallow errors so a transient hiccup
   * or an already-reclaimed workspace never surfaces to the caller.
   */
  async touch(workspaceId = this.#requireWorkspaceId()): Promise<void> {
    await this.#request(`/workspaces/${workspaceId}/touch`, { method: 'POST' }).catch(() => undefined);
  }

  async getWorkspaceStatus(workspaceId = this.#requireWorkspaceId()): Promise<WorkspaceSession> {
    const session = await this.#request<WorkspaceSession>(`/workspaces/${workspaceId}/status`);
    this.#session = session;

    return session;
  }

  async listFiles(path = '.'): Promise<FileNode[]> {
    return this.#request<FileNode[]>(
      `/workspaces/${this.#requireWorkspaceId()}/files?path=${encodeURIComponent(path)}`,
      {},
      { retryReads: true },
    );
  }

  async readFile(path: string): Promise<{ content: string; encoding?: 'utf8' | 'base64' }> {
    const result = await this.#request<{ content: string; encoding?: 'utf8' | 'base64' }>(
      `/workspaces/${this.#requireWorkspaceId()}/files/read?path=${encodeURIComponent(path)}`,
      {},
      { retryReads: true },
    );

    return { content: result.content, encoding: result.encoding };
  }

  /*
   * BUG-AGENT-001 — dernier contenu écrit par chemin, pour ne PUT que sur un
   * changement réel.
   *
   * Le mémo vit sur l'ADAPTATEUR, pas sur l'ActionRunner. Une première version
   * placée dans le runner n'a rien changé en réel (144 écritures avant, 144
   * après, `tsconfig.json` 28× pour une seule taille) : les écritures
   * redondantes ne partagent pas le même runner. L'adaptateur est le seul point
   * de passage obligé de TOUTES les écritures — action-runner, agent-file-write,
   * files store, reconcile d'entrée — donc le seul endroit où la garde attrape
   * le cas réel.
   */
  #lastWrittenContent = new Map<string, string>();

  async writeFile(path: string, content: string): Promise<void> {
    /*
     * Sauter une écriture qui produirait, octet pour octet, ce que l'on a déjà
     * écrit à ce chemin. On compare au DERNIER contenu, pas à l'ensemble des
     * contenus déjà vus : avec un ensemble, la séquence A → B → A sauterait la
     * troisième écriture et laisserait B sur le disque — une perte de fichier.
     */
    if (this.#lastWrittenContent.get(path) === content) {
      return;
    }

    /*
     * Overwrite is idempotent — retry through a transient api/agent 5xx so a pod
     * rollout/restart mid-generation never silently drops a generated file.
     */
    await this.#request(
      `/workspaces/${this.#requireWorkspaceId()}/files/write`,
      { method: 'PUT', body: JSON.stringify({ path, content }) },
      { retryIdempotentWrite: true },
    );

    // Après succès seulement : un échec doit laisser le chemin réécrivable.
    this.#lastWrittenContent.set(path, content);
  }

  /**
   * Oublier ce que l'on croit savoir du disque. Une commande shell, un checkout
   * git ou une restauration peuvent modifier les fichiers hors de notre vue :
   * garder le mémo ferait sauter une réécriture pourtant nécessaire.
   */
  #forgetWrittenContent(): void {
    this.#lastWrittenContent.clear();
  }

  async createFile(path: string, content = ''): Promise<void> {
    await this.#request(
      `/workspaces/${this.#requireWorkspaceId()}/files`,
      { method: 'POST', body: JSON.stringify({ path, content }) },
      { retryIdempotentWrite: true },
    );
  }

  async createDirectory(path: string): Promise<void> {
    await this.#request(
      `/workspaces/${this.#requireWorkspaceId()}/directories`,
      { method: 'POST', body: JSON.stringify({ path }) },
      { retryIdempotentWrite: true },
    );
  }

  async deleteFile(path: string): Promise<void> {
    await this.#request(
      `/workspaces/${this.#requireWorkspaceId()}/files?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' },
      { retryIdempotentWrite: true },
    );
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
    // Une commande peut réécrire n'importe quel fichier : le mémo n'est plus fiable.
    this.#forgetWrittenContent();

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
        /*
         * Ignore a malformed frame rather than throwing out of the WS message dispatch
         * (which would otherwise leave the queue open and hang the consumer).
         */
        return;
      }

      queue.push(parsed);

      /*
       * The command is done once the agent reports exit/error. Close the queue so the
       * consumer's `for await` terminates even if the agent keeps the socket open.
       */
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

    /*
     * Always tear down the socket — including when the consumer breaks/throws out of the
     * loop early — so we never leak a live WebSocket + listeners per cancelled command.
     */
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
    /*
     * A caller-supplied `sessionKey` makes the id DETERMINISTIC, which is what
     * makes reattach possible: the agent keys its shell on `?sessionId`, so the
     * same pane must present the same id on every reconnect and remount. The
     * random fallback stays for callers that have no stable pane identity —
     * it works, but it can never reattach.
     */
    const terminalId = request.sessionKey
      ? `terminal-${request.sessionKey}`
      : `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
    )}&cols=${cols}&rows=${rows}${request.managed ? '&managed=1' : ''}`;

    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;
    let stableTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let halted = false;

    /*
     * True once the terminal has delivered a real frame — gates the
     * "[terminal reconnected]" notice so cold-start retries don't spam it.
     */
    let everWorked = false;

    /*
     * Consecutive WORKSPACE_NOT_STARTED responses; a COLD-STARTING workspace may
     * emit a few before its agent is ready, so retry this many times before giving up.
     */
    let notStartedCount = 0;

    const MAX_NOT_STARTED_RETRIES = 6;

    // Bound the reconnect so a workspace that stays unreachable can't flap forever.
    const MAX_RECONNECT_ATTEMPTS = 8;

    let socket = await this.#openSocket(terminalPath, {
      terminalId,
      ...request,
    });

    const queue = new AsyncQueue<CommandEvent>();

    /*
     * Permanently stop the reconnect lifecycle (distinct from `stopped`, the user
     * closing the terminal): clear all timers and surface a final message. Used
     * when the API reports the workspace isn't started, or after the bounded
     * reconnect budget is exhausted — so we never flap "[terminal reconnected]"
     * endlessly against a dead/not-started agent.
     */
    const haltReconnect = (message: string) => {
      if (halted) {
        return;
      }

      halted = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }

      if (stableTimer) {
        clearTimeout(stableTimer);
        stableTimer = undefined;
      }

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }

      queue.push({ type: 'stdout', data: message, timestamp: now() });
    };

    const onMessage = (event: { data: string }) => {
      /*
       * The socket only ever carries JSON CommandEvents. Guard against a malformed or
       * non-JSON frame so a single bad message can't throw out of the listener and
       * restart the reconnect loop.
       */
      let parsed: CommandEvent;

      try {
        parsed = JSON.parse(event.data) as CommandEvent;
      } catch {
        // Ignore frames that aren't valid CommandEvent JSON.
        return;
      }

      /*
       * The API emits this when its upstream to the agent didn't open — the runtime
       * isn't started. The workspace may be COLD-STARTING (agent not ready for a few
       * seconds) or genuinely STOPPED, so retry a bounded number of times (the socket
       * close drives the retry) before halting with a clear "click Run" message —
       * without the "[terminal reconnected]" spam (gated on everWorked in reconnect()).
       */
      if (
        (parsed as { type?: string }).type === 'error' &&
        (parsed as { error?: { code?: string } }).error?.code === 'WORKSPACE_NOT_STARTED'
      ) {
        notStartedCount += 1;

        if (notStartedCount >= MAX_NOT_STARTED_RETRIES) {
          haltReconnect('\r\n\x1b[33m[workspace not running — click Run to start it]\x1b[0m\r\n');
        }

        return;
      }

      // A real frame means the terminal is live — reset the not-started budget.
      everWorked = true;
      notStartedCount = 0;
      queue.push(parsed);
    };
    const scheduleReconnect = () => {
      if (stopped || halted || reconnectTimer) {
        return;
      }

      /*
       * Bound the reconnect: a workspace that stays unreachable (crashed/stopped
       * mid-session, network gone) must not flap forever. The stableTimer resets
       * reconnectAttempts once a connection holds for ~5s, so an occasional drop on
       * a healthy terminal never trips this — only a sustained failure does.
       */
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        haltReconnect('\r\n\x1b[33m[terminal disconnected — reload or click Run to reconnect]\x1b[0m\r\n');
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
      if (stopped || halted) {
        return;
      }

      try {
        unbindSocket(socket);

        const opened = await this.#openSocket(terminalPath, {
          terminalId,
          ...request,
        });

        /*
         * The terminal may have been stopped/halted while #openSocket was in flight.
         * The stop handler already ran against the previous socket reference, so
         * binding this one would leak it (and its heartbeat) forever.
         */
        if (stopped || halted) {
          opened.close();
          return;
        }

        socket = opened;
        this.#terminals.set(terminalId, socket);
        bindSocket(socket);
        startHeartbeat();

        /*
         * Only announce a reconnect once the terminal has actually worked — so a
         * cold-starting workspace's retries (which open the client↔API socket but
         * then get WORKSPACE_NOT_STARTED) don't spam "[terminal reconnected]".
         */
        if (everWorked) {
          queue.push({ type: 'stdout', data: '\r\n[terminal reconnected]\r\n', timestamp: now() });
        }
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

      /*
       * Close the live socket so stopping a terminal frees the connection instead
       * of leaking it until the server or GC tears it down.
       */
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
      write: (data) => {
        /*
         * Guard like the heartbeat / killProcess sends: the socket may be in
         * CLOSING/CLOSED during the auto-reconnect flap (LB idle-kill), and a
         * keystroke arriving in that window would otherwise throw synchronously
         * into the xterm onData handler. reconnect() re-establishes the socket.
         */
        try {
          socket.send(JSON.stringify({ type: 'stdin', data }));
        } catch {
          // socket not open; dropped input is acceptable across a reconnect.
        }
      },
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
      /*
       * Send the kill frame before the stop handler closes the socket, otherwise the
       * agent never disposes the persistent shell (leaking the PTY) and the send throws
       * on an already-closed socket.
       */
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
    await this.#request(
      `/workspaces/${this.#requireWorkspaceId()}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
      {
        method: 'POST',
      },
    );
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

  /** True when the api reports the workspace agent unreachable — the pod is gone (GC'd) or never came up. */
  #isAgentUnavailable(error: unknown): boolean {
    return (error as { code?: string } | undefined)?.code === 'WORKSPACE_AGENT_REQUEST_FAILED';
  }

  /**
   * Re-provision the current workspace's pod ONCE, sharing a single in-flight POST
   * /workspaces across all concurrent callers (a burst of agent 502s must not fire
   * dozens of provisions). Resolves when the pod is RUNNING again.
   */
  async #ensureWorkspaceReprovisioned(): Promise<void> {
    if (!this.#workspaceId) {
      return;
    }

    if (!this.#reprovisionPromise) {
      this.#reprovisionPromise = this.startWorkspace({ id: this.#workspaceId }).finally(() => {
        this.#reprovisionPromise = null;
      });
    }

    await this.#reprovisionPromise;
  }

  async #request<T>(
    path: string,
    init: RequestInit = {},
    options: { retryReads?: boolean; retryIdempotentWrite?: boolean; ensureWorkspace?: boolean } = {},
  ): Promise<T> {
    /*
     * Self-healing re-provision. A stale ws-id (its pod GC'd / reaped after the
     * inactivity window) makes every agent call 502 with
     * WORKSPACE_AGENT_REQUEST_FAILED (ENOTFOUND) — previously an endless loop that
     * never re-created the pod, so the reopened project sat on "No backend
     * workspace" forever. Now: on that error, for an agent sub-route
     * (/workspaces/<id>/…, never the provision POST itself), re-provision the pod
     * once (deduped) and retry the request. The provision reattaches the same PVC,
     * so files + node_modules survive. Opt out with ensureWorkspace:false.
     */
    /*
     * Only AGENT I/O sub-routes self-heal. Exclude the workspace LIFECYCLE routes
     * (status/restart/stop/touch) — startWorkspace() itself polls /status while
     * re-provisioning, so letting those reprovision would await the very promise
     * that is running them (deadlock).
     */
    const isAgentSubRoute =
      /^\/workspaces\/[^/]+\/.+/.test(path) && !/\/workspaces\/[^/]+\/(status|restart|stop|touch)(\?|$)/.test(path);

    const canReprovision = options.ensureWorkspace !== false && isAgentSubRoute;

    try {
      return await this.#requestOnce<T>(path, init, options);
    } catch (error) {
      if (canReprovision && !init.signal?.aborted && this.#isAgentUnavailable(error)) {
        await this.#ensureWorkspaceReprovisioned();

        return await this.#requestOnce<T>(path, init, options);
      }

      throw error;
    }
  }

  async #requestOnce<T>(
    path: string,
    init: RequestInit = {},
    options: { retryReads?: boolean; retryIdempotentWrite?: boolean } = {},
  ): Promise<T> {
    /*
     * Idempotent reads (file/dir reads) AND idempotent writes (file overwrite,
     * mkdir, delete) opt into a short retry so a transient api/agent 5xx — a pod
     * momentarily unreachable while it is cold-starting, liveness-killed under CPU
     * contention, or rolling during a deploy — doesn't surface as a hard failure.
     *
     * A file WRITE is safe to retry: re-writing the same path+content is a no-op, so
     * the old "a 502 may mean the write already applied" concern costs nothing on the
     * retry. This is what stops a transient api blip from SILENTLY DROPPING generated
     * files: without it, one 5xx on a files/write POST (e.g. hitting an api pod that
     * is draining/starting during a rollout) is thrown once and the file is lost even
     * though the agent reported "done". Non-idempotent mutations (move/rename) and
     * non-transient errors (4xx) still fail fast.
     */
    const maxAttempts = options.retryReads || options.retryIdempotentWrite ? 4 : 1;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.#rawRequest(path, init);

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error;

        if (
          init.signal?.aborted ||
          attempt >= maxAttempts ||
          !(this.#isTransientStartError(error) || this.#isRetryableProvisioningError(error))
        ) {
          throw error;
        }

        /*
         * Exponential-ish backoff (~250/500/750ms) to ride a brief restart window
         * (or the window before POST /workspaces has created the workspace record).
         */
        await new Promise<void>((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }

    throw lastError;
  }

  async #rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
    /*
     * On a 401 the cached runtime token has been rejected by the backend (session
     * revoked / signing-key rotation / pod restart) before the provider's own
     * expiry clock elapsed. Invalidate it so authToken() re-fetches a fresh one,
     * then retry the request ONCE. Without this self-heal the adapter replays the
     * same dead token forever and the whole workspace (preview/files/terminal)
     * 401s with no recovery. Only retry when an invalidate hook is wired (a static
     * token has nothing to refresh) and never on a caller-aborted request.
     */
    const canRefresh = typeof this.#invalidateAuthToken === 'function';

    for (let attempt = 0; ; attempt += 1) {
      const response = await this.#sendRawRequest(path, init);

      if (response.ok) {
        return response;
      }

      if (shouldRefreshAuthToken(response.status, attempt, canRefresh) && !init.signal?.aborted) {
        await this.#invalidateAuthToken!();
        continue;
      }

      /*
       * Preserve the api's own error `code` from the JSON body (e.g.
       * WORKSPACE_AGENT_REQUEST_FAILED, WORKSPACE_NOT_STARTED) instead of flattening
       * every failure to a generic code. Downstream self-heal decisions depend on it:
       * the adapter re-provisions a GC'd pod on WORKSPACE_AGENT_REQUEST_FAILED, and
       * app/lib/runtime/retry.ts treats those codes as transient. Falls back to the
       * generic code for a non-JSON/opaque body.
       */
      const bodyText = await response.text().catch(() => undefined);

      let apiCode: string | undefined;

      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText) as { code?: unknown };

          if (typeof parsed.code === 'string' && parsed.code.length > 0) {
            apiCode = parsed.code;
          }
        } catch {
          // non-JSON body — keep the generic code.
        }
      }

      throw new RuntimeError(`Remote runtime request failed: ${response.status}`, {
        code: apiCode ?? 'REMOTE_RUNTIME_REQUEST_FAILED',
        status: response.status,
        details: bodyText,
      });
    }
  }

  async #sendRawRequest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);

    if (init.body && !headers.has('content-type') && typeof init.body === 'string') {
      headers.set('content-type', 'application/json');
    }

    const token = await this.#resolveAuthToken();

    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }

    return this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  }

  async #openSocket(path: string, hello?: unknown): Promise<WebSocketLike> {
    if (!this.#WebSocket) {
      throw new RuntimeError('WebSocket is not available for remote runtime', { code: 'WEBSOCKET_UNAVAILABLE' });
    }

    /*
     * Mirror #rawRequest's token self-heal for the socket transport: if the server
     * rejects the upgrade because the token is dead (it surfaces as a close with an
     * auth code — 4401 by convention, or 1008 policy-violation), invalidate the
     * cached token and retry the connect ONCE with a fresh one. Otherwise a revoked
     * token would strand the terminal / file-watch / port-watch sockets forever.
     */
    const canRefresh = typeof this.#invalidateAuthToken === 'function';

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.#connectSocket(path, hello);
      } catch (error) {
        const closeCode =
          error instanceof RuntimeError ? (error.details as { closeCode?: number })?.closeCode : undefined;

        if (isAuthSocketClose(closeCode) && shouldRefreshAuthToken(401, attempt, canRefresh)) {
          await this.#invalidateAuthToken!();
          continue;
        }

        throw error;
      }
    }
  }

  async #connectSocket(path: string, hello?: unknown): Promise<WebSocketLike> {
    const WebSocketImpl = this.#WebSocket;

    if (!WebSocketImpl) {
      throw new RuntimeError('WebSocket is not available for remote runtime', { code: 'WEBSOCKET_UNAVAILABLE' });
    }

    const token = await this.#resolveAuthToken();

    /*
     * Resolve against the page origin so a RELATIVE baseUrl (e.g. "/api/runtime")
     * works for the socket the same way it does for #rawRequest's fetch. Without a
     * base, `new URL("/api/runtime/...")` throws "Invalid URL" and silently breaks
     * the remote runtime whenever baseUrl isn't absolute.
     */
    const origin =
      typeof globalThis !== 'undefined'
        ? (globalThis as { location?: { origin?: string } }).location?.origin
        : undefined;

    const url = new URL(`${this.#baseUrl}${path}`, origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

    if (token) {
      url.searchParams.set('token', token);
    }

    const socket = new WebSocketImpl(url.toString());

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

      const failConnect = (closeCode?: number) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        /*
         * Close the half-open socket so a failed connect doesn't leak it (reconnect
         * backoff loops would otherwise accumulate dead sockets + listeners).
         */
        try {
          socket.close();
        } catch {
          // already closing/closed
        }

        /*
         * Carry the close code so #openSocket can tell an auth rejection (4401 /
         * 1008) apart from an ordinary transport failure and self-heal the token.
         */
        reject(
          new RuntimeError('Remote runtime WebSocket failed to connect', {
            code: 'REMOTE_RUNTIME_SOCKET_FAILED',
            details: closeCode === undefined ? undefined : { closeCode },
          }),
        );
      };

      const onError = () => failConnect();
      const onClose = (event: { code?: number }) => failConnect(event?.code);

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
        }

        socket.removeEventListener?.('open', onOpen);
        socket.removeEventListener?.('error', onError);
        socket.removeEventListener?.('close', onClose);
      };

      /*
       * Guard against a socket that connects at the TCP/TLS layer but never receives the
       * upgrade/open event (hung LB) — without this the awaiting caller hangs forever.
       */
      timer = setTimeout(onError, this.#socketConnectTimeoutMs);

      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onError);
      socket.addEventListener('close', onClose);
    });

    return socket;
  }

  async #watchSocket(
    path: string,
    hello: unknown,
    onMessage: (event: { data: string }) => void,
    options: { maxReconnects?: number; onGiveUp?: () => void } = {},
  ): Promise<() => void> {
    let stopped = false;
    let socket: WebSocketLike | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let stableTimer: ReturnType<typeof setTimeout> | undefined;
    let gaveUp = false;

    /*
     * Bound the reconnect. Unlike the terminal (MAX_RECONNECT_ATTEMPTS) and the
     * FilesStore watch retry, this loop previously reconnected FOREVER: an
     * auth-rejected socket (expired/revoked session — /api/runtime-token 401s, so
     * every reconnect opens with no token and closes 4401) or a permanently-gone
     * workspace would flap every ≤15s for the whole page lifetime. That is the
     * mechanical source of the thousands of "WebSocket CLOSING/CLOSED" errors on
     * files/watch + ports/watch. The stability timer resets `attempts` after the
     * socket holds for STABLE_CONNECTION_MS, so a healthy socket that drops
     * occasionally NEVER accumulates toward this cap — only a socket that never
     * stabilises does. On give-up we stop and notify the caller so it can surface
     * a "reload to reconnect" state instead of silently going stale.
     */
    const maxReconnects = options.maxReconnects ?? 15;

    /*
     * Reset the reconnect backoff only after the socket has STAYED open this long,
     * not the instant it opens. The server accepts the WS upgrade and only THEN
     * runs auth (authorizeRuntimeWorkspace) / reaches the (possibly GC'd) workspace
     * agent, so a rejected or dead-workspace socket opens and closes within a few
     * hundred ms. Resetting `attempts` on open made every such close reconnect
     * after ~1s forever — the WebSocket CLOSING/CLOSED flood seen in prod. Gating
     * the reset on stability lets the exponential backoff grow for a flapping
     * socket while still snapping back to fast reconnects for a healthy one.
     */
    const STABLE_CONNECTION_MS = 5_000;

    /*
     * The per-caller onMessage callbacks JSON.parse the frame inline; a single malformed
     * frame (or a throwing consumer callback) would otherwise throw out of the WS message
     * dispatch and silently kill the watch without triggering reconnect. Swallow it.
     */
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
        socket.addEventListener('message', safeOnMessage);
        socket.addEventListener('close', scheduleReconnect);
        socket.addEventListener('error', scheduleReconnect);

        // Only clear the backoff once the socket proves stable (see STABLE_CONNECTION_MS).
        if (stableTimer) {
          clearTimeout(stableTimer);
        }

        stableTimer = setTimeout(() => {
          attempts = 0;
        }, STABLE_CONNECTION_MS);
      } catch {
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      /*
       * A close/error before the stability window means this connection never
       * proved healthy — cancel the pending backoff reset so `attempts` keeps
       * climbing instead of snapping back to a ~1s reconnect.
       */
      if (stableTimer) {
        clearTimeout(stableTimer);
        stableTimer = undefined;
      }

      if (stopped || reconnectTimer || gaveUp) {
        return;
      }

      /*
       * Give up once the socket has failed to stabilise this many times in a row.
       * A genuinely dead session/workspace stops flooding; a transient outage that
       * eventually reconnects for STABLE_CONNECTION_MS has already had `attempts`
       * reset to 0, so it never reaches here.
       */
      if (attempts >= maxReconnects) {
        gaveUp = true;
        options.onGiveUp?.();

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

      if (stableTimer) {
        clearTimeout(stableTimer);
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

  hasWorkspaceId(): boolean {
    return Boolean(this.#workspaceId);
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
        /*
         * Check length, not truthiness: a falsy-but-valid payload (0, '', false, null)
         * must still be delivered, not silently dropped and the iterator desynchronized.
         */
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

/**
 * Decide whether a rejected runtime request should invalidate the cached auth
 * token and retry. Pure so the self-heal contract is unit-testable without a
 * live fetch: only a 401 is an auth rejection, we retry at most once (attempt
 * 0 → refresh, attempt 1 → give up), and only when a refresh hook is wired (a
 * static token can't be refreshed, so retrying would just replay the dead one).
 */
export function shouldRefreshAuthToken(status: number, attempt: number, canRefresh: boolean): boolean {
  return canRefresh && status === 401 && attempt === 0;
}

/**
 * A WebSocket upgrade that the server refuses for auth reasons surfaces as a
 * close with code 4401 (app-level "unauthorized" convention) or 1008 (policy
 * violation). Treat those as a token rejection so the socket transport gets the
 * same one-shot token self-heal as #rawRequest.
 */
export function isAuthSocketClose(closeCode: number | undefined): boolean {
  return closeCode === 4401 || closeCode === 1008;
}
