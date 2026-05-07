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

export type CollaborationSnapshot = {
  status: CollaborationConnectionStatus;
  sessionId: string;
  presence: CollaborationPresence[];
  comments: CollaborationComment[];
  lastEvent?: CollaborationEvent;
  error?: string;
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
};

type SnapshotListener = (snapshot: CollaborationSnapshot) => void;
type EventListener = (event: CollaborationEvent) => void;

const OPEN = 1;

function createSessionId() {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `collab:${random}`;
}

function applyEvent(snapshot: CollaborationSnapshot, event: CollaborationEvent): CollaborationSnapshot {
  if (event.type === 'collaboration.ready') {
    const readyEvent = event as Extract<CollaborationEvent, { type: 'collaboration.ready' }>;

    return {
      ...snapshot,
      presence: Array.isArray(readyEvent.presence) ? readyEvent.presence : [],
      comments: Array.isArray(readyEvent.comments) ? readyEvent.comments : [],
      lastEvent: event,
      error: undefined,
    };
  }

  if ((event.type === 'presence.join' || event.type === 'presence.update') && event.presence) {
    const presenceEvent = event as Extract<CollaborationEvent, { type: 'presence.join' | 'presence.update' }>;
    const presence = snapshot.presence.filter((user) => user.sessionId !== presenceEvent.presence.sessionId);

    return { ...snapshot, presence: [...presence, presenceEvent.presence], lastEvent: event, error: undefined };
  }

  if (event.type === 'presence.leave') {
    return {
      ...snapshot,
      presence: snapshot.presence.filter((user) => user.sessionId !== event.sessionId),
      lastEvent: event,
      error: undefined,
    };
  }

  if (event.type === 'comment.create' && event.comment) {
    const commentEvent = event as Extract<CollaborationEvent, { type: 'comment.create' }>;

    const comments = snapshot.comments.some((comment) => comment.id === commentEvent.comment.id)
      ? snapshot.comments.map((comment) => (comment.id === commentEvent.comment.id ? commentEvent.comment : comment))
      : [...snapshot.comments, commentEvent.comment];

    return { ...snapshot, comments, lastEvent: event, error: undefined };
  }

  if (event.type === 'error') {
    const errorEvent = event as Extract<CollaborationEvent, { type: 'error' }>;
    const error = typeof errorEvent.error === 'string' ? errorEvent.error : errorEvent.error?.message;

    return { ...snapshot, lastEvent: event, error: error ?? 'Collaboration socket error' };
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
  #socket?: CollaborationWebSocketLike;
  #stopped = true;
  #reconnectTimer?: ReturnType<typeof setTimeout>;
  #reconnectAttempts = 0;
  #pendingPresence?: Partial<CollaborationPresence>;
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

    this.#socket?.close(1000, 'client closed');
    this.#socket = undefined;
    this.#setSnapshot({ status: 'closed' });
  }

  updatePresence(presence: Partial<CollaborationPresence>) {
    this.#pendingPresence = { ...this.#pendingPresence, ...presence };
    this.#send({ type: 'presence.update', payload: this.#pendingPresence });
  }

  createComment(input: { filePath?: string; line?: number; selection?: unknown; body: string }) {
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
    if (this.#stopped) {
      return;
    }

    if (!this.#WebSocket) {
      this.#setSnapshot({ status: 'error', error: 'WebSocket is not available in this browser' });
      this.#scheduleReconnect();

      return;
    }

    this.#setSnapshot({ status, error: undefined });

    try {
      const response = await this.#fetch(this.#ticketEndpoint, { headers: { accept: 'application/json' } });

      if (!response.ok) {
        throw new Error(`Collaboration ticket failed (${response.status})`);
      }

      const { websocketUrl } = (await response.json()) as { websocketUrl?: string };

      if (!websocketUrl) {
        throw new Error('Collaboration ticket did not include a WebSocket URL');
      }

      const socket = new this.#WebSocket(websocketUrl);
      this.#socket = socket;
      socket.addEventListener('open', () => {
        this.#reconnectAttempts = 0;
        this.#setSnapshot({ status: 'connected', error: undefined });

        if (this.#pendingPresence) {
          this.updatePresence(this.#pendingPresence);
        }
      });
      socket.addEventListener('message', (event: { data: string }) => {
        try {
          this.#emit(JSON.parse(event.data) as CollaborationEvent);
        } catch (error) {
          this.#setSnapshot({
            status: 'error',
            error: error instanceof Error ? error.message : 'Invalid collaboration event',
          });
        }
      });
      socket.addEventListener('error', () => {
        this.#setSnapshot({ status: 'error', error: 'Collaboration socket error' });
      });
      socket.addEventListener('close', () => {
        if (!this.#stopped) {
          this.#setSnapshot({ status: 'reconnecting' });
          this.#scheduleReconnect();
        }
      });
    } catch (error) {
      this.#setSnapshot({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unable to connect collaboration socket',
      });
      this.#scheduleReconnect();
    }
  }

  #send(message: { type: string; payload?: unknown }) {
    if (this.#socket?.readyState === OPEN) {
      this.#socket.send(JSON.stringify(message));
    } else if (!this.#stopped) {
      this.#scheduleReconnect();
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
