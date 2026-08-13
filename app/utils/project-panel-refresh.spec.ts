import { describe, expect, it } from 'vitest';

import {
  PROJECT_PANEL_DEFAULT_REFRESH_MS,
  PROJECT_PANEL_LIVE_REFRESH_MS,
  formatProjectPanelRefreshCadence,
  formatProjectPanelUpdatedLabel,
  projectPanelRefreshIntervalMs,
} from './project-panel-refresh';

describe('project panel refresh helpers', () => {
  it('uses a faster cadence for live panels', () => {
    expect(projectPanelRefreshIntervalMs('activity')).toBe(PROJECT_PANEL_LIVE_REFRESH_MS);
    expect(projectPanelRefreshIntervalMs('logs')).toBe(PROJECT_PANEL_LIVE_REFRESH_MS);
    expect(projectPanelRefreshIntervalMs('monitoring')).toBe(PROJECT_PANEL_LIVE_REFRESH_MS);
    expect(projectPanelRefreshIntervalMs('settings')).toBe(PROJECT_PANEL_DEFAULT_REFRESH_MS);
  });

  it('formats auto-refresh cadence labels', () => {
    expect(formatProjectPanelRefreshCadence(15_000)).toBe('15s');
    expect(formatProjectPanelRefreshCadence(60_000)).toBe('1m');
    expect(formatProjectPanelRefreshCadence(120_000)).toBe('2m');
  });

  it('formats freshness labels', () => {
    const now = new Date('2026-05-27T12:00:00.000Z');

    expect(formatProjectPanelUpdatedLabel(undefined, now)).toBe('Waiting for first update');
    expect(formatProjectPanelUpdatedLabel('2026-05-27T11:59:58.000Z', now)).toBe('Updated just now');
    expect(formatProjectPanelUpdatedLabel('2026-05-27T11:59:20.000Z', now)).toBe('Updated 40s ago');
    expect(formatProjectPanelUpdatedLabel('2026-05-27T11:54:00.000Z', now)).toBe('Updated 6m ago');
  });
});
