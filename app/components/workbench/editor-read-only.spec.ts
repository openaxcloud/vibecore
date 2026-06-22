import { describe, expect, it } from 'vitest';
import { shouldEditorBeReadOnly } from './editor-read-only';

describe('shouldEditorBeReadOnly', () => {
  it('is read-only when no document is open', () => {
    expect(shouldEditorBeReadOnly({ hasDocument: false, isCurrentFileLocked: false })).toBe(true);
    expect(shouldEditorBeReadOnly({ hasDocument: false, isCurrentFileLocked: true })).toBe(true);
  });

  it('is editable when a document is open and the file is not locked', () => {
    expect(shouldEditorBeReadOnly({ hasDocument: true, isCurrentFileLocked: false })).toBe(false);
  });

  it('is read-only only for the locked file, never globally during a stream', () => {
    /*
     * Regression: the editor used to go read-only for ALL files whenever any agent
     * was streaming. The decision must depend solely on whether THIS file is locked,
     * so an unrelated file the agent is not touching stays editable mid-stream.
     */
    expect(shouldEditorBeReadOnly({ hasDocument: true, isCurrentFileLocked: false })).toBe(false);
    expect(shouldEditorBeReadOnly({ hasDocument: true, isCurrentFileLocked: true })).toBe(true);
  });
});
