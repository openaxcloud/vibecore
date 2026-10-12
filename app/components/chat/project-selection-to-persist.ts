/** Choose the UI selection while file hydration is still resolving the saved path. */
export function projectSelectionToPersist(selected: string | undefined, pending: string | undefined) {
  return pending ?? selected;
}
