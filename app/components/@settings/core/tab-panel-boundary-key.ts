import type { TabType } from './types';

/**
 * Build the React `key` for the per-tab error boundary in {@link ControlPanel}.
 *
 * The key MUST encode the tab being rendered, not just the retry counter.
 * `TabPanelBoundary` keeps its `{ hasError }` componentState across re-renders
 * at the same tree position+key. When the active settings tab switches directly
 * from one tab to another (e.g. the header AvatarDropdown jumps straight to
 * Profile/Settings without first returning to the tile grid), a key based only
 * on the retry counter would reconcile the *same* boundary instance — so a
 * `hasError=true` state from a previously failed lazy chunk import would leak
 * onto the new, perfectly loadable tab, showing a stale "Couldn't load this
 * section" fallback.
 *
 * Including `tabId` forces React to unmount the errored boundary and mount a
 * clean one (`hasError=false`) on any tab change, while bumping `reloadKey`
 * still forces a fresh remount of the *same* tab when the user clicks "Retry".
 */
export function getTabPanelBoundaryKey(tabId: TabType, reloadKey: number): string {
  return `${tabId}-${reloadKey}`;
}
