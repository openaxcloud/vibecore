/**
 * RPL-IDE-001.4 — pure geometry/index maths behind dragging a Project Editor tab
 * between panes.
 *
 * Two different index conventions meet here, and conflating them is the whole
 * reason this lives in its own tested module:
 *
 * - **Slot** (what the UI computes): a position in the destination pane's tab
 *   array *as it currently stands*. `0` = before the first tab, `tabs.length` =
 *   append. This is what the engine's `moveTab` consumes for a cross-pane move,
 *   because the tab does not yet exist in the destination.
 * - **Post-removal index** (what the engine's `reorderTab` consumes): a position
 *   in the array *after* the dragged tab has been spliced out. For a same-pane
 *   reorder the two differ by one whenever the tab travels rightwards.
 */

export const TAB_DRAG_PANE_MIME = 'application/x-vibecore-pane-id';
export const TAB_DRAG_TAB_MIME = 'application/x-vibecore-tab-id';

/**
 * Which side of a tab the pointer is on, i.e. whether the drop lands before or
 * after it. Past the midpoint means "after me".
 */
export function dropSlotForTab(tabIndex: number, pointerX: number, bounds: { left: number; width: number }): number {
  return pointerX > bounds.left + bounds.width / 2 ? tabIndex + 1 : tabIndex;
}

/**
 * Convert a destination slot into the index `reorderTab` expects for a same-pane
 * move, or `null` when the move is a no-op (the tab already occupies that slot).
 */
export function samePaneReorderIndex(fromIndex: number, slot: number, tabCount: number): number | null {
  if (fromIndex < 0 || tabCount <= 1) {
    return null;
  }

  const shifted = slot > fromIndex ? slot - 1 : slot;
  const clamped = Math.max(0, Math.min(shifted, tabCount - 1));

  return clamped === fromIndex ? null : clamped;
}

/** True when a dragover carries a Project Editor tab payload. */
export function isProjectEditorTabDrag(types: readonly string[] | DOMStringList): boolean {
  return Array.from(types as readonly string[]).includes(TAB_DRAG_TAB_MIME);
}
