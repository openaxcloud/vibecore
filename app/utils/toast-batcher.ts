import { toast } from 'react-toastify';

import { AGENT_APPLIED_TOAST_ID, showCoalescedAppliedToast } from '~/components/chat/AppliedFilesToast';
import {
  formatClientRuntimeUndoFailure,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { getI18nInstance } from '~/lib/i18n/runtime';

const COALESCE_WINDOW_MS = 800;

export interface BatchedFileApplied {
  filePath: string;
  undo?: () => void | Promise<void>;
}

interface BatcherState {
  buffer: Map<string, BatchedFileApplied>;
  timer: ReturnType<typeof setTimeout> | null;
  emit: (entries: BatchedFileApplied[]) => void;
}

/**
 * Runs every undo callback, awaiting async reverts (e.g. remote file writes that can reject with
 * 'Remote file changed', a 5xx, or a locked file). Returns the number of reverts that failed so the
 * caller can decide whether to report a partial-failure to the user instead of silently claiming
 * that every change was undone.
 */
export async function runUndos(undos: ReadonlyArray<NonNullable<BatchedFileApplied['undo']>>): Promise<number> {
  /*
   * Wrap in Promise.resolve().then(undo) so a *synchronous* throw is captured as a settled
   * rejection rather than throwing out of the .map() and rejecting the whole batch.
   */
  const results = await Promise.allSettled(undos.map((undo) => Promise.resolve().then(undo)));

  return results.filter((result) => result.status === 'rejected').length;
}

function defaultEmit(entries: BatchedFileApplied[]): void {
  const files = entries.map((entry) => entry.filePath);

  const undos = entries
    .map((entry) => entry.undo)
    .filter((undo): undo is NonNullable<BatchedFileApplied['undo']> => Boolean(undo));

  showCoalescedAppliedToast(files, {
    onUndoAll: () => {
      runUndos(undos)
        .then((failures) => {
          if (failures > 0) {
            const i18n = getI18nInstance();
            toast.error(formatClientRuntimeUndoFailure(failures, i18n.resolvedLanguage ?? i18n.language));
          } else {
            toast.dismiss(AGENT_APPLIED_TOAST_ID);
          }
        })
        .catch(() => {
          const i18n = getI18nInstance();
          const copy = getClientRuntimeResidualCopy(i18n.resolvedLanguage ?? i18n.language);
          toast.error(copy['clientRuntime.undo.failedGeneric']);
        });
    },
  });
}

const state: BatcherState = {
  buffer: new Map(),
  timer: null,
  emit: defaultEmit,
};

function flushNow(): void {
  state.timer = null;

  if (state.buffer.size === 0) {
    return;
  }

  const entries = Array.from(state.buffer.values());
  state.buffer.clear();
  state.emit(entries);
}

export function batchFileApplied(entry: BatchedFileApplied): void {
  state.buffer.set(entry.filePath, entry);

  if (state.timer) {
    clearTimeout(state.timer);
  }

  state.timer = setTimeout(flushNow, COALESCE_WINDOW_MS);
}

export function flushPendingToastBatch(): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  flushNow();
}

export function resetToastBatcher(emit: (entries: BatchedFileApplied[]) => void = defaultEmit): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  state.buffer.clear();
  state.emit = emit;
}
