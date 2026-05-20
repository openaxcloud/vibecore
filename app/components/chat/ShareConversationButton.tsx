/**
 * Header button that mints a public share URL for the current
 * conversation snapshot (Sprint 7 wiring).
 *
 * Wraps the `useShareLink` hook + a toast announcing the copy. The
 * payload is built locally with no server roundtrip — the
 * server-side signing + ACL story is a follow-up, but the
 * read-only landing route at /share/:token already decodes the
 * payload so a copied link works end-to-end as a v1.
 *
 * Auto-apply does not affect this surface — it's an explicit
 * user-initiated read-only action.
 */

import type { Message } from 'ai';
import { forwardRef, memo, useCallback } from 'react';
import { toast } from 'react-toastify';

import { useShareLink } from '~/lib/hooks/useShareLink';
import { t } from '~/lib/i18n/dictionary';

export interface ShareConversationButtonProps {
  conversationId: string;
  projectId: string;
  authorUserId: string;
  title?: string;
  messages: readonly Message[];
  allowFork?: boolean;
  className?: string;
}

export const ShareConversationButton = memo(
  forwardRef<HTMLButtonElement, ShareConversationButtonProps>(
    ({ conversationId, projectId, authorUserId, title, messages, allowFork, className }, ref) => {
      const share = useShareLink();

      const handleClick = useCallback(async () => {
        const url = share.build({
          conversationId,
          projectId,
          authorUserId,
          title,
          messages,
          allowFork,
        });

        if (!url) {
          const message = share.state.kind === 'error' ? share.state.message : t('shareButton.errorCouldNotBuild');
          toast.error(message);

          return;
        }

        /*
         * Write directly to the clipboard with the freshly-built URL —
         * share.copyToClipboard reads the hook's React state which is
         * still 'idle' inside this click handler's closure (the
         * setState in build() doesn't flush mid-callback).
         */
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
          toast.error(t('shareButton.errorClipboard'));
          return;
        }

        try {
          await navigator.clipboard.writeText(url);
          toast.success(t('shareButton.copiedToast'));
        } catch (error) {
          const message = error instanceof Error ? error.message : t('shareButton.errorClipboard');
          toast.error(message);
        }
      }, [allowFork, authorUserId, conversationId, messages, projectId, share, title]);

      const disabled = messages.length === 0;

      return (
        <button
          ref={ref}
          type="button"
          className={className}
          onClick={handleClick}
          disabled={disabled}
          aria-label={t('shareButton.label')}
          title={disabled ? t('shareButton.disabled') : t('shareButton.enabled')}
        >
          <span className="i-ph:share-network" aria-hidden />
        </button>
      );
    },
  ),
);

ShareConversationButton.displayName = 'ShareConversationButton';
