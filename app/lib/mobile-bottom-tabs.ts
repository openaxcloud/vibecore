export type MobileBottomTab = {
  id: string;
};

/**
 * Which open tabs the mobile bottom row shows.
 *
 * It used to take the FIRST `maxVisible` tabs and, when the active tab was not
 * among them, replace only the last slot: `[...first (max-1), active]`. With the
 * three core tabs (Editor, Webview, Agent) always occupying the head of the
 * list, that left exactly ONE slot for everything else — so every panel the user
 * opened evicted the one opened just before it, and panels 4..N were
 * unreachable from the row. Reported from a phone as "I open a panel and I
 * can't see it in the menu": it was there for a moment, then the next one took
 * its place.
 *
 * The row now shows the MOST RECENTLY USED tabs, which is what a tab strip is
 * for. `ensureMobileOpenTab` moves a tab to the end of the list when it is
 * opened or re-activated, so "end of list" means "most recent". The active tab
 * is always included, and the original order is preserved among the visible
 * ones so icons don't jump around between renders.
 */
export function selectVisibleMobileBottomTabs<Tab extends MobileBottomTab>(
  tabs: Tab[],
  activeTabId: string,
  maxVisible = 3,
) {
  const normalizedMax = Math.max(1, Math.floor(maxVisible));

  if (tabs.length <= normalizedMax) {
    return tabs;
  }

  const recent = tabs.slice(-normalizedMax);

  if (recent.some((tab) => tab.id === activeTabId)) {
    return recent;
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  if (!activeTab) {
    return recent;
  }

  /*
   * The active tab is older than the visible window — keep it and drop the
   * least recent of the window, so the row never hides what the user is
   * actually looking at.
   */
  const kept = [...recent.slice(1), activeTab];

  return tabs.filter((tab) => kept.some((visible) => visible.id === tab.id));
}

export function countHiddenMobileBottomTabs<Tab extends MobileBottomTab>(tabs: Tab[], visibleTabs: Tab[]) {
  const visibleTabIds = new Set(visibleTabs.map((tab) => tab.id));

  return tabs.filter((tab) => !visibleTabIds.has(tab.id)).length;
}
