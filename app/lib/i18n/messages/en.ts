/**
 * English (seed) translation bundle. Sprint 7 / Phase 0 #7.
 *
 * Keys follow `<namespace>.<key>` convention. The dictionary type is
 * derived from this object so every other language must keep the same
 * shape (Partial<typeof en>).
 */

export const en = {
  // Patch review panel
  'patchReview.title': 'Files changed',
  'patchReview.filesCount': '{count} files',
  'patchReview.aggregateAriaLabel': '{added} added, {removed} removed across {files} files',
  'patchReview.applyAll': 'Apply all ({count})',
  'patchReview.applying': 'Applying…',
  'patchReview.noChanges': 'Content is identical to the file on disk.',
  'patchReview.streaming': 'Streaming patch…',

  // File mentions palette
  'mentions.empty': 'No matching files',

  // Slash commands palette
  'slashCommands.empty': 'No matching commands',

  // Plan checklist
  'plan.progressLabel': '{completed} / {total} complete',
  'plan.progressLabelWithFailed': '{completed} / {total} complete · {failed} failed',
  'plan.statusPending': 'Pending',
  'plan.statusInProgress': 'In progress',
  'plan.statusCompleted': 'Done',
  'plan.statusFailed': 'Failed',

  // Conversation branches dropdown
  'branches.ariaLabel': 'Conversation branches ({count})',
  'branches.trigger.title': 'Browse conversation branches',
  'branches.row.switch': 'Switch to {label}',
  'branches.row.rename': 'Rename {label}',
  'branches.row.delete': 'Delete {label}',
  'branches.row.deleteTitle': 'Delete branch (and descendants)',
  'branches.row.renameTitle': 'Rename branch',
  'branches.switchedToast': 'Switched conversation',
  'branches.switchFailedToast': 'Could not switch — conversation missing',
  'branches.renamePrompt': 'Rename branch',
  'branches.emptyTitleToast': 'Title cannot be empty',
  'branches.deleteConfirm': 'Delete this branch and any sub-branches?',
  'branches.deletedToast': 'Branch deleted',

  // Share view (read-only landing)
  'share.fallbackTitle': 'Shared conversation',
  'share.metaPrefix': 'Shared from project',
  'share.disclaimer': 'This is a read-only snapshot of the conversation. {count} message{plural} in the bundle.',
  'share.errorTitle': 'Share link unavailable',
  'share.errorDefault': 'The link payload could not be decoded.',
  'share.forkButton': 'Fork this conversation (sign in to enable)',

  // Presence avatars
  'presence.viewersAriaLabel': '{count} viewers',
  'presence.overflowAriaLabel': '{count} more viewers',
  'presence.statusTyping': 'typing',
  'presence.statusViewing': 'viewing',
  'presence.statusIdle': 'idle',

  // Share button
  'shareButton.label': 'Share this conversation',
  'shareButton.disabled': 'Send at least one message before sharing',
  'shareButton.enabled': 'Copy a share link to this conversation',
  'shareButton.copiedToast': 'Share link copied to clipboard',
  'shareButton.errorCouldNotBuild': 'Could not build share link',
  'shareButton.errorClipboard': 'Built share link but clipboard copy failed',
} as const;
