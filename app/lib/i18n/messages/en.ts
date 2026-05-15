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
} as const;
