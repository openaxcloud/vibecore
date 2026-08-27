/**
 * Share-link composer hook for the agent panel (Sprint 7).
 *
 * Builds the conversation snapshot from the current user/project context and
 * mints a share link via the server: it POSTs the snapshot to the
 * `/api/chat-share` resource route, which persists it and returns a short,
 * HMAC-signed token. The public URL is `${origin}/share/${token}` — the
 * conversation itself is stored server-side, not embedded in the URL (audit
 * M5/M7).
 *
 * `buildShareRequestBody` is exported separately so the (pure) payload
 * construction can be unit-tested without React or the network.
 */

import type { Message } from 'ai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { selectShareableMessages } from '~/lib/chat/share-link';
import { getClientRuntimeResidualCopy } from '~/lib/i18n/catalogs/client-runtime-residual';

export interface BuildShareRequestInput {
  conversationId: string;
  projectId: string;
  authorUserId: string;
  title?: string;
  messages: readonly Message[];
  allowedMessageIds?: ReadonlySet<string>;
  allowFork?: boolean;
}

export interface ChatShareRequestBody {
  conversationId: string;
  projectId: string;
  title?: string;
  visibleMessageIds: string[];
  inlineMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string }>;
  allowFork: boolean;
}

/*
 * Inline-message content budget. The server caps the payload too, but we keep
 * the request small so a single share never ships an unbounded conversation.
 */
const INLINE_MESSAGES_CONTENT_BUDGET = 32 * 1024;

function buildInlineMessages(
  messages: readonly { id?: string; role?: string; content?: string | unknown }[],
): ChatShareRequestBody['inlineMessages'] {
  const inline: NonNullable<ChatShareRequestBody['inlineMessages']> = [];

  let bytesUsed = 0;

  for (const message of messages) {
    const id = typeof message.id === 'string' ? message.id : undefined;
    const role = message.role;
    const content = typeof message.content === 'string' ? message.content : '';

    if (!id || (role !== 'user' && role !== 'assistant' && role !== 'system')) {
      continue;
    }

    const size = new Blob([content]).size + 64;

    if (bytesUsed + size > INLINE_MESSAGES_CONTENT_BUDGET) {
      break;
    }

    bytesUsed += size;
    inline.push({ id, role, content });
  }

  return inline.length > 0 ? inline : undefined;
}

/**
 * Pure: build the request body POSTed to `/api/chat-share`. Filters the
 * message list by `allowedMessageIds` when provided and drops messages that
 * have no id from `visibleMessageIds`.
 */
export function buildShareRequestBody(input: BuildShareRequestInput): ChatShareRequestBody {
  const filtered = input.allowedMessageIds
    ? selectShareableMessages(input.messages, { allowedIds: new Set(input.allowedMessageIds) })
    : [...input.messages];

  return {
    conversationId: input.conversationId,
    projectId: input.projectId,
    title: input.title,
    visibleMessageIds: filtered.map((message) => message.id).filter((id): id is string => Boolean(id)),
    inlineMessages: buildInlineMessages(filtered),
    allowFork: input.allowFork ?? false,
  };
}

export interface UseShareLinkOptions {
  origin?: string;
}

export interface UseShareLinkResult {
  /**
   * Latest share state — `idle` before the user clicks Share, `building` while
   * the server mints the token, `ready` with the URL on success, or `error`.
   */
  state: { kind: 'idle' } | { kind: 'building' } | { kind: 'ready'; url: string } | { kind: 'error'; message: string };

  /** Mint the share link for the supplied snapshot and surface it in `state`. */
  build: (input: BuildShareRequestInput) => Promise<string | undefined>;

  /** Copy the latest built URL to the system clipboard. Resolves to true on success. */
  copyToClipboard: () => Promise<boolean>;

  /** Reset back to the idle state (used to hide a stale toast). */
  reset: () => void;
}

type ShareLinkErrorCode = 'create_failed' | 'invalid_response' | 'clipboard_unavailable' | 'copy_failed';

type ShareLinkInternalState =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; code: ShareLinkErrorCode };

function defaultOrigin(): string {
  if (typeof globalThis === 'undefined' || typeof globalThis.window === 'undefined') {
    return 'https://vibecore.local';
  }

  const { origin } = globalThis.window.location;

  return origin || 'https://vibecore.local';
}

export function useShareLink(options: UseShareLinkOptions = {}): UseShareLinkResult {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getClientRuntimeResidualCopy(language);
  const [origin, setOrigin] = useState<string>(() => options.origin ?? defaultOrigin());
  const [internalState, setInternalState] = useState<ShareLinkInternalState>({ kind: 'idle' });

  const state = useMemo<UseShareLinkResult['state']>(() => {
    if (internalState.kind !== 'error') {
      return internalState;
    }

    const key =
      internalState.code === 'invalid_response'
        ? 'clientRuntime.share.invalidResponse'
        : internalState.code === 'clipboard_unavailable'
          ? 'clientRuntime.share.clipboardUnavailable'
          : internalState.code === 'copy_failed'
            ? 'clientRuntime.share.copyFailed'
            : 'clientRuntime.share.createFailed';

    return { kind: 'error', message: copy[key] };
  }, [copy, internalState]);

  useEffect(() => {
    if (options.origin) {
      setOrigin(options.origin);

      return;
    }

    setOrigin(defaultOrigin());
  }, [options.origin]);

  const build = useCallback<UseShareLinkResult['build']>(
    async (input) => {
      setInternalState({ kind: 'building' });

      try {
        const response = await fetch('/api/chat-share', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildShareRequestBody(input)),
        });

        if (!response.ok) {
          await response.json().catch(() => undefined);
          setInternalState({ kind: 'error', code: 'create_failed' });

          return undefined;
        }

        const data = (await response.json()) as { token?: string };

        if (!data.token) {
          setInternalState({ kind: 'error', code: 'invalid_response' });

          return undefined;
        }

        const url = `${origin.replace(/\/+$/, '')}/share/${data.token}`;
        setInternalState({ kind: 'ready', url });

        return url;
      } catch (error) {
        console.error('Failed to create share link:', error);
        setInternalState({ kind: 'error', code: 'create_failed' });

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
      setInternalState({ kind: 'error', code: 'clipboard_unavailable' });
      return false;
    }

    try {
      await navigator.clipboard.writeText(state.url);
      return true;
    } catch (error) {
      console.error('Failed to copy share link:', error);
      setInternalState({ kind: 'error', code: 'copy_failed' });

      return false;
    }
  }, [state]);

  const reset = useCallback(() => {
    setInternalState({ kind: 'idle' });
  }, []);

  return { state, build, copyToClipboard, reset };
}
