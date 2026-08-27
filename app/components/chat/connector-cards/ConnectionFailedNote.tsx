import { useTranslation } from 'react-i18next';
import type { ConnectionFailedMessage, ConnectionFailureReason } from '~/lib/chat/connector-messages';
import {
  formatChatResidualsCopy,
  getChatResidualsCopy,
  getConnectionFailureReasonLabel,
} from '~/lib/i18n/catalogs/chat-residuals';

/*
 * Surfaces a connection_failed data part as an inline diagnostic note.
 * Distinct from the failed state of ConnectionRequestCard (which still
 * owns the retry button for the active OAuth flow); this card is what
 * the agent emits when it decides the previous turn's request will not
 * be retried — for example after the user denied consent multiple
 * times, or when scope_mismatch blocks the upstream API call. The
 * reason is mapped to a human-readable label so the chat renderer
 * does not need to localise every code.
 */

/*
 * Resolve a failure reason to a human-readable label. The upstream
 * data-part filter (isConnectorDataPart) only checks that `kind` is a
 * string, so `reason` is not validated against ConnectionFailureReason.
 * An agent/proxy emitting an unknown or undefined reason would
 * otherwise produce `undefined`, which React renders as nothing —
 * leaving the diagnostic card blank. Fall back to a generic label so
 * the note always explains that the connection failed.
 */
export function reasonLabel(
  reason: ConnectionFailureReason | string | undefined,
  language: string | null | undefined = 'en',
): string {
  return getConnectionFailureReasonLabel(language, reason);
}

export interface ConnectionFailedNoteProps {
  payload: ConnectionFailedMessage;
}

export function ConnectionFailedNote({ payload }: ConnectionFailedNoteProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getChatResidualsCopy(language);

  return (
    <div className="my-2 flex min-w-0 items-start gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2">
      <span className="i-ph:warning-circle-fill mt-0.5 h-4 w-4 shrink-0 text-bolt-elements-icon-error" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs text-bolt-elements-textPrimary">
          {formatChatResidualsCopy(copy['chatResiduals.connectionFailed.title'], {
            provider: payload.providerDisplayName,
          })}
        </p>
        <p className="mt-0.5 break-words text-xs text-bolt-elements-textSecondary">
          {reasonLabel(payload.reason, language)}
        </p>
      </div>
    </div>
  );
}
