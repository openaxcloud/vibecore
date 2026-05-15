/**
 * Share-link composer hook for the agent panel (Sprint 7).
 *
 * Takes a conversation snapshot + the current user/project context and
 * produces a ready-to-copy URL via `encodeShareLinkPayload` and
 * `buildShareLinkUrl`. The actual network call to mint a server-signed
 * token lives one layer up; this hook handles the client-side payload
 * shape + the clipboard copy.
 *
 * Pure data construction — `buildShareUrl` is exported separately so it
 * can be unit-tested without React.
 */

import type { Message } from 'ai';
import { useCallback, useEffect, useState } from 'react';

import {
  buildShareLinkUrl,
  encodeShareLinkPayload,
  selectShareableMessages,
  type ShareLinkPayload,
} from '~/lib/chat/share-link';

export interface BuildShareUrlInput {
  origin: string;
  conversationId: string;
  projectId: string;
  authorUserId: string;
  title?: string;
  messages: readonly Message[];
  allowedMessageIds?: ReadonlySet<string>;
  allowFork?: boolean;
  now?: () => Date;
}

/**
 * Pure: build the public share URL the user can copy. Filters the
 * message list by `allowedMessageIds` when provided. Throws if the
 * resulting payload exceeds the size cap (in practice >64 KB of ids).
 */
export function buildShareUrl(input: BuildShareUrlInput): string {
  const filtered = input.allowedMessageIds
    ? selectShareableMessages(input.messages, { allowedIds: new Set(input.allowedMessageIds) })
    : [...input.messages];

  const now = input.now?.() ?? new Date();

  const payload: ShareLinkPayload = {
    conversationId: input.conversationId,
    title: input.title,
    projectId: input.projectId,
    authorUserId: input.authorUserId,
    createdAt: now.toISOString(),
    visibleMessageIds: filtered.map((message) => message.id).filter((id): id is string => Boolean(id)),
    allowFork: input.allowFork ?? false,
  };

  const encoded = encodeShareLinkPayload(payload);

  return buildShareLinkUrl(input.origin, encoded);
}

export interface UseShareLinkOptions {
  origin?: string;
}

export interface UseShareLinkResult {
  /**
   * Latest copy/build state — `null` before the user clicks Share,
   * the URL after a successful build, or an error description.
   */
  state: { kind: 'idle' } | { kind: 'ready'; url: string } | { kind: 'error'; message: string };

  /** Build the URL for the supplied snapshot and surface it in `state`. */
  build: (input: Omit<BuildShareUrlInput, 'origin' | 'now'>) => string | undefined;

  /** Copy the latest built URL to the system clipboard. Resolves to true on success. */
  copyToClipboard: () => Promise<boolean>;

  /** Reset back to the idle state (used to hide a stale toast). */
  reset: () => void;
}

function defaultOrigin(): string {
  if (typeof globalThis === 'undefined' || typeof globalThis.window === 'undefined') {
    return 'https://vibecore.local';
  }

  const { origin } = globalThis.window.location;

  return origin || 'https://vibecore.local';
}

export function useShareLink(options: UseShareLinkOptions = {}): UseShareLinkResult {
  const [origin, setOrigin] = useState<string>(() => options.origin ?? defaultOrigin());
  const [state, setState] = useState<UseShareLinkResult['state']>({ kind: 'idle' });

  useEffect(() => {
    if (options.origin) {
      setOrigin(options.origin);

      return;
    }

    setOrigin(defaultOrigin());
  }, [options.origin]);

  const build = useCallback<UseShareLinkResult['build']>(
    (input) => {
      try {
        const url = buildShareUrl({ ...input, origin });
        setState({ kind: 'ready', url });

        return url;
      } catch (error) {
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Failed to build share link',
        });

        return undefined;
      }
    },
    [origin],
  );

  const copyToClipboard = useCallback<UseShareLinkResult['copyToClipboard']>(async () => {
    if (state.kind !== 'ready') {
      return false;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setState({ kind: 'error', message: 'Clipboard API unavailable' });
      return false;
    }

    try {
      await navigator.clipboard.writeText(state.url);
      return true;
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Failed to copy to clipboard',
      });
      return false;
    }
  }, [state]);

  const reset = useCallback(() => {
    setState({ kind: 'idle' });
  }, []);

  return { state, build, copyToClipboard, reset };
}
