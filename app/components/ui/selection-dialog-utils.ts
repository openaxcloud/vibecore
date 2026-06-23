/**
 * Returns whether every selectable item is currently selected.
 *
 * Used by SelectionDialog to derive the "Select All" / "Deselect All" toggle
 * label directly from the live selection. Deriving it (rather than tracking a
 * separate `selectAll` boolean) keeps the label in sync when items are toggled
 * one-by-one.
 *
 * An empty list is treated as NOT all-selected so the dialog never claims a
 * non-existent selection is complete.
 */
export function isAllSelected(selectedCount: number, totalCount: number): boolean {
  return totalCount > 0 && selectedCount === totalCount;
}
