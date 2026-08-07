import { useTranslation } from 'react-i18next';
import type { ConnectionResolvedMessage } from '~/lib/chat/connector-messages';
import { formatChatResidualsCopy, getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';

/*
 * Small confirmation card rendered when the agent emits a
 * connection_resolved data part. Usually this happens immediately after
 * the OAuth popup finished and the parent ConnectionRequestCard has
 * already switched to its succeeded state. Surfacing a second discrete
 * note in the message stream gives the next assistant turn a stable
 * anchor — the model can refer to it ("now that GitHub is connected,
 * I'll …") without re-reading the connect card state.
 */

export interface ConnectionResolvedNoteProps {
  payload: ConnectionResolvedMessage;
}

export function ConnectionResolvedNote({ payload }: ConnectionResolvedNoteProps) {
  const { i18n } = useTranslation();
  const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className="my-2 flex min-w-0 items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2">
      <span className="i-ph:check-circle-fill h-4 w-4 shrink-0 text-bolt-elements-icon-success" aria-hidden />
      <p className="min-w-0 text-xs text-bolt-elements-textSecondary break-words">
        {formatChatResidualsCopy(copy['chatResiduals.connectionResolved.success'], {
          provider: payload.providerDisplayName,
          account: payload.accountLabel,
        })}
      </p>
    </div>
  );
}
