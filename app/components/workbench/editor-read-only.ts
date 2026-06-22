/**
 * Decide whether the code editor should be read-only for the currently open file.
 *
 * The editor must NOT go globally read-only just because an agent is streaming —
 * in a multi-task / multi-agent flow the user keeps editing files the agent is
 * not touching. Edit-blocking is scoped to the specific file the agent currently
 * holds a lock on (the lock map), plus the trivial "no document open" case.
 */
export interface EditorReadOnlyInput {
  /** True when no document is open in the editor. */
  hasDocument: boolean;

  /** True when the currently open file is locked (per the lock map). */
  isCurrentFileLocked: boolean;
}

export function shouldEditorBeReadOnly({ hasDocument, isCurrentFileLocked }: EditorReadOnlyInput): boolean {
  if (!hasDocument) {
    return true;
  }

  return isCurrentFileLocked;
}
