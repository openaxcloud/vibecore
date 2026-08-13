import type { ConnectionFailedMessage, ConnectionFailureReason } from '~/lib/chat/connector-messages';

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

const REASON_LABEL: Record<ConnectionFailureReason, string> = {
  user_denied: 'The connection was denied.',
  invalid_state: 'The OAuth state could not be verified.',
  provider_error: 'The provider returned an error.',
  scope_mismatch: 'The granted scopes do not cover what the agent needs.',
  timeout: 'The provider did not respond in time.',
};

const GENERIC_REASON_LABEL = 'The connection could not be completed.';

/*
 * Resolve a failure reason to a human-readable label. The upstream
 * data-part filter (isConnectorDataPart) only checks that `kind` is a
 * string, so `reason` is not validated against ConnectionFailureReason.
 * An agent/proxy emitting an unknown or undefined reason would
 * otherwise produce `undefined`, which React renders as nothing —
 * leaving the diagnostic card blank. Fall back to a generic label so
 * the note always explains that the connection failed.
 */
export function reasonLabel(reason: ConnectionFailureReason | string | undefined): string {
  return (reason != null && REASON_LABEL[reason as ConnectionFailureReason]) || GENERIC_REASON_LABEL;
}

export interface ConnectionFailedNoteProps {
  payload: ConnectionFailedMessage;
}

export function ConnectionFailedNote({ payload }: ConnectionFailedNoteProps) {
  return (
    <div className="my-2 flex items-start gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 bg-bolt-elements-background-depth-1">
      <span className="i-ph:warning-circle-fill w-4 h-4 text-bolt-elements-icon-error mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-bolt-elements-textPrimary">
          {payload.providerDisplayName} connection could not be completed.
        </p>
        <p className="text-xs text-bolt-elements-textSecondary mt-0.5 break-words">
          {reasonLabel(payload.reason)}
          {payload.detail ? ` ${payload.detail}` : ''}
        </p>
      </div>
    </div>
  );
}
