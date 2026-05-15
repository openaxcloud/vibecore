import { toast } from 'react-toastify';

import { AGENT_APPLIED_TOAST_ID, showCoalescedAppliedToast } from '~/components/chat/AppliedFilesToast';

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

function defaultEmit(entries: BatchedFileApplied[]): void {
  const files = entries.map((entry) => entry.filePath);

  const undos = entries
    .map((entry) => entry.undo)
    .filter((undo): undo is NonNullable<BatchedFileApplied['undo']> => Boolean(undo));

  showCoalescedAppliedToast(files, {
    onUndoAll: () => {
      for (const undo of undos) {
        void undo();
      }

      toast.dismiss(AGENT_APPLIED_TOAST_ID);
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
