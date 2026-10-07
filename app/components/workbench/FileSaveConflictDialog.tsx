import { useStore } from '@nanostores/react';
import { memo, useCallback, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import {
  clearFileSaveConflict,
  describeFileSaveConflict,
  fileSaveConflictHunks,
  fileSaveConflictStore,
} from '~/lib/stores/file-save-conflict';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

/**
 * Resolution UI for a save that lost the optimistic-concurrency race.
 *
 * Before this existed, the conflict was reported by a toast that offered no way
 * out: the tab stayed dirty, the edit was persisted nowhere, and closing the
 * file lost it (BUG-IDE-004). The dialog is deliberately non-dismissable by
 * backdrop or close button — every exit is an explicit decision about the
 * unsaved buffer.
 */
export const FileSaveConflictDialog = memo(() => {
  const conflict = useStore(fileSaveConflictStore);
  const [showDiff, setShowDiff] = useState(false);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => (conflict ? describeFileSaveConflict(conflict) : null), [conflict]);
  const hunks = useMemo(() => (conflict && showDiff ? fileSaveConflictHunks(conflict) : []), [conflict, showDiff]);

  const onKeepMine = useCallback(async () => {
    if (!conflict) {
      return;
    }

    setBusy(true);

    try {
      await workbenchStore.resolveFileConflictWithLocal(conflict.filePath);
      setShowDiff(false);
      toast.success(`Saved ${summary?.fileName ?? conflict.filePath} — your version replaced the one on disk.`);
    } catch (error) {
      toast.error(`Could not save: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }, [conflict, summary]);

  const onReload = useCallback(async () => {
    if (!conflict) {
      return;
    }

    setBusy(true);

    try {
      await workbenchStore.resolveFileConflictWithRemote(conflict.filePath, conflict.remoteContent);
      setShowDiff(false);
      toast.info(`Reloaded ${summary?.fileName ?? conflict.filePath} from disk.`);
    } finally {
      setBusy(false);
    }
  }, [conflict, summary]);

  /*
   * "Keep editing" is not a no-op dismissal: it leaves the buffer dirty and the
   * file unsaved on purpose, so the user can copy their work out or edit
   * further. The conflict re-raises on the next save attempt.
   */
  const onKeepEditing = useCallback(() => {
    if (!conflict) {
      return;
    }

    setShowDiff(false);
    clearFileSaveConflict(conflict.filePath);
    toast.warning(`${summary?.fileName ?? conflict.filePath} is still unsaved — your edit is kept in the editor.`);
  }, [conflict, summary]);

  if (!conflict || !summary) {
    return null;
  }

  return (
    <DialogRoot open={true}>
      <Dialog className="max-w-2xl" showCloseButton={false}>
        <div className="p-6">
          <DialogTitle>This file changed on disk</DialogTitle>
          <DialogDescription className="mt-2">
            <span className="font-medium text-bolt-elements-textPrimary">{summary.fileName}</span> was modified outside
            this editor (an agent run, a terminal command, or a workspace sync) after you opened it. Your unsaved edit
            is still here — choose what to keep.
          </DialogDescription>

          <div className="mt-3 text-xs text-bolt-elements-textSecondary">
            Keeping your version would apply{' '}
            <span className="text-bolt-elements-icon-success">+{summary.additions}</span>{' '}
            <span className="text-bolt-elements-icon-error">−{summary.deletions}</span> against the version on disk.
          </div>

          {showDiff && (
            <div
              className="mt-4 max-h-64 overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 font-mono text-[11px] leading-snug"
              aria-label={`Diff between the version on disk and your edit of ${summary.fileName}`}
            >
              {hunks.map((hunk) => (
                <div key={hunk.id}>
                  <div className="bg-bolt-elements-background-depth-3 px-2 py-1 text-bolt-elements-textSecondary">
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  </div>
                  {hunk.lines.map((line) => (
                    <div
                      key={line.id}
                      className={classNames('whitespace-pre-wrap break-words px-2', {
                        'bg-green-500/10 text-bolt-elements-icon-success': line.type === 'add',
                        'bg-red-500/10 text-bolt-elements-icon-error': line.type === 'remove',
                        'text-bolt-elements-textSecondary': line.type === 'context',
                      })}
                    >
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
                      {line.content}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DialogButton type="secondary" onClick={() => setShowDiff((value) => !value)} disabled={busy}>
              {showDiff ? 'Hide diff' : 'View diff'}
            </DialogButton>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <DialogButton type="secondary" onClick={onKeepEditing} disabled={busy}>
                Keep editing
              </DialogButton>
              <DialogButton type="danger" onClick={onReload} disabled={busy}>
                Reload from disk
              </DialogButton>
              <DialogButton type="primary" onClick={onKeepMine} disabled={busy}>
                Keep my version
              </DialogButton>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-bolt-elements-textTertiary">
            “Reload from disk” discards your unsaved edit. “Keep my version” overwrites the file on disk.
          </p>
        </div>
      </Dialog>
    </DialogRoot>
  );
});

FileSaveConflictDialog.displayName = 'FileSaveConflictDialog';
