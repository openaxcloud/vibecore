/**
 * Stacked avatars for the agent panel presence indicator.
 *
 * Renders up to `maxVisible` avatars from the supplied entries; any
 * extras collapse into a `+N` chip. Pure presentational — the caller
 * (currently `BaseChat` via `useProjectCollaboration`) shapes the
 * server snapshot into `PresenceEntry[]` and passes it in.
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatClientAstResidualCopy,
  formatClientAstResidualPlural,
  getClientAstResidualCopy,
  type ClientAstResidualKey,
} from '~/lib/i18n/catalogs/client-ast-residual';

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

const STATUS_COPY_KEYS = {
  typing: 'clientAst.chat.presence.status.typing',
  viewing: 'clientAst.chat.presence.status.viewing',
  idle: 'clientAst.chat.presence.status.idle',
} as const satisfies Readonly<Record<PresenceEntry['status'], ClientAstResidualKey>>;

export const PresenceAvatars = memo(({ entries, maxVisible = 4 }: PresenceAvatarsProps) => {
  const { i18n } = useTranslation();

  if (entries.length === 0) {
    return null;
  }

  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getClientAstResidualCopy(language);

  const visible = entries.slice(0, maxVisible);
  const overflow = entries.length - visible.length;

  const viewerLabel = formatClientAstResidualPlural(language, entries.length, {
    one: copy['clientAst.chat.presence.viewers_one'],
    other: copy['clientAst.chat.presence.viewers_other'],
  });

  return (
    <div className="bolt-presence-avatars" role="group" aria-label={viewerLabel}>
      {visible.map((entry, index) => {
        const status = copy[STATUS_COPY_KEYS[entry.status]];

        return (
          <div
            key={entry.userId || `idx:${index}`}
            className="bolt-presence-avatar"
            data-status={entry.status}
            title={formatClientAstResidualCopy(copy['clientAst.chat.presence.entryTitle'], {
              name: entry.name,
              status,
            })}
            aria-label={formatClientAstResidualCopy(copy['clientAst.chat.presence.entryAria'], {
              name: entry.name,
              status,
            })}
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
        );
      })}
      {overflow > 0 ? (
        <div
          className="bolt-presence-avatar-overflow"
          aria-label={formatClientAstResidualPlural(language, overflow, {
            one: copy['clientAst.chat.presence.moreViewers_one'],
            other: copy['clientAst.chat.presence.moreViewers_other'],
          })}
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
});

PresenceAvatars.displayName = 'PresenceAvatars';
