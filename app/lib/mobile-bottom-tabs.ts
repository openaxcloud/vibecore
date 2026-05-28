export type MobileBottomTab = {
  id: string;
};

export function selectVisibleMobileBottomTabs<Tab extends MobileBottomTab>(
  tabs: Tab[],
  activeTabId: string,
  maxVisible = 3,
) {
  const normalizedMax = Math.max(1, Math.floor(maxVisible));
  const firstTabs = tabs.slice(0, normalizedMax);

  if (firstTabs.some((tab) => tab.id === activeTabId)) {
    return firstTabs;
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  if (!activeTab) {
    return firstTabs;
  }

  return [...firstTabs.slice(0, normalizedMax - 1), activeTab];
}

export function countHiddenMobileBottomTabs<Tab extends MobileBottomTab>(tabs: Tab[], visibleTabs: Tab[]) {
  const visibleTabIds = new Set(visibleTabs.map((tab) => tab.id));

  return tabs.filter((tab) => !visibleTabIds.has(tab.id)).length;
}
