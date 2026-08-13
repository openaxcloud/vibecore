/**
 * Stacked avatars for the agent panel presence indicator.
 *
 * Renders up to `maxVisible` avatars from the supplied entries; any
 * extras collapse into a `+N` chip. Pure presentational — the caller
 * (currently `BaseChat` via `useProjectCollaboration`) shapes the
 * server snapshot into `PresenceEntry[]` and passes it in.
 */

import { memo } from 'react';

export type PresenceStatus = 'viewing' | 'typing' | 'idle';

export interface PresenceEntry {
  userId: string;
  name: string;
  avatarUrl?: string;
  status: PresenceStatus;
  lastSeenAt: number;
}

export interface PresenceAvatarsProps {
  entries: readonly PresenceEntry[];
  maxVisible?: number;
}

function initialsFor(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return '?';
  }

  const tokens = trimmed.split(/\s+/);
  const first = tokens[0]?.[0] ?? '';
  const last = tokens.length > 1 ? (tokens[tokens.length - 1]?.[0] ?? '') : '';

  return `${first}${last}`.toUpperCase();
}

const STATUS_LABEL: Record<PresenceEntry['status'], string> = {
  typing: 'typing',
  viewing: 'viewing',
  idle: 'idle',
};

export const PresenceAvatars = memo(({ entries, maxVisible = 4 }: PresenceAvatarsProps) => {
  if (entries.length === 0) {
    return null;
  }

  const visible = entries.slice(0, maxVisible);
  const overflow = entries.length - visible.length;

  return (
    <div className="bolt-presence-avatars" role="group" aria-label={`${entries.length} viewers`}>
      {visible.map((entry, index) => (
        <div
          key={entry.userId || `idx:${index}`}
          className="bolt-presence-avatar"
          data-status={entry.status}
          title={`${entry.name} (${STATUS_LABEL[entry.status]})`}
          aria-label={`${entry.name} ${STATUS_LABEL[entry.status]}`}
        >
          {entry.avatarUrl ? (
            <img src={entry.avatarUrl} alt="" aria-hidden />
          ) : (
            <span aria-hidden>{initialsFor(entry.name)}</span>
          )}
          {entry.status === 'typing' ? (
            <span className="bolt-presence-avatar-typing" aria-hidden>
              …
            </span>
          ) : null}
        </div>
      ))}
      {overflow > 0 ? (
        <div className="bolt-presence-avatar-overflow" aria-label={`${overflow} more viewers`}>
          +{overflow}
        </div>
      ) : null}
    </div>
  );
});

PresenceAvatars.displayName = 'PresenceAvatars';
