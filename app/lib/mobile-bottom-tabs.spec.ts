import { describe, expect, it } from 'vitest';
import { countHiddenMobileBottomTabs, selectVisibleMobileBottomTabs } from './mobile-bottom-tabs';

const tabs = [
  { id: 'preview', name: 'Webview' },
  { id: 'agent', name: 'AI Agent' },
  { id: 'deployments', name: 'Deployments' },
  { id: 'settings', name: 'Settings' },
  { id: 'database', name: 'Database' },
];

describe('mobile bottom tabs', () => {
  it('keeps the active tab visible when it is outside the first mobile slots', () => {
    expect(selectVisibleMobileBottomTabs(tabs, 'settings').map((tab) => tab.id)).toEqual([
      'preview',
      'agent',
      'settings',
    ]);
  });

  it('keeps the default first tabs when the active tab is already visible', () => {
    expect(selectVisibleMobileBottomTabs(tabs, 'agent').map((tab) => tab.id)).toEqual([
      'preview',
      'agent',
      'deployments',
    ]);
  });

  it('counts hidden tabs after active-tab promotion', () => {
    const visibleTabs = selectVisibleMobileBottomTabs(tabs, 'settings');

    expect(countHiddenMobileBottomTabs(tabs, visibleTabs)).toBe(2);
  });
});
