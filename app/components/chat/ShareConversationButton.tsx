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
import { memo, useCallback } from 'react';
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
  ({
    conversationId,
    projectId,
    authorUserId,
    title,
    messages,
    allowFork,
    className,
  }: ShareConversationButtonProps) => {
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

      const ok = await share.copyToClipboard();

      if (ok) {
        toast.success(t('shareButton.copiedToast'));
      } else {
        const message = share.state.kind === 'error' ? share.state.message : t('shareButton.errorClipboard');
        toast.error(message);
      }
    }, [allowFork, authorUserId, conversationId, messages, projectId, share, title]);

    const disabled = messages.length === 0;

    return (
      <button
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
);

ShareConversationButton.displayName = 'ShareConversationButton';
