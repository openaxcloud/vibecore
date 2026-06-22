/**
 * Pure accumulation logic for the coalesced "N files applied" auto-apply toast.
 *
 * A multi-file agent turn accepts patches one at a time (serialized), and each
 * accepted patch schedules a debounced flush of the toast. Because each accept
 * awaits a full workspace tree reload, the serialized accepts resolve with gaps
 * far larger than the debounce window, so every file triggers its own flush.
 *
 * The toast is a single coalesced toast (one toast id) that is updated in place.
 * If each flush only carried the *current* debounce batch, the in-place
 * `toast.update` would replace the rendered file list AND the "Undo all" closure
 * with the latest batch only — so the user would see a wrong file list and
 * "Undo all" would revert only the last proposal(s).
 *
 * The fix is to accumulate every applied item across flushes and emit the FULL
 * accumulated set on each flush. The buffer is only reset once the toast has
 * actually closed (dismissed / undone / auto-closed), so a fresh agent turn
 * starts a new coalesced toast rather than re-reverting already-closed batches.
 */

export interface AppliedToastItem {
  filePath: string;
  proposalId: string;
}

export interface AppliedToastSnapshot {
  /** File paths in insertion order, de-duplicated by proposal id. */
  files: string[];

  /** Proposal ids in insertion order, de-duplicated. */
  proposalIds: string[];
}

/**
 * An ordered, de-duplicated buffer of applied-file items keyed by proposal id.
 * Insertion order is preserved (a Map), and re-adding the same proposal id
 * refreshes its file path without creating a duplicate entry.
 */
export class AppliedFilesToastBuffer {
  private readonly _items = new Map<string, AppliedToastItem>();

  /** Record (or refresh) an applied item. Returns the buffer for chaining. */
  add(filePath: string, proposalId: string): this {
    this._items.set(proposalId, { filePath, proposalId });

    return this;
  }

  /** Number of distinct applied proposals currently buffered. */
  get size(): number {
    return this._items.size;
  }

  /** True when nothing has been buffered (or it was reset). */
  isEmpty(): boolean {
    return this._items.size === 0;
  }

  /**
   * Full accumulated snapshot of every item buffered so far. This is what each
   * flush must emit so the coalesced toast's in-place update carries the
   * complete file list and "Undo all" reverts every coalesced proposal.
   */
  snapshot(): AppliedToastSnapshot {
    const values = Array.from(this._items.values());

    return {
      files: values.map((item) => item.filePath),
      proposalIds: values.map((item) => item.proposalId),
    };
  }

  /** Clear all buffered items. Call this only when the toast has closed. */
  reset(): void {
    this._items.clear();
  }
}
