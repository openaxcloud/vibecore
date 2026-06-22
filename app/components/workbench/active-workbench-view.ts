import type { WorkbenchViewType } from '~/lib/stores/workbench';

export type MobileWorkbenchPanel = 'files' | 'editor' | 'search' | 'locks' | 'terminal' | 'preview' | 'deploy';

/*
 * Resolves which workbench View slides into x:0% given the layout mode.
 *
 * On desktop the active view is exactly the user-selected tab. On
 * mobile/tablet the workbench is driven by the bottom-nav `mobilePanel`,
 * EXCEPT for the diff/Review view: the mobile editor toolbar's "Review"
 * button toggles `selectedView` to 'diff' (there is no diff bottom-nav
 * panel), so the diff selection must be honored here. Without this, tapping
 * Review on mobile mutates `selectedView` but `activeWorkbenchView` stays
 * 'code' and the DiffView never animates into view — making the agent's
 * proposed file changes unreviewable on mobile.
 */
export function resolveActiveWorkbenchView(args: {
  useMobileWorkbench: boolean;
  mobilePanel: MobileWorkbenchPanel | undefined;
  selectedView: WorkbenchViewType;
}): WorkbenchViewType {
  const { useMobileWorkbench, mobilePanel, selectedView } = args;

  if (!useMobileWorkbench) {
    return selectedView;
  }

  if (mobilePanel === 'preview') {
    return 'preview';
  }

  if (selectedView === 'diff') {
    return 'diff';
  }

  return 'code';
}
