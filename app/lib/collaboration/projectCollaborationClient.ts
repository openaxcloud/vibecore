export type CollaborationPresence = {
  sessionId: string;
  userId?: string;
  status?: 'online' | 'idle' | 'offline';
  filePath?: string;
  cursor?: unknown;
  selection?: unknown;
  mode?: 'editing' | 'read-only' | 'pair-programming';
  terminalAccess?: boolean;
  updatedAt?: string;
};

export type CollaborationComment = {
  id: string;
  userId?: string;
  filePath?: string;
  line?: number;
  selection?: unknown;
  body: string;
  createdAt?: string;
};

export type CollaborationConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed';

export type CollaborationErrorCode = 'unavailable' | 'connectionFailed' | 'timeout' | 'invalidEvent' | 'socketError';

export type CollaborationSnapshot = {
  status: CollaborationConnectionStatus;
  sessionId: string;
  presence: CollaborationPresence[];
  comments: CollaborationComment[];
  lastEvent?: CollaborationEvent;
  error?: string;
  errorCode?: CollaborationErrorCode;
};

export type CollaborationEvent =
  | {
      type: 'collaboration.ready';
      projectId: string;
      presence?: CollaborationPresence[];
      comments?: CollaborationComment[];
      timestamp?: string;
    }
  | { type: 'presence.join' | 'presence.update'; presence: CollaborationPresence; timestamp?: string }
  | { type: 'presence.leave'; sessionId: string; timestamp?: string }
  | { type: 'comment.create'; comment: CollaborationComment; timestamp?: string }
  | { type: 'document.sync'; document: unknown; timestamp?: string }
  | { type: 'terminal_permission.update'; userId?: string; allowed?: boolean; timestamp?: string }
  | { type: 'ai_conversation.share'; aiConversation: unknown; timestamp?: string }
  | { type: 'error'; error?: { message?: string } | string; timestamp?: string }
  | ({ type: string; timestamp?: string } & Record<string, unknown>);

export type CollaborationWebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: any) => void): void;
};

export type CollaborationWebSocketConstructor = new (url: string) => CollaborationWebSocketLike;

export type ProjectCollaborationClientOptions = {
  projectId: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: CollaborationWebSocketConstructor;
  sessionId?: string;
  ticketEndpoint?: string;
  minReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  connectTimeoutMs?: number;
};

type SnapshotListener = (snapshot: CollaborationSnapshot) => void;
type EventListener = (event: CollaborationEvent) => void;

const OPEN = 1;

class CollaborationConnectionError extends Error {
  constructor(readonly collaborationCode: CollaborationErrorCode) {
    super(collaborationCode);
    this.name = 'CollaborationConnectionError';
  }
}

function createSessionId() {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `collab:${random}`;
}

function applyEvent(snapshot: CollaborationSnapshot, event: CollaborationEvent): CollaborationSnapshot {
  if (event.type === 'collaboration.ready') {
    const readyEvent = event as Extract<CollaborationEvent, { type: 'collaboration.ready' }>;

    const readyComments = Array.isArray(readyEvent.comments) ? readyEvent.comments : [];

    /*
     * A peer's comment.create can be delivered to this freshly-joined socket
     * BEFORE the ready snapshot (the server joins the room before its two
     * awaited snapshot reads complete). Merge comments by id rather than
     * replacing so a comment created during the sync window isn't dropped.
     * Presence stays the authoritative fresh list — it's ephemeral and a
     * wholesale replace avoids resurrecting departed users as ghosts on
     * reconnect.
     */
    const commentsById = new Map(readyComments.map((comment) => [comment.id, comment]));

    for (const comment of snapshot.comments) {
      if (!commentsById.has(comment.id)) {
        commentsById.set(comment.id, comment);
      }
    }

    return {
      ...snapshot,
      presence: Array.isArray(readyEvent.presence) ? readyEvent.presence : [],
      comments: [...commentsById.values()],
      lastEvent: event,
      error: undefined,
      errorCode: undefined,
    };
  }

  if ((event.type === 'presence.join' || event.type === 'presence.update') && event.presence) {
    const presenceEvent = event as Extract<CollaborationEvent, { type: 'presence.join' | 'presence.update' }>;
    const presence = snapshot.presence.filter((user) => user.sessionId !== presenceEvent.presence.sessionId);

    return {
      ...snapshot,
      presence: [...presence, presenceEvent.presence],
      lastEvent: event,
      error: undefined,
      errorCode: undefined,
    };
  }

  if (event.type === 'presence.leave') {
    return {
      ...snapshot,
      presence: snapshot.presence.filter((user) => user.sessionId !== event.sessionId),
      lastEvent: event,
      error: undefined,
      errorCode: undefined,
    };
  }

  if (event.type === 'comment.create' && event.comment) {
    const commentEvent = event as Extract<CollaborationEvent, { type: 'comment.create' }>;

    const comments = snapshot.comments.some((comment) => comment.id === commentEvent.comment.id)
      ? snapshot.comments.map((comment) => (comment.id === commentEvent.comment.id ? commentEvent.comment : comment))
      : [...snapshot.comments, commentEvent.comment];

    return { ...snapshot, comments, lastEvent: event, error: undefined, errorCode: undefined };
  }

  if (event.type === 'error') {
    return { ...snapshot, lastEvent: event, error: undefined, errorCode: 'socketError' };
  }

  return { ...snapshot, lastEvent: event };
}

export class ProjectCollaborationClient {
  readonly sessionId: string;
  #projectId: string;
  #fetch: typeof fetch;
  #WebSocket?: CollaborationWebSocketConstructor;
  #ticketEndpoint: string;
  #minReconnectDelayMs: number;
  #maxReconnectDelayMs: number;
  #connectTimeoutMs: number;
  #socket?: CollaborationWebSocketLike;
  #stopped = true;
  #connecting = false;
  #reconnectTimer?: ReturnType<typeof setTimeout>;
  #connectTimer?: ReturnType<typeof setTimeout>;
  #reconnectAttempts = 0;
  #pendingPresence?: Partial<CollaborationPresence>;
  #pendingComments: Array<{ filePath?: string; line?: number; selection?: unknown; body: string }> = [];
  #snapshotListeners = new Set<SnapshotListener>();
  #eventListeners = new Set<EventListener>();
  #snapshot: CollaborationSnapshot;

  constructor(options: ProjectCollaborationClientOptions) {
    this.#projectId = options.projectId;
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#WebSocket = options.WebSocketImpl ?? (globalThis.WebSocket as CollaborationWebSocketConstructor | undefined);
    this.sessionId = options.sessionId ?? createSessionId();
    this.#ticketEndpoint =
      options.ticketEndpoint ??
      `/api/projects/${encodeURIComponent(options.projectId)}/collaboration-ws?sessionId=${encodeURIComponent(
        this.sessionId,
      )}`;
    this.#minReconnectDelayMs = options.minReconnectDelayMs ?? 750;
    this.#maxReconnectDelayMs = options.maxReconnectDelayMs ?? 10_000;
    this.#connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
    this.#snapshot = {
      status: 'idle',
      sessionId: this.sessionId,
      presence: [],
      comments: [],
    };
  }

  get snapshot() {
    return this.#snapshot;
  }

  subscribe(listener: SnapshotListener) {
    this.#snapshotListeners.add(listener);
    listener(this.#snapshot);

    return () => this.#snapshotListeners.delete(listener);
  }

  onEvent(listener: EventListener) {
    this.#eventListeners.add(listener);

    return () => this.#eventListeners.delete(listener);
  }

  connect() {
    if (!this.#stopped) {
      return;
    }

    this.#stopped = false;
    void this.#connectSocket('connecting');
  }

  close() {
    this.#stopped = true;

    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }

    this.#clearConnectTimer();

    this.#socket?.close(1000, 'client closed');
    this.#socket = undefined;
    this.#setSnapshot({ status: 'closed' });
  }

  updatePresence(presence: Partial<CollaborationPresence>) {
    this.#pendingPresence = { ...this.#pendingPresence, ...presence };
    this.#send({ type: 'presence.update', payload: this.#pendingPresence });
  }

  createComment(input: { filePath?: string; line?: number; selection?: unknown; body: string }) {
    /*
     * Buffer the comment if the socket isn't OPEN (connecting/reconnecting):
     * #send silently drops non-presence messages when not OPEN, so a comment
     * authored during a reconnect blip was lost. Flushed on the next 'open'.
     */
    if (this.#socket?.readyState !== OPEN) {
      this.#pendingComments.push(input);

      /*
       * Bound the buffer: a long outage shouldn't let it grow without limit.
       * Keep the most recent ones (drop the oldest) if it overflows.
       */
      if (this.#pendingComments.length > 100) {
        this.#pendingComments.splice(0, this.#pendingComments.length - 100);
      }

      this.#send({ type: 'comment.create', payload: input });

      return;
    }

    this.#send({ type: 'comment.create', payload: input });
  }

  #emit(event: CollaborationEvent) {
    this.#snapshot = applyEvent(this.#snapshot, event);
    this.#snapshotListeners.forEach((listener) => listener(this.#snapshot));
    this.#eventListeners.forEach((listener) => listener(event));
  }

  #setSnapshot(patch: Partial<CollaborationSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#snapshotListeners.forEach((listener) => listener(this.#snapshot));
  }

  async #connectSocket(status: CollaborationConnectionStatus) {
    /*
     * Guard against concurrent connects: without it, a #send during CONNECTING
     * (or a stale reconnect timer) spawns a second socket, overwrites #socket,
     * and orphans the first socket's listeners — a self-sustaining duplicate-
     * connection / listener leak.
     */
    if (this.#stopped || this.#connecting) {
      return;
    }

    if (!this.#WebSocket) {
      this.#setSnapshot({ status: 'error', error: undefined, errorCode: 'unavailable' });
      this.#scheduleReconnect();

      return;
    }

    this.#connecting = true;
    this.#setSnapshot({ status, error: undefined, errorCode: undefined });

    try {
      const response = await this.#fetch(this.#ticketEndpoint, { headers: { accept: 'application/json' } });

      if (!response.ok) {
        throw new CollaborationConnectionError('connectionFailed');
      }

      const { websocketUrl } = (await response.json()) as { websocketUrl?: string };

      if (!websocketUrl) {
        throw new CollaborationConnectionError('connectionFailed');
      }

      /*
       * close() may have run while the ticket fetch was in flight (navigation,
       * collaboration toggled off, unmount). The #stopped check at the top is
       * stale by now — re-check before opening a socket, or we resurrect a live
       * connection that nothing will ever close (leaked socket + stale "connected"
       * presence).
       */
      if (this.#stopped) {
        this.#connecting = false;
        return;
      }

      /*
       * Release any previous socket before opening a new one. On an error-without-
       * close reconnect the old socket (and its listeners) were never closed, so
       * they lingered — leaking the connection and letting a stale socket's late
       * 'close' schedule a duplicate reconnect. Closing + null-ing it, plus the
       * `this.#socket !== socket` guards below, makes every handler ignore events
       * from a superseded socket.
       */
      if (this.#socket) {
        try {
          this.#socket.close();
        } catch {
          // already closed/closing — nothing to do
        }
      }

      const socket = new this.#WebSocket(websocketUrl);
      this.#socket = socket;

      /*
       * Bound the handshake: if neither 'open' nor 'error'/'close' ever fires
       * (hung proxy/LB), #connecting would stay true forever and #send would never
       * schedule a reconnect — wedging the client. Force a teardown + retry.
       */
      this.#clearConnectTimer();
      this.#connectTimer = setTimeout(() => {
        if (this.#socket !== socket || this.#stopped) {
          return;
        }

        this.#connecting = false;

        try {
          socket.close();
        } catch {
          // already closing
        }

        this.#setSnapshot({ status: 'error', error: undefined, errorCode: 'timeout' });
        this.#scheduleReconnect();
      }, this.#connectTimeoutMs);

      socket.addEventListener('open', () => {
        if (this.#socket !== socket) {
          return;
        }

        this.#connecting = false;
        this.#reconnectAttempts = 0;
        this.#clearConnectTimer();

        /*
         * Cancel any reconnect timer that was scheduled before this socket came
         * up, so it can't later tear down a now-healthy connection.
         */
        if (this.#reconnectTimer) {
          clearTimeout(this.#reconnectTimer);
          this.#reconnectTimer = undefined;
        }

        this.#setSnapshot({ status: 'connected', error: undefined, errorCode: undefined });

        if (this.#pendingPresence) {
          this.updatePresence(this.#pendingPresence);
        }

        // Flush comments authored while the socket was down.
        if (this.#pendingComments.length > 0) {
          const queued = this.#pendingComments;
          this.#pendingComments = [];

          for (const comment of queued) {
            this.#send({ type: 'comment.create', payload: comment });
          }
        }
      });
      socket.addEventListener('message', (event: { data: string }) => {
        if (this.#socket !== socket) {
          return;
        }

        try {
          this.#emit(JSON.parse(event.data) as CollaborationEvent);
        } catch {
          this.#setSnapshot({
            status: 'error',
            error: undefined,
            errorCode: 'invalidEvent',
          });
        }
      });
      socket.addEventListener('error', () => {
        if (this.#socket !== socket) {
          return;
        }

        this.#connecting = false;
        this.#clearConnectTimer();
        this.#setSnapshot({ status: 'error', error: undefined, errorCode: 'socketError' });

        /*
         * Some WS/proxy/LB layers emit 'error' WITHOUT a following 'close',
         * which would otherwise wedge the client in 'error' with no retry.
         */
        if (!this.#stopped) {
          this.#scheduleReconnect();
        }
      });
      socket.addEventListener('close', () => {
        if (this.#socket !== socket) {
          return;
        }

        this.#connecting = false;
        this.#clearConnectTimer();

        if (!this.#stopped) {
          this.#setSnapshot({ status: 'reconnecting' });
          this.#scheduleReconnect();
        }
      });
    } catch (error) {
      this.#connecting = false;
      this.#clearConnectTimer();
      this.#setSnapshot({
        status: 'error',
        error: undefined,
        errorCode: error instanceof CollaborationConnectionError ? error.collaborationCode : 'connectionFailed',
      });
      this.#scheduleReconnect();
    }
  }

  #send(message: { type: string; payload?: unknown }) {
    if (this.#socket?.readyState === OPEN) {
      this.#socket.send(JSON.stringify(message));

      return;
    }

    /*
     * Presence is buffered in #pendingPresence and flushes on the next 'open',
     * so a send during CONNECTING must NOT schedule a reconnect (that would spawn
     * a duplicate socket). Only reconnect when there's genuinely no live/in-flight one.
     */
    if (!this.#stopped && !this.#connecting) {
      this.#scheduleReconnect();
    }
  }

  #clearConnectTimer() {
    if (this.#connectTimer) {
      clearTimeout(this.#connectTimer);
      this.#connectTimer = undefined;
    }
  }

  #scheduleReconnect() {
    if (this.#stopped || this.#reconnectTimer) {
      return;
    }

    const delay = Math.min(this.#minReconnectDelayMs * 2 ** this.#reconnectAttempts, this.#maxReconnectDelayMs);
    this.#reconnectAttempts += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.#connectSocket('reconnecting');
    }, delay);
  }
}
