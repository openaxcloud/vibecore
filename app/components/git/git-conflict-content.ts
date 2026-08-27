/*
 * Pure helpers guarding the inline merge editor against destructive empty-writes.
 *
 * A failed (or legitimately empty) conflict-content fetch must never feed an empty
 * buffer into the merge editor: parseConflicts('') yields zero conflict segments,
 * which makes the "Mark resolved" gate think every conflict is resolved and lets the
 * user overwrite the real conflicted file with '' (data loss). We treat any empty
 * fetch result as an error so the UI renders a retry state instead of the editor.
 */

export type MergeContentState = {
  content: string;
  loading: boolean;
  error?: 'empty-content' | 'load-failed';
};

/**
 * Decide whether a (successful) conflict-content fetch is usable. The merge editor
 * needs real file content to render conflict segments; an empty body means we cannot
 * safely let the user "resolve" it, because composing the result would yield ''.
 */
export function isUsableConflictContent(content: unknown): content is string {
  return typeof content === 'string' && content.length > 0;
}

/**
 * Build the merge-content state for a successful fetch, downgrading empty bodies to an
 * error so the editor is never rendered against an empty buffer.
 */
export function resolveConflictContentState(content: unknown): MergeContentState {
  if (isUsableConflictContent(content)) {
    return { content, loading: false };
  }

  return {
    content: '',
    loading: false,
    error: 'empty-content',
  };
}

/**
 * Build the merge-content state for a failed fetch (network error / non-OK response).
 */
export function failedConflictContentState(): MergeContentState {
  return {
    content: '',
    loading: false,
    error: 'load-failed',
  };
}
