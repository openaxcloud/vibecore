import { describe, expect, it } from 'vitest';
import { countHiddenMobileBottomTabs, selectVisibleMobileBottomTabs } from './mobile-bottom-tabs';

/*
 * Reported from a phone: "I open a panel and I can't see it in the menu."
 *
 * The row used to pin the FIRST tabs and give the active one a single trailing
 * slot, so with three core tabs at the head of the list every panel the user
 * opened evicted the one opened just before it. Reproduced live at 390px:
 *
 *   initial        : editor · preview · agent · deployments
 *   after Security : editor · preview · agent · security      (deployments gone)
 *   after Skills   : editor · preview · agent · skills        (security gone)
 *   after Ports    : editor · preview · agent · ports         (skills gone)
 *
 * The two assertions below used to REQUIRE that behaviour — they froze the
 * defect. The row now shows the most recently used tabs, which is what a tab
 * strip is for.
 */
const tabs = [
  { id: 'preview', name: 'Webview' },
  { id: 'agent', name: 'AI Agent' },
  { id: 'deployments', name: 'Deployments' },
  { id: 'settings', name: 'Settings' },
  { id: 'database', name: 'Database' },
];

describe('mobile bottom tabs', () => {
  it('shows the most recently used tabs, so a freshly opened panel stays visible', () => {
    expect(selectVisibleMobileBottomTabs(tabs, 'database').map((tab) => tab.id)).toEqual([
      'deployments',
      'settings',
      'database',
    ]);
  });

  it('never hides the tab the user is actually looking at', () => {
    const visible = selectVisibleMobileBottomTabs(tabs, 'preview').map((tab) => tab.id);

    expect(visible).toContain('preview');
    expect(visible).toHaveLength(3);
  });

  it('keeps the list order stable when the active tab is older than the window', () => {
    expect(selectVisibleMobileBottomTabs(tabs, 'agent').map((tab) => tab.id)).toEqual([
      'agent',
      'settings',
      'database',
    ]);
  });

  it('returns every tab when they all fit', () => {
    expect(selectVisibleMobileBottomTabs(tabs.slice(0, 3), 'agent', 4).map((tab) => tab.id)).toEqual([
      'preview',
      'agent',
      'deployments',
    ]);
  });

  it('no longer evicts the previously opened panel — the reported symptom', () => {
    const core = [{ id: 'editor' }, { id: 'preview' }, { id: 'agent' }];

    // L'utilisateur ouvre Sécurité, puis Compétences : les deux doivent rester joignables.
    const afterSecurity = selectVisibleMobileBottomTabs([...core, { id: 'security' }], 'security', 4);
    expect(afterSecurity.map((tab) => tab.id)).toContain('security');

    const afterSkills = selectVisibleMobileBottomTabs([...core, { id: 'security' }, { id: 'skills' }], 'skills', 4);
    expect(afterSkills.map((tab) => tab.id)).toEqual(['preview', 'agent', 'security', 'skills']);
  });

  it('counts the tabs that rotated out of the row', () => {
    const visibleTabs = selectVisibleMobileBottomTabs(tabs, 'database');

    expect(countHiddenMobileBottomTabs(tabs, visibleTabs)).toBe(2);
  });
});
