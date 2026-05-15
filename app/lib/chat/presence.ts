/**
 * Presence registry for the shared agent panel (Sprint 7).
 *
 * The backend already exposes a WebSocket presence channel per project;
 * this module owns the client-side reducer that merges presence pings
 * into a deduplicated, freshness-bounded list of who else is currently
 * viewing the chat. The websocket adapter calls `presenceReducer` on
 * every incoming event; the agent panel subscribes to the resulting
 * list to render avatars + typing indicators.
 *
 * Pure node-testable; no DOM, no websocket.
 */

export type PresenceStatus = 'viewing' | 'typing' | 'idle';

export interface PresenceEntry {
  userId: string;
  name: string;
  avatarUrl?: string;
  status: PresenceStatus;
  lastSeenAt: number;
}

export interface PresenceState {
  /** Map keyed by `userId` so we can update in place. */
  entries: Record<string, PresenceEntry>;
}

export type PresenceEvent =
  | {
      type: 'ping';
      userId: string;
      name: string;
      avatarUrl?: string;
      status: PresenceStatus;
      at: number;
    }
  | { type: 'leave'; userId: string }
  | { type: 'prune'; before: number };

export const PRESENCE_STALE_AFTER_MS = 60_000;

export function emptyPresence(): PresenceState {
  return { entries: {} };
}

export function presenceReducer(state: PresenceState, event: PresenceEvent): PresenceState {
  switch (event.type) {
    case 'ping': {
      const existing = state.entries[event.userId];

      if (
        existing &&
        existing.name === event.name &&
        existing.avatarUrl === event.avatarUrl &&
        existing.status === event.status &&
        existing.lastSeenAt >= event.at
      ) {
        return state;
      }

      return {
        entries: {
          ...state.entries,
          [event.userId]: {
            userId: event.userId,
            name: event.name,
            avatarUrl: event.avatarUrl,
            status: event.status,
            lastSeenAt: event.at,
          },
        },
      };
    }

    case 'leave': {
      if (!state.entries[event.userId]) {
        return state;
      }

      const { [event.userId]: _removed, ...rest } = state.entries;

      return { entries: rest };
    }

    case 'prune': {
      let mutated = false;

      const next: PresenceState['entries'] = {};

      for (const [userId, entry] of Object.entries(state.entries)) {
        if (entry.lastSeenAt >= event.before) {
          next[userId] = entry;
        } else {
          mutated = true;
        }
      }

      return mutated ? { entries: next } : state;
    }

    default:
      return state;
  }
}

/**
 * Snapshot of presence entries sorted by status (typing first, then
 * viewing, idle last) and freshness (most-recent first). Stale entries
 * older than `PRESENCE_STALE_AFTER_MS` from `now` are dropped.
 */
export function listPresenceEntries(state: PresenceState, options: { now?: number } = {}): PresenceEntry[] {
  const now = options.now ?? Date.now();
  const horizon = now - PRESENCE_STALE_AFTER_MS;

  const fresh = Object.values(state.entries).filter((entry) => entry.lastSeenAt >= horizon);

  const order: Record<PresenceStatus, number> = { typing: 0, viewing: 1, idle: 2 };

  fresh.sort((a, b) => {
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }

    return b.lastSeenAt - a.lastSeenAt;
  });

  return fresh;
}
