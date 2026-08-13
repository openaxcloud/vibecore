import type { ConnectionResolvedMessage } from '~/lib/chat/connector-messages';

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
  return (
    <div className="my-2 flex items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 bg-bolt-elements-background-depth-1">
      <span className="i-ph:check-circle-fill w-4 h-4 shrink-0 text-bolt-elements-icon-success" />
      <p className="min-w-0 text-xs text-bolt-elements-textSecondary break-words">
        {payload.providerDisplayName} connected as <strong>{payload.accountLabel}</strong>.
      </p>
    </div>
  );
}
