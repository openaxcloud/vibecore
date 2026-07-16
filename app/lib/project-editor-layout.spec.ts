import { describe, expect, it } from 'vitest';
import {
  assertProjectEditorLayoutInvariants,
  bringFloatingPaneToFront,
  collapseEmptyPanes,
  collectPanes,
  createProjectEditorLayout,
  createProjectEditorPane,
  createProjectEditorTab,
  createProjectEditorWindow,
  createProjectEditorWindowForTab,
  dockPane,
  findPane,
  findPaneContainingTab,
  floatPane,
  getProjectEditorLayoutInvariantViolations,
  migrateLegacyProjectEditorLayout,
  moveTab,
  normalizeProjectEditorLayout,
  normalizeProjectEditorWindow,
  openTabInPane,
  PROJECT_EDITOR_LAYOUT_VERSION,
  PROJECT_EDITOR_TOOLS,
  projectEditorLayoutReducer,
  reorderTab,
  setMaximizedPane,
  setSplitRatio,
  splitPane,
  toggleMaximizedPane,
  updateFloatingBounds,
  updatePane,
  type ProjectEditorLayoutState,
  type ProjectEditorPaneLeaf,
  type ProjectEditorPaneSplit,
  type ProjectEditorWindowState,
} from './project-editor-layout';

function asSplit(windowState: ProjectEditorWindowState): ProjectEditorPaneSplit {
  expect(windowState.root?.type).toBe('split');
  return windowState.root as ProjectEditorPaneSplit;
}

function asLeaf(windowState: ProjectEditorWindowState): ProjectEditorPaneLeaf {
  expect(windowState.root?.type).toBe('leaf');
  return windowState.root as ProjectEditorPaneLeaf;
}

function wrapWindow(windowState: ProjectEditorWindowState): ProjectEditorLayoutState {
  return {
    version: PROJECT_EDITOR_LAYOUT_VERSION,
    activeWindowId: windowState.id,
    windows: { [windowState.id]: windowState },
  };
}

function expectValid(windowState: ProjectEditorWindowState) {
  expect(() => assertProjectEditorLayoutInvariants(wrapWindow(windowState))).not.toThrow();
}

describe('Project Editor layout creation and migration', () => {
  it('creates a valid Window → Pane → Tab hierarchy', () => {
    const layout = createProjectEditorLayout('window-primary');
    const windowState = layout.windows['window-primary'];
    const pane = asLeaf(windowState);

    expect(layout).toMatchObject({
      version: PROJECT_EDITOR_LAYOUT_VERSION,
      activeWindowId: 'window-primary',
    });
    expect(pane.tabs).toEqual([{ id: 'tab-editor', panel: 'editor' }]);
    expect(pane.activeTabId).toBe('tab-editor');
    expect(windowState.activePaneId).toBe(pane.id);
    expect(PROJECT_EDITOR_TOOLS).toEqual(expect.arrayContaining(['studio', 'skills', 'ports']));
    assertProjectEditorLayoutInvariants(layout);
  });

  it('migrates a legacy horizontal paneTree and supplies strict fields', () => {
    const migrated = migrateLegacyProjectEditorLayout(
      {
        ui: {
          paneTree: {
            type: 'split',
            id: 'split-root',
            direction: 'horizontal',
            first: {
              type: 'leaf',
              id: 'pane-code',
              tabs: [{ id: 'tab-code', panel: 'editor' }],
              activeTabId: 'missing-tab',
            },
            second: {
              type: 'leaf',
              id: 'pane-preview',
              tabs: [{ id: 'tab-preview', panel: 'webview' }],
            },
          },
          activePaneId: 'pane-preview',
        },
      },
      { windowId: 'window-legacy' },
    );

    const windowState = migrated.windows['window-legacy'];
    const root = asSplit(windowState);

    expect(root.direction).toBe('horizontal');
    expect(root.ratio).toBe(0.5);
    expect(findPane(windowState, 'pane-code')?.activeTabId).toBe('tab-code');
    expect(findPane(windowState, 'pane-preview')?.tabs[0].panel).toBe('preview');
    expect(windowState.activePaneId).toBe('pane-preview');
    assertProjectEditorLayoutInvariants(migrated);
  });

  it('normalizes vertical splits, ratios, duplicate ids and invalid persisted tools', () => {
    const normalized = normalizeProjectEditorLayout({
      version: 1,
      activeWindowId: 'missing-window',
      windows: {
        'window-one': {
          id: 'wrong-id',
          root: {
            type: 'split',
            id: 'node',
            direction: 'vertical',
            ratio: 4,
            first: {
              type: 'leaf',
              id: 'node',
              tabs: [
                { id: 'tab', panel: 'editor' },
                { id: 'tab', panel: 'skills' },
              ],
              activeTabId: 'not-present',
            },
            second: {
              type: 'leaf',
              id: 'node',
              tabs: [{ id: 'broken', panel: 'unsupported' }],
            },
          },
          activePaneId: 'not-present',
          maximizedPaneId: 'not-present',
        },
      },
    });

    const windowState = normalized.windows['window-one'];
    const root = asSplit(windowState);
    const panes = collectPanes(windowState);

    expect(windowState.id).toBe('window-one');
    expect(normalized.activeWindowId).toBe('window-one');
    expect(root.direction).toBe('vertical');
    expect(root.ratio).toBe(0.9);
    expect(new Set(panes.map((pane) => pane.id)).size).toBe(2);
    expect(new Set(panes.flatMap((pane) => pane.tabs.map((tab) => tab.id))).size).toBe(3);
    expect(panes[1].tabs).toEqual([expect.objectContaining({ panel: 'editor' })]);
    expect(windowState.maximizedPaneId).toBeUndefined();
    assertProjectEditorLayoutInvariants(normalized);
  });

  it('normalizes independent Windows by windowId', () => {
    const normalized = normalizeProjectEditorLayout({
      activeWindowId: 'window-two',
      windows: {
        'window-one': createProjectEditorWindow('window-one'),
        'window-two': createProjectEditorWindow(
          'window-two',
          createProjectEditorPane('pane-two', [createProjectEditorTab('preview', 'tab-two')]),
        ),
      },
    });

    expect(Object.keys(normalized.windows)).toEqual(['window-one', 'window-two']);
    expect(normalized.activeWindowId).toBe('window-two');
    expect(findPane(normalized.windows['window-two'], 'pane-two')?.tabs[0].panel).toBe('preview');
    assertProjectEditorLayoutInvariants(normalized);
  });

  it('recovers an empty or malformed legacy value with a real editor tool', () => {
    for (const input of [undefined, null, {}, { paneTree: { type: 'unknown' } }]) {
      const normalized = normalizeProjectEditorLayout(input);
      const windowState = normalized.windows[normalized.activeWindowId];

      expect(collectPanes(windowState)).toHaveLength(1);
      expect(collectPanes(windowState)[0].tabs[0].panel).toBe('editor');
      assertProjectEditorLayoutInvariants(normalized);
    }
  });
});

describe('document-backed editor tabs', () => {
  it('preserves the selected tool and document when opening a browser Window', () => {
    const sourceTab = {
      id: 'tab-app',
      panel: 'editor' as const,
      filePath: '/workspace/src/App.tsx',
      pinned: true,
      preview: false,
    };

    const windowState = createProjectEditorWindowForTab('window-app', sourceTab);

    expect(asLeaf(windowState)).toMatchObject({
      activeTabId: 'tab-app',
      tabs: [sourceTab],
    });
    expect(windowState.id).toBe('window-app');
    expectValid(windowState);
  });

  it('binds the first file to an empty editor Tab without changing its identity', () => {
    const source = createProjectEditorWindow();

    const opened = openTabInPane(source, {
      paneId: 'pane-main',
      tab: { id: 'tab-app-request', panel: 'editor', filePath: '/workspace/src/App.tsx', preview: false },
    });

    expect(findPane(opened, 'pane-main')).toMatchObject({
      activeTabId: 'tab-editor',
      tabs: [{ id: 'tab-editor', panel: 'editor', filePath: '/workspace/src/App.tsx', preview: false }],
    });
    expect(source).not.toEqual(opened);
    expect(findPane(source, 'pane-main')?.tabs[0]).not.toHaveProperty('filePath');
    expectValid(opened);
  });

  it('keeps different documents bound to their own Tabs across Panes', () => {
    const split = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      newPaneId: 'pane-right',
      newTabId: 'tab-editor-right',
    });
    const withApp = openTabInPane(split, {
      paneId: 'pane-main',
      tab: { id: 'tab-app-request', panel: 'editor', filePath: '/workspace/src/App.tsx', preview: false },
    });
    const withBoth = openTabInPane(withApp, {
      paneId: 'pane-right',
      tab: { id: 'tab-main-request', panel: 'editor', filePath: '/workspace/src/main.tsx', preview: false },
    });

    expect(findPane(withBoth, 'pane-main')?.tabs).toEqual([
      { id: 'tab-editor', panel: 'editor', filePath: '/workspace/src/App.tsx', preview: false },
    ]);
    expect(findPane(withBoth, 'pane-right')?.tabs).toEqual([
      { id: 'tab-editor-right', panel: 'editor', filePath: '/workspace/src/main.tsx', preview: false },
    ]);
    expect(findPane(withBoth, 'pane-main')?.activeTabId).toBe('tab-editor');
    expect(findPane(withBoth, 'pane-right')?.activeTabId).toBe('tab-editor-right');
    expectValid(withBoth);
  });

  it('does not replace a document Tab with a blank Editor during URL panel synchronization', () => {
    let windowState = openTabInPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      tab: { id: 'tab-app-request', panel: 'editor', filePath: '/workspace/src/App.tsx', preview: false },
    });

    windowState = openTabInPane(windowState, {
      paneId: 'pane-main',
      tab: { id: 'tab-empty-request', panel: 'editor' },
    });

    expect(findPane(windowState, 'pane-main')).toMatchObject({
      activeTabId: 'tab-editor',
      tabs: [{ id: 'tab-editor', panel: 'editor', filePath: '/workspace/src/App.tsx', preview: false }],
    });
    expectValid(windowState);
  });

  it('reuses only preview Tabs and never demotes a permanent editor', () => {
    let windowState = openTabInPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      tab: { id: 'tab-preview-request', panel: 'editor', filePath: '/workspace/src/App.tsx', preview: true },
    });
    windowState = openTabInPane(windowState, {
      paneId: 'pane-main',
      tab: { id: 'tab-preview-replacement', panel: 'editor', filePath: '/workspace/src/main.tsx', preview: true },
    });

    expect(findPane(windowState, 'pane-main')?.tabs).toEqual([
      { id: 'tab-editor', panel: 'editor', filePath: '/workspace/src/main.tsx', preview: true },
    ]);

    windowState = openTabInPane(windowState, {
      paneId: 'pane-main',
      tab: { id: 'tab-main-permanent', panel: 'editor', filePath: '/workspace/src/main.tsx', preview: false },
    });
    windowState = openTabInPane(windowState, {
      paneId: 'pane-main',
      tab: { id: 'tab-main-preview-again', panel: 'editor', filePath: '/workspace/src/main.tsx', preview: true },
    });

    expect(findPane(windowState, 'pane-main')?.tabs).toEqual([
      { id: 'tab-editor', panel: 'editor', filePath: '/workspace/src/main.tsx', preview: false },
    ]);
    expectValid(windowState);
  });
});

describe('splitPane', () => {
  it('creates a resizable horizontal split and moves a selected tab', () => {
    const source = createProjectEditorWindow(
      'window-main',
      createProjectEditorPane(
        'pane-main',
        [createProjectEditorTab('editor', 'tab-editor'), createProjectEditorTab('preview', 'tab-preview')],
        'tab-preview',
      ),
    );

    const snapshot = structuredClone(source);

    const result = splitPane(source, {
      paneId: 'pane-main',
      direction: 'horizontal',
      tabId: 'tab-preview',
      newPaneId: 'pane-right',
      splitId: 'split-root',
      ratio: 0.35,
    });

    const root = asSplit(result);

    expect(source).toEqual(snapshot);
    expect(root).toMatchObject({ id: 'split-root', direction: 'horizontal', ratio: 0.35 });
    expect(root.first).toMatchObject({ id: 'pane-main', tabs: [{ id: 'tab-editor' }] });
    expect(root.second).toMatchObject({ id: 'pane-right', tabs: [{ id: 'tab-preview' }] });
    expect(result.activePaneId).toBe('pane-right');
    expectValid(result);
  });

  it('creates a vertical split from a one-tab Pane by cloning the real tool', () => {
    const source = createProjectEditorWindow();

    const result = splitPane(source, {
      paneId: 'pane-main',
      direction: 'vertical',
      placement: 'before',
      newPaneId: 'pane-bottom',
      newTabId: 'tab-editor-copy',
      splitId: 'split-down',
    });

    const root = asSplit(result);

    expect(root.direction).toBe('vertical');
    expect(root.first).toMatchObject({ id: 'pane-bottom', tabs: [{ id: 'tab-editor-copy', panel: 'editor' }] });
    expect(root.second).toMatchObject({ id: 'pane-main', tabs: [{ id: 'tab-editor', panel: 'editor' }] });
    expect(collectPanes(result).flatMap((pane) => pane.tabs)).toHaveLength(2);
    expectValid(result);
  });

  it('uses explicit tabs, collision-safe ids and clamped ratios', () => {
    const source = createProjectEditorWindow();

    const result = splitPane(source, {
      paneId: 'pane-main',
      direction: 'horizontal',
      ratio: -5,
      newPaneId: 'pane-main',
      splitId: 'pane-main',
      newTab: createProjectEditorTab('studio', 'tab-editor'),
    });

    const root = asSplit(result);

    expect(root.ratio).toBe(0.1);
    expect(root.id).not.toBe('pane-main');
    expect(root.second.id).not.toBe('pane-main');
    expect((root.second as ProjectEditorPaneLeaf).tabs[0]).toMatchObject({ panel: 'studio' });
    expect((root.second as ProjectEditorPaneLeaf).tabs[0].id).not.toBe('tab-editor');
    expectValid(result);
  });
});

describe('tab movement and Pane collapse', () => {
  it('moves rather than swaps a tab and collapses the empty source Pane', () => {
    const split = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      newPaneId: 'pane-right',
      newTabId: 'tab-preview',
      newTab: createProjectEditorTab('preview', 'tab-preview'),
    });

    const snapshot = structuredClone(split);

    const moved = moveTab(split, {
      sourcePaneId: 'pane-right',
      tabId: 'tab-preview',
      targetPaneId: 'pane-main',
      toIndex: 0,
    });

    const remaining = asLeaf(moved);

    expect(split).toEqual(snapshot);
    expect(remaining.id).toBe('pane-main');
    expect(remaining.tabs.map((tab) => tab.id)).toEqual(['tab-preview', 'tab-editor']);
    expect(remaining.activeTabId).toBe('tab-preview');
    expect(findPane(moved, 'pane-right')).toBeUndefined();
    expectValid(moved);
  });

  it('moves between docked and floating Panes without duplicating either tab', () => {
    let windowState = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      newPaneId: 'pane-right',
      newTab: createProjectEditorTab('preview', 'tab-preview'),
    });
    windowState = floatPane(windowState, { paneId: 'pane-right' });
    windowState = moveTab(windowState, {
      sourcePaneId: 'pane-main',
      tabId: 'tab-editor',
      targetPaneId: 'pane-right',
    });

    expect(windowState.root).toBeNull();
    expect(windowState.floatingPanes).toHaveLength(1);
    expect(findPane(windowState, 'pane-right')?.tabs.map((tab) => tab.id)).toEqual(['tab-preview', 'tab-editor']);
    expect(collectPanes(windowState).flatMap((pane) => pane.tabs)).toHaveLength(2);
    expectValid(windowState);
  });

  it('reorders within the same Pane with stable final-index semantics', () => {
    const source = createProjectEditorWindow(
      'window-main',
      createProjectEditorPane('pane-main', [
        createProjectEditorTab('editor', 'a'),
        createProjectEditorTab('preview', 'b'),
        createProjectEditorTab('files', 'c'),
      ]),
    );

    const reordered = reorderTab(source, { paneId: 'pane-main', tabId: 'a', toIndex: 2 });

    const movedThroughGenericApi = moveTab(reordered, {
      tabId: 'c',
      targetPaneId: 'pane-main',
      toIndex: 0,
    });

    expect(findPane(reordered, 'pane-main')?.tabs.map((tab) => tab.id)).toEqual(['b', 'c', 'a']);
    expect(findPane(movedThroughGenericApi, 'pane-main')?.tabs.map((tab) => tab.id)).toEqual(['c', 'b', 'a']);
    expectValid(movedThroughGenericApi);
  });

  it('returns the same state when source, target, tab or Pane is absent', () => {
    const source = createProjectEditorWindow();

    expect(moveTab(source, { tabId: 'missing', targetPaneId: 'pane-main' })).toBe(source);
    expect(moveTab(source, { tabId: 'tab-editor', targetPaneId: 'missing' })).toBe(source);
    expect(reorderTab(source, { paneId: 'missing', tabId: 'tab-editor', toIndex: 0 })).toBe(source);
  });
});

describe('floating and docking Panes', () => {
  it('floats the only Pane without inventing or duplicating a fallback Pane', () => {
    const source = createProjectEditorWindow();

    const floated = floatPane(source, {
      paneId: 'pane-main',
      floatingId: 'floating-main',
      bounds: { x: 12, y: 24, width: 640, height: 420 },
    });

    expect(floated.root).toBeNull();
    expect(floated.floatingPanes).toEqual([
      expect.objectContaining({
        id: 'floating-main',
        pane: expect.objectContaining({ id: 'pane-main' }),
        bounds: { x: 12, y: 24, width: 640, height: 420 },
      }),
    ]);
    expect(collectPanes(floated)).toHaveLength(1);
    expectValid(floated);
  });

  it('updates a floating Pane through the same find/update helpers', () => {
    let windowState = floatPane(createProjectEditorWindow(), { paneId: 'pane-main' });
    windowState = updatePane(windowState, 'pane-main', (pane) => ({
      ...pane,
      tabs: [...pane.tabs, createProjectEditorTab('ports', 'tab-ports')],
      activeTabId: 'tab-ports',
    }));

    expect(findPane(windowState, 'pane-main')?.tabs.map((tab) => tab.panel)).toEqual(['editor', 'ports']);
    expect(findPaneContainingTab(windowState, 'tab-ports')?.id).toBe('pane-main');
    expectValid(windowState);
  });

  it('clamps floating bounds and can bring a Pane to front', () => {
    let windowState = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      newPaneId: 'pane-second',
    });
    windowState = floatPane(windowState, { paneId: 'pane-second' });
    windowState = floatPane(windowState, { paneId: 'pane-main' });

    const firstZ = windowState.floatingPanes.find((entry) => entry.pane.id === 'pane-second')!.zIndex;

    windowState = updateFloatingBounds(windowState, 'pane-second', {
      x: -200,
      y: Number.NaN,
      width: 20,
      height: 30,
    });
    windowState = bringFloatingPaneToFront(windowState, 'pane-second');

    const floating = windowState.floatingPanes.find((entry) => entry.pane.id === 'pane-second')!;

    expect(floating.bounds).toEqual({ x: 0, y: 72, width: 280, height: 180 });
    expect(floating.zIndex).toBeGreaterThan(firstZ);
    expect(floating.zIndex).toBeGreaterThan(
      windowState.floatingPanes.find((entry) => entry.pane.id === 'pane-main')!.zIndex,
    );
    expect(windowState.activePaneId).toBe('pane-second');
    expectValid(windowState);
  });

  it('docks into an empty root while retaining Pane and Tab identity', () => {
    const floated = floatPane(createProjectEditorWindow(), { paneId: 'pane-main' });
    const docked = dockPane(floated, { paneId: 'pane-main' });

    expect(docked.floatingPanes).toEqual([]);
    expect(asLeaf(docked)).toMatchObject({ id: 'pane-main', activeTabId: 'tab-editor' });
    expectValid(docked);
  });

  it('restores a nested horizontal → vertical origin path, placement and split ratio by default', () => {
    let windowState = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      newPaneId: 'pane-middle',
      newTab: createProjectEditorTab('preview', 'tab-preview'),
      splitId: 'split-root',
      ratio: 0.31,
    });
    windowState = splitPane(windowState, {
      paneId: 'pane-middle',
      direction: 'vertical',
      newPaneId: 'pane-floating',
      newTab: createProjectEditorTab('terminal', 'tab-terminal'),
      splitId: 'split-nested',
      ratio: 0.68,
    });

    const originalRoot = structuredClone(windowState.root);
    const floated = floatPane(windowState, { paneId: 'pane-floating' });
    const floating = floated.floatingPanes.find((entry) => entry.pane.id === 'pane-floating');

    expect(floating?.dockOrigin).toEqual({
      path: [
        {
          splitId: 'split-root',
          direction: 'horizontal',
          ratio: 0.31,
          branch: 'second',
          siblingNodeId: 'pane-main',
        },
        {
          splitId: 'split-nested',
          direction: 'vertical',
          ratio: 0.68,
          branch: 'second',
          siblingNodeId: 'pane-middle',
        },
      ],
    });
    expect(floated.root).toMatchObject({
      id: 'split-root',
      direction: 'horizontal',
      ratio: 0.31,
      first: { id: 'pane-main' },
      second: { id: 'pane-middle' },
    });

    const restored = dockPane(floated, { paneId: 'pane-floating' });

    expect(restored.root).toEqual(originalRoot);
    expect(restored.floatingPanes).toEqual([]);
    expectValid(restored);
  });

  it('normalizes persisted origin metadata and migrates its legacy origin alias', () => {
    const normalized = normalizeProjectEditorWindow({
      id: 'window-restored',
      root: createProjectEditorPane('pane-anchor', [createProjectEditorTab('editor', 'tab-anchor')]),
      floatingPanes: [
        {
          id: 'floating-preview',
          pane: createProjectEditorPane('pane-preview', [createProjectEditorTab('preview', 'tab-preview')]),
          bounds: { x: 12, y: 20, width: 640, height: 420 },
          zIndex: 4,
          origin: {
            path: [
              {
                splitId: ' split-original ',
                direction: 'vertical',
                ratio: 99,
                side: 'first',
                siblingId: ' pane-anchor ',
              },
              {
                splitId: 'discarded-invalid-segment',
                direction: 'diagonal',
                branch: 'second',
                siblingNodeId: 'pane-anchor',
              },
            ],
          },
        },
      ],
      activePaneId: 'pane-preview',
    });

    expect(normalized.floatingPanes[0].dockOrigin).toEqual({
      path: [
        {
          splitId: 'split-original',
          direction: 'vertical',
          ratio: 0.9,
          branch: 'first',
          siblingNodeId: 'pane-anchor',
        },
      ],
    });

    const docked = dockPane(normalized, { paneId: 'pane-preview' });
    const root = asSplit(docked);

    expect(root).toMatchObject({
      id: 'split-original',
      direction: 'vertical',
      ratio: 0.9,
      first: { id: 'pane-preview' },
      second: { id: 'pane-anchor' },
    });
    expectValid(docked);
  });

  it('falls back to right docking when the persisted structural origin is no longer resolvable', () => {
    let windowState = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'vertical',
      newPaneId: 'pane-floating',
      newTab: createProjectEditorTab('preview', 'tab-preview'),
      splitId: 'split-original',
      ratio: 0.72,
    });
    windowState = floatPane(windowState, { paneId: 'pane-floating' });

    const withRemovedAnchor: ProjectEditorWindowState = {
      ...windowState,
      root: createProjectEditorPane('pane-replacement', [createProjectEditorTab('files', 'tab-files')]),
      activePaneId: 'pane-replacement',
    };

    const docked = dockPane(withRemovedAnchor, { paneId: 'pane-floating' });
    const root = asSplit(docked);

    expect(root.direction).toBe('horizontal');
    expect(root.ratio).toBe(0.5);
    expect(root.first.id).toBe('pane-replacement');
    expect(root.second.id).toBe('pane-floating');
    expectValid(docked);
  });

  it.each([
    ['left', 'horizontal', true],
    ['right', 'horizontal', false],
    ['top', 'vertical', true],
    ['bottom', 'vertical', false],
  ] as const)('docks %s as a distinct %s split', (position, direction, floatingFirst) => {
    let windowState = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      newPaneId: 'pane-floating',
      newTab: createProjectEditorTab('preview', 'tab-preview'),
    });
    windowState = floatPane(windowState, { paneId: 'pane-floating' });
    windowState = dockPane(windowState, {
      paneId: 'pane-floating',
      targetPaneId: 'pane-main',
      position,
      splitId: `split-${position}`,
      ratio: 0.4,
    });

    const root = asSplit(windowState);

    expect(root.direction).toBe(direction);
    expect(root.ratio).toBe(0.4);
    expect(root.first.id === 'pane-floating').toBe(floatingFirst);
    expect(root.second.id === 'pane-floating').toBe(!floatingFirst);
    expect(windowState.floatingPanes).toHaveLength(0);
    expectValid(windowState);
  });

  it('center-docks by merging all tabs without swapping or losing tools', () => {
    let windowState = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      newPaneId: 'pane-floating',
      newTab: createProjectEditorTab('preview', 'tab-preview'),
    });
    windowState = floatPane(windowState, { paneId: 'pane-floating' });
    windowState = setMaximizedPane(windowState, 'pane-floating');
    windowState = dockPane(windowState, {
      paneId: 'pane-floating',
      targetPaneId: 'pane-main',
      position: 'center',
    });

    const pane = asLeaf(windowState);

    expect(pane.tabs.map((tab) => tab.id)).toEqual(['tab-editor', 'tab-preview']);
    expect(pane.activeTabId).toBe('tab-preview');
    expect(windowState.maximizedPaneId).toBe('pane-main');
    expectValid(windowState);
  });
});

describe('generic updates, resize, maximize and invariant recovery', () => {
  it('updates docked Pane tabs without mutating the input', () => {
    const source = createProjectEditorWindow();
    const snapshot = structuredClone(source);

    const updated = updatePane(source, 'pane-main', (pane) => ({
      ...pane,
      tabs: [...pane.tabs, createProjectEditorTab('skills', 'tab-skills')],
      activeTabId: 'tab-skills',
    }));

    expect(source).toEqual(snapshot);
    expect(findPane(updated, 'pane-main')?.tabs.map((tab) => tab.panel)).toEqual(['editor', 'skills']);
    expect(findPane(updated, 'pane-main')?.activeTabId).toBe('tab-skills');
    expectValid(updated);
  });

  it('collapses explicitly emptied Panes and repairs a completely empty Window', () => {
    let split = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      newPaneId: 'pane-right',
    });
    split = updatePane(split, 'pane-right', () => null);

    expect(asLeaf(split).id).toBe('pane-main');

    const invalidEmptyWindow = {
      ...createProjectEditorWindow(),
      root: { type: 'leaf', id: 'pane-empty', tabs: [], activeTabId: 'missing' },
    } as ProjectEditorWindowState;

    const repaired = collapseEmptyPanes(invalidEmptyWindow);

    expect(collectPanes(repaired)).toHaveLength(1);
    expect(collectPanes(repaired)[0].tabs[0].panel).toBe('editor');
    expectValid(repaired);
  });

  it('persists clamped split ratios and nested resize changes', () => {
    let windowState = splitPane(createProjectEditorWindow(), {
      paneId: 'pane-main',
      direction: 'horizontal',
      splitId: 'split-root',
    });
    windowState = splitPane(windowState, {
      paneId: 'pane-main',
      direction: 'vertical',
      splitId: 'split-nested',
    });
    windowState = setSplitRatio(windowState, 'split-nested', 0.72);
    windowState = setSplitRatio(windowState, 'split-root', Number.POSITIVE_INFINITY);

    const root = asSplit(windowState);

    expect(root.ratio).toBe(0.5);
    expect((root.first as ProjectEditorPaneSplit).ratio).toBe(0.72);
    expectValid(windowState);
  });

  it('sets and toggles maximization only for existing Panes', () => {
    const source = createProjectEditorWindow();
    const maximized = toggleMaximizedPane(source, 'pane-main');
    const restored = toggleMaximizedPane(maximized, 'pane-main');

    expect(maximized.maximizedPaneId).toBe('pane-main');
    expect(maximized.activePaneId).toBe('pane-main');
    expect(restored.maximizedPaneId).toBeUndefined();
    expect(setMaximizedPane(source, 'missing')).toBe(source);
  });

  it('reports corrupt state and accepts its normalized equivalent', () => {
    const corrupt = createProjectEditorLayout();
    const windowState = corrupt.windows[corrupt.activeWindowId];
    const pane = asLeaf(windowState);

    const invalid = {
      ...corrupt,
      windows: {
        [windowState.id]: {
          ...windowState,
          activePaneId: 'missing',
          root: {
            ...pane,
            activeTabId: 'missing',
            tabs: [pane.tabs[0], { ...pane.tabs[0], panel: 'not-a-tool' }],
          },
        },
      },
    } as unknown as ProjectEditorLayoutState;

    const codes = getProjectEditorLayoutInvariantViolations(invalid).map((violation) => violation.code);

    expect(codes).toEqual(
      expect.arrayContaining(['duplicate-tab-id', 'invalid-tab-tool', 'invalid-active-tab', 'invalid-active-pane']),
    );
    expect(() => assertProjectEditorLayoutInvariants(invalid)).toThrow('Invalid Project Editor layout');
    expect(() => assertProjectEditorLayoutInvariants(normalizeProjectEditorLayout(invalid))).not.toThrow();
  });
});

describe('multi-Window reducer', () => {
  it('updates only the targeted Window', () => {
    const first = createProjectEditorWindow('window-one');

    const second = createProjectEditorWindow(
      'window-two',
      createProjectEditorPane('pane-two', [createProjectEditorTab('preview', 'tab-two')]),
    );
    const state: ProjectEditorLayoutState = {
      version: PROJECT_EDITOR_LAYOUT_VERSION,
      activeWindowId: 'window-one',
      windows: { 'window-one': first, 'window-two': second },
    };
    const result = projectEditorLayoutReducer(state, {
      type: 'pane/split',
      windowId: 'window-two',
      options: {
        paneId: 'pane-two',
        direction: 'vertical',
        newPaneId: 'pane-two-bottom',
      },
    });

    expect(result.windows['window-one']).toBe(first);
    expect(result.windows['window-two']).not.toBe(second);
    expect(result.windows['window-two'].root?.type).toBe('split');
    expect(result.activeWindowId).toBe('window-one');
    assertProjectEditorLayoutInvariants(result);
  });

  it('never removes the last Window', () => {
    const source = createProjectEditorLayout('window-only');
    const result = projectEditorLayoutReducer(source, { type: 'window/remove', windowId: 'window-only' });

    expect(Object.keys(result.windows)).toHaveLength(1);
    expect(result.windows[result.activeWindowId]).toBeDefined();
    assertProjectEditorLayoutInvariants(result);
  });

  it('normalizes an upserted Window before making it active', () => {
    const source = createProjectEditorLayout('window-one');

    const result = projectEditorLayoutReducer(source, {
      type: 'window/upsert',
      window: normalizeProjectEditorWindow(
        {
          id: 'window-two',
          root: {
            type: 'leaf',
            id: 'pane-two',
            tabs: [{ id: 'tab-console', panel: 'console' }],
          },
        },
        'window-two',
      ),
    });

    expect(result.activeWindowId).toBe('window-two');
    expect(findPane(result.windows['window-two'], 'pane-two')?.tabs[0].panel).toBe('terminal');
    assertProjectEditorLayoutInvariants(result);
  });
});
