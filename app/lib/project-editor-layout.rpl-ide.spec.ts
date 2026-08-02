import { describe, expect, it } from 'vitest';
import {
  createProjectEditorWindow,
  createProjectEditorTab,
  dockPane,
  findPane,
  floatPane,
  openTabInPane,
  setSplitRatio,
  splitPane,
  updateFloatingBounds,
  type ProjectEditorPaneSplit,
} from './project-editor-layout';

/**
 * RPL-IDE-001.1/.2/.3 — the layout guarantees the Project Editor UI relies on.
 * These lock the exact engine behaviours wired into BaseChat: split H/V + resize
 * (.2) and float→dock with origin restore (.3). Window ownership of panes (.1)
 * is covered by the primary engine spec.
 */
describe('RPL-IDE Project Editor window guarantees', () => {
  function twoTabWindow() {
    let windowState = createProjectEditorWindow('window-main');
    windowState = openTabInPane(windowState, {
      paneId: 'pane-main',
      tab: createProjectEditorTab('preview', 'tab-preview'),
    });

    return windowState;
  }

  it('.2 splits a pane horizontally into a resizable two-pane tree', () => {
    const windowState = splitPane(twoTabWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      tabId: 'tab-preview',
    });

    expect(windowState.root?.type).toBe('split');
    expect((windowState.root as ProjectEditorPaneSplit).direction).toBe('horizontal');
  });

  it('.2 splits a pane vertically', () => {
    const windowState = splitPane(twoTabWindow(), { paneId: 'pane-main', direction: 'vertical', tabId: 'tab-preview' });

    expect((windowState.root as ProjectEditorPaneSplit).direction).toBe('vertical');
  });

  it('.2 persists and clamps the resized split ratio', () => {
    const split = splitPane(twoTabWindow(), { paneId: 'pane-main', direction: 'horizontal', tabId: 'tab-preview' });
    const splitId = (split.root as ProjectEditorPaneSplit).id;

    expect((setSplitRatio(split, splitId, 0.72).root as ProjectEditorPaneSplit).ratio).toBeCloseTo(0.72, 5);

    // Out-of-range ratios are clamped to the 0.1–0.9 band.
    expect((setSplitRatio(split, splitId, 0.99).root as ProjectEditorPaneSplit).ratio).toBeCloseTo(0.9, 5);
    expect((setSplitRatio(split, splitId, -1).root as ProjectEditorPaneSplit).ratio).toBeCloseTo(0.1, 5);
  });

  it('.3 floats a docked pane then docks it back to its original position', () => {
    const split = splitPane(twoTabWindow(), { paneId: 'pane-main', direction: 'horizontal', tabId: 'tab-preview' });
    const floatedId = split.activePaneId; // the freshly split-off pane

    const floated = floatPane(split, { paneId: floatedId });
    expect(floated.floatingPanes).toHaveLength(1);
    expect(findPane(floated, floatedId)).toBeDefined();

    const docked = dockPane(floated, { paneId: floatedId });
    expect(docked.floatingPanes).toHaveLength(0);

    // Origin restore returns to a split tree, not a merged single pane.
    expect(docked.root?.type).toBe('split');
  });

  it('.3 moves a floating pane and keeps it within minimum bounds', () => {
    const split = splitPane(twoTabWindow(), { paneId: 'pane-main', direction: 'horizontal', tabId: 'tab-preview' });
    const floated = floatPane(split, { paneId: split.activePaneId });
    const paneId = floated.floatingPanes[0].pane.id;

    const moved = updateFloatingBounds(floated, paneId, { x: 200, y: 120, width: 10, height: 10 });
    const bounds = moved.floatingPanes[0].bounds;

    expect(bounds.x).toBe(200);
    expect(bounds.y).toBe(120);
    expect(bounds.width).toBeGreaterThanOrEqual(280);
    expect(bounds.height).toBeGreaterThanOrEqual(180);
  });
});
