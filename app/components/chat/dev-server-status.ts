import type { TFunction } from 'i18next';

/*
 * Status-bar "Dev: …" label, extracted from BaseChat.tsx so the
 * BUG-UX-DEV-BLOCKED-STUCK decision (a latched 'error' state must resolve the
 * moment a port really serves) is unit-testable without importing the whole
 * chat surface.
 */

function previewCommandFromLogs(logs: string[]) {
  for (const log of [...logs].reverse()) {
    const message = typeof log === 'string' ? log : '';
    const match = message.match(/Starting preview with ([^\n]+)/i);

    if (match?.[1]) {
      return match[1].replace(/\s+in\s+.+$/i, '').trim();
    }
  }

  return undefined;
}

export function devServerStatusText(
  t: TFunction,
  input: {
    previews: Array<{ ready?: boolean; serving?: boolean }>;
    workspaceLoading: boolean;
    workspaceError?: string;
    logs: string[];
    previewServerState: { status: string; command?: string; error?: string };
  },
) {
  const command = input.previewServerState.command ?? previewCommandFromLogs(input.logs);

  /*
   * BUG-UX-DEV-BLOCKED-STUCK: a SERVING port (HTTP answers + live process —
   * the server-side probe) means the dev server runs, even while the aggregate
   * `ready` is still vetoed by a lagging manager status / stale client beacon
   * and even if an earlier transient failure latched previewServerState on
   * 'error'. Reality (a live port) beats the latched state; without this the
   * bar froze on "Dev: blocked" over a serving app.
   */
  if (input.previews.some((preview) => preview.ready !== false || preview.serving === true)) {
    return command ? t('baseChatAst.dev.activeCommand', { command }) : t('baseChatAst.dev.active');
  }

  if (input.workspaceError || input.previewServerState.status === 'error') {
    /*
     * A genuine runtime failure with no live port: show WHY instead of a bare,
     * frozen "Dev: blocked" (truncated — the full message lives in the logs).
     */
    const reason = (input.previewServerState.error ?? input.workspaceError ?? '').trim().replace(/\s+/g, ' ');

    if (reason) {
      return t('baseChatAst.dev.blockedReason', {
        reason: reason.length > 80 ? `${reason.slice(0, 77)}…` : reason,
      });
    }

    return t('baseChatAst.dev.blocked');
  }

  if (input.previewServerState.status === 'static') {
    return t('baseChatAst.dev.static');
  }

  if (
    input.workspaceLoading ||
    input.previewServerState.status === 'starting' ||
    input.previewServerState.status === 'stopping' ||
    command
  ) {
    if (input.previewServerState.status === 'stopping') {
      return command ? t('baseChatAst.dev.stoppingCommand', { command }) : t('baseChatAst.dev.stopping');
    }

    return command ? t('baseChatAst.dev.startingCommand', { command }) : t('baseChatAst.dev.starting');
  }

  return t('baseChatAst.dev.idle');
}
