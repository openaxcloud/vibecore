/**
 * Pure Project Editor layout model.
 *
 * A browser Window owns one docked pane tree plus zero or more floating panes.
 * Every pane owns one or more tabs, and every tab resolves to exactly one tool.
 * This module intentionally has no React, DOM, persistence or runtime dependency.
 */

export const PROJECT_EDITOR_LAYOUT_VERSION = 2 as const;
export const DEFAULT_PROJECT_EDITOR_WINDOW_ID = 'window-main';
export const DEFAULT_PROJECT_EDITOR_PANE_ID = 'pane-main';
export const DEFAULT_PROJECT_EDITOR_TAB_ID = 'tab-editor';
export const DEFAULT_PROJECT_EDITOR_SPLIT_RATIO = 0.5;
export const MIN_PROJECT_EDITOR_SPLIT_RATIO = 0.1;
export const MAX_PROJECT_EDITOR_SPLIT_RATIO = 0.9;

export const PROJECT_EDITOR_TOOLS = [
  'editor',
  'preview',
  'files',
  'search',
  'locks',
  'overview',
  'studio',
  'database',
  'object-storage',
  'packages',
  'skills',
  'monitoring',
  'ports',
  'extensions',
  'integrations',
  'workflows',
  'debugger',
  'deployments',
  'security',
  'env',
  'secrets',
  'git',
  'activity',
  'terminal',
  'logs',
  'collaborators',
  'domains',
  'snapshots',
  'settings',
] as const;

export type ProjectEditorTool = (typeof PROJECT_EDITOR_TOOLS)[number];
export type ProjectEditorSplitDirection = 'horizontal' | 'vertical';
export type ProjectEditorDockPosition = 'center' | 'left' | 'right' | 'top' | 'bottom';

export interface ProjectEditorTab {
  id: string;

  /** A tab contains exactly one Project Editor tool. */
  panel: ProjectEditorTool;
  pinned?: boolean;
  filePath?: string;
  preview?: boolean;
}

export interface ProjectEditorPaneLeaf {
  type: 'leaf';
  id: string;
  tabs: ProjectEditorTab[];
  activeTabId: string;
}

export interface ProjectEditorPaneSplit {
  type: 'split';
  id: string;
  direction: ProjectEditorSplitDirection;

  /** Fraction occupied by `first`, clamped to 10–90%. */
  ratio: number;
  first: ProjectEditorPaneNode;
  second: ProjectEditorPaneNode;
}

export type ProjectEditorPaneNode = ProjectEditorPaneLeaf | ProjectEditorPaneSplit;

export interface ProjectEditorFloatingBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ProjectEditorPaneTreeBranch = 'first' | 'second';

/**
 * One step in the original root-to-Pane path captured before a Pane floats.
 * The sibling node is the stable anchor used to recreate the removed split.
 */
export interface ProjectEditorFloatingPaneOriginPathSegment {
  splitId: string;
  direction: ProjectEditorSplitDirection;
  ratio: number;
  branch: ProjectEditorPaneTreeBranch;
  siblingNodeId: string;
}

export interface ProjectEditorFloatingPaneOrigin {
  /** Root-to-parent path. The final segment is the Pane's direct parent. */
  path: ProjectEditorFloatingPaneOriginPathSegment[];
}

export interface ProjectEditorFloatingPane {
  id: string;

  /** The pane lives here while floating and is absent from `root`. */
  pane: ProjectEditorPaneLeaf;
  bounds: ProjectEditorFloatingBounds;
  zIndex: number;

  /** Persisted structural origin used by the default Dock action. */
  dockOrigin?: ProjectEditorFloatingPaneOrigin;
}

export interface ProjectEditorWindowState {
  id: string;

  /** Null is valid only while at least one pane is floating. */
  root: ProjectEditorPaneNode | null;
  floatingPanes: ProjectEditorFloatingPane[];
  activePaneId: string;
  maximizedPaneId?: string;
}

export interface ProjectEditorLayoutState {
  version: typeof PROJECT_EDITOR_LAYOUT_VERSION;
  activeWindowId: string;
  windows: Record<string, ProjectEditorWindowState>;
}

export interface ProjectEditorLayoutNormalizationOptions {
  windowId?: string;
}

export interface SplitPaneOptions {
  paneId: string;
  direction: ProjectEditorSplitDirection;
  placement?: 'before' | 'after';
  ratio?: number;

  /** Move this tab when the source has several tabs; clone it when it is the only tab. */
  tabId?: string;

  /** Use an explicit tool tab instead of moving/cloning a source tab. */
  newTab?: ProjectEditorTab;
  newTabId?: string;
  newPaneId?: string;
  splitId?: string;
}

export interface MoveTabOptions {
  tabId: string;
  targetPaneId: string;
  sourcePaneId?: string;

  /** Final zero-based position in the destination pane. */
  toIndex?: number;
}

export interface ReorderTabOptions {
  paneId: string;
  tabId: string;

  /** Final zero-based position in the pane. */
  toIndex: number;
}

export interface OpenTabInPaneOptions {
  paneId: string;
  tab: ProjectEditorTab;
}

export interface FloatPaneOptions {
  paneId: string;
  bounds?: Partial<ProjectEditorFloatingBounds>;
  floatingId?: string;
  zIndex?: number;
}

export interface DockPaneOptions {
  paneId: string;
  targetPaneId?: string;
  position?: ProjectEditorDockPosition;
  ratio?: number;
  splitId?: string;
}

export interface ProjectEditorLayoutInvariantViolation {
  code:
    | 'missing-window'
    | 'window-key-mismatch'
    | 'empty-window'
    | 'duplicate-node-id'
    | 'duplicate-pane-id'
    | 'duplicate-tab-id'
    | 'empty-pane'
    | 'invalid-tab-tool'
    | 'invalid-active-tab'
    | 'invalid-active-pane'
    | 'invalid-maximized-pane'
    | 'invalid-split-ratio'
    | 'invalid-floating-bounds'
    | 'invalid-floating-origin';
  path: string;
  message: string;
}

export type ProjectEditorLayoutAction =
  | { type: 'window/upsert'; window: ProjectEditorWindowState; activate?: boolean }
  | { type: 'window/remove'; windowId: string }
  | { type: 'window/activate'; windowId: string }
  | { type: 'pane/split'; windowId: string; options: SplitPaneOptions }
  | { type: 'tab/move'; windowId: string; options: MoveTabOptions }
  | { type: 'tab/reorder'; windowId: string; options: ReorderTabOptions }
  | { type: 'pane/float'; windowId: string; options: FloatPaneOptions }
  | { type: 'pane/dock'; windowId: string; options: DockPaneOptions }
  | { type: 'pane/floating-bounds'; windowId: string; paneId: string; bounds: Partial<ProjectEditorFloatingBounds> }
  | { type: 'pane/bring-to-front'; windowId: string; paneId: string }
  | { type: 'pane/maximize'; windowId: string; paneId?: string }
  | { type: 'pane/toggle-maximize'; windowId: string; paneId: string }
  | { type: 'split/resize'; windowId: string; splitId: string; ratio: number };

const DEFAULT_FLOATING_BOUNDS: ProjectEditorFloatingBounds = {
  x: 72,
  y: 72,
  width: 720,
  height: 480,
};

const MIN_FLOATING_WIDTH = 280;
const MIN_FLOATING_HEIGHT = 180;
const MAX_FLOATING_DIMENSION = 100_000;

const PROJECT_EDITOR_TOOL_SET = new Set<string>(PROJECT_EDITOR_TOOLS);

const LEGACY_TOOL_ALIASES: Readonly<Record<string, ProjectEditorTool>> = {
  webview: 'preview',
  console: 'terminal',
  deploy: 'deployments',
};

type UnknownRecord = Record<string, unknown>;

type NormalizationContext = {
  nodeIds: Set<string>;
  tabIds: Set<string>;
  floatingIds: Set<string>;
};

export function createProjectEditorTab(
  panel: ProjectEditorTool = 'editor',
  id = DEFAULT_PROJECT_EDITOR_TAB_ID,
): ProjectEditorTab {
  return { id: nonEmptyString(id) ?? DEFAULT_PROJECT_EDITOR_TAB_ID, panel };
}

export function createProjectEditorPane(
  id = DEFAULT_PROJECT_EDITOR_PANE_ID,
  tabs: ProjectEditorTab[] = [createProjectEditorTab()],
  activeTabId?: string,
): ProjectEditorPaneLeaf {
  const resolvedTabs = tabs.length > 0 ? tabs.map(cloneTab) : [createProjectEditorTab()];
  const resolvedActiveTabId = resolvedTabs.some((tab) => tab.id === activeTabId) ? activeTabId! : resolvedTabs[0].id;

  return {
    type: 'leaf',
    id: nonEmptyString(id) ?? DEFAULT_PROJECT_EDITOR_PANE_ID,
    tabs: resolvedTabs,
    activeTabId: resolvedActiveTabId,
  };
}

export function createProjectEditorWindow(
  id = DEFAULT_PROJECT_EDITOR_WINDOW_ID,
  root: ProjectEditorPaneNode = createProjectEditorPane(),
): ProjectEditorWindowState {
  const resolvedId = nonEmptyString(id) ?? DEFAULT_PROJECT_EDITOR_WINDOW_ID;

  const normalized = normalizeProjectEditorWindow(
    {
      id: resolvedId,
      root,
      floatingPanes: [],
      activePaneId: firstPane(root)?.id,
    },
    resolvedId,
  );

  return normalized;
}

/** Creates a browser Window whose first Pane contains the selected Tab verbatim. */
export function createProjectEditorWindowForTab(
  id: string,
  tab: ProjectEditorTab,
  paneId = DEFAULT_PROJECT_EDITOR_PANE_ID,
): ProjectEditorWindowState {
  const selectedTab = cloneTab(tab);

  return createProjectEditorWindow(id, createProjectEditorPane(paneId, [selectedTab], selectedTab.id));
}

/** Explicitly named constructor for consumers migrating from the legacy pane tree. */
export const createDefaultProjectEditorWindow = createProjectEditorWindow;

export function createProjectEditorLayout(windowId = DEFAULT_PROJECT_EDITOR_WINDOW_ID): ProjectEditorLayoutState {
  const window = createProjectEditorWindow(windowId);

  return {
    version: PROJECT_EDITOR_LAYOUT_VERSION,
    activeWindowId: window.id,
    windows: { [window.id]: window },
  };
}

/**
 * Normalizes current layout state and transparently migrates the legacy
 * `{ paneTree, activePaneId }` persistence shape.
 */
export function normalizeProjectEditorLayout(
  input: unknown,
  options: ProjectEditorLayoutNormalizationOptions = {},
): ProjectEditorLayoutState {
  const record = asRecord(input);
  const nested = asRecord(record?.projectEditorLayout) ?? asRecord(asRecord(record?.ui)?.projectEditorLayout);

  if (nested) {
    return normalizeProjectEditorLayout(nested, options);
  }

  const windowsInput = record?.windows;

  if (!windowsInput || (typeof windowsInput !== 'object' && !Array.isArray(windowsInput))) {
    return migrateLegacyProjectEditorLayout(input, options);
  }

  const entries = Array.isArray(windowsInput)
    ? windowsInput.map((window, index) => [String(index), window] as const)
    : Object.entries(windowsInput as UnknownRecord);

  const windows: Record<string, ProjectEditorWindowState> = {};

  for (const [key, value] of entries) {
    const valueRecord = asRecord(value);

    const preferredId = Array.isArray(windowsInput)
      ? (nonEmptyString(valueRecord?.id) ?? `window-${Object.keys(windows).length + 1}`)
      : (nonEmptyString(key) ?? nonEmptyString(valueRecord?.id) ?? `window-${Object.keys(windows).length + 1}`);

    const windowId = uniqueRecordKey(windows, preferredId, 'window');
    const window = normalizeProjectEditorWindow(value, windowId);
    windows[windowId] = { ...window, id: windowId };
  }

  if (Object.keys(windows).length === 0) {
    return createProjectEditorLayout(options.windowId);
  }

  const requestedActiveWindowId = nonEmptyString(record.activeWindowId);

  const activeWindowId =
    requestedActiveWindowId && windows[requestedActiveWindowId] ? requestedActiveWindowId : Object.keys(windows)[0];

  return {
    version: PROJECT_EDITOR_LAYOUT_VERSION,
    activeWindowId,
    windows,
  };
}

export function migrateLegacyProjectEditorLayout(
  input: unknown,
  options: ProjectEditorLayoutNormalizationOptions = {},
): ProjectEditorLayoutState {
  const outer = asRecord(input);
  const ui = asRecord(outer?.ui) ?? outer;
  const windowId = nonEmptyString(options.windowId) ?? DEFAULT_PROJECT_EDITOR_WINDOW_ID;
  const directNode = isPaneLike(input) ? input : undefined;
  const root = directNode ?? ui?.paneTree ?? ui?.root ?? ui?.rootPane;

  const window = normalizeProjectEditorWindow(
    {
      id: windowId,
      root,
      floatingPanes: ui?.floatingPanes,
      activePaneId: ui?.activePaneId,
      maximizedPaneId: ui?.maximizedPaneId,
    },
    windowId,
  );

  return {
    version: PROJECT_EDITOR_LAYOUT_VERSION,
    activeWindowId: window.id,
    windows: { [window.id]: window },
  };
}

export function normalizeProjectEditorWindow(
  input: unknown,
  fallbackWindowId = DEFAULT_PROJECT_EDITOR_WINDOW_ID,
): ProjectEditorWindowState {
  const record = asRecord(input) ?? {};
  const context = createNormalizationContext();
  const hasRootProperty = 'root' in record || 'rootPane' in record || 'paneTree' in record;
  const rootInput = record.root ?? record.rootPane ?? record.paneTree;

  let root = normalizePaneNode(rootInput, context);

  const floatingInput = Array.isArray(record.floatingPanes)
    ? record.floatingPanes
    : Object.values(asRecord(record.floatingPanes) ?? {});

  const floatingPanes: ProjectEditorFloatingPane[] = [];
  const usedZIndexes = new Set<number>();

  for (let index = 0; index < floatingInput.length; index += 1) {
    const normalized = normalizeFloatingPane(floatingInput[index], context, index + 1, usedZIndexes);

    if (normalized) {
      floatingPanes.push(normalized);
    }
  }

  if (!root && floatingPanes.length === 0) {
    root = normalizePaneNode(createProjectEditorPane(), context);
  } else if (!hasRootProperty && floatingPanes.length === 0 && !root) {
    root = normalizePaneNode(createProjectEditorPane(), context);
  }

  const paneIds = new Set(allPanesFromParts(root, floatingPanes).map((pane) => pane.id));
  const requestedActivePaneId = nonEmptyString(record.activePaneId);

  const activePaneId =
    requestedActivePaneId && paneIds.has(requestedActivePaneId)
      ? requestedActivePaneId
      : (firstPane(root)?.id ?? floatingPanes[0]!.pane.id);

  const requestedMaximizedPaneId = nonEmptyString(record.maximizedPaneId);

  return {
    id: nonEmptyString(record.id) ?? nonEmptyString(fallbackWindowId) ?? DEFAULT_PROJECT_EDITOR_WINDOW_ID,
    root,
    floatingPanes,
    activePaneId,
    ...(requestedMaximizedPaneId && paneIds.has(requestedMaximizedPaneId)
      ? { maximizedPaneId: requestedMaximizedPaneId }
      : {}),
  };
}

/** Finds a pane in the docked tree or the floating collection. */
export function findPane(windowState: ProjectEditorWindowState, paneId: string): ProjectEditorPaneLeaf | undefined {
  return (
    findPaneInNode(windowState.root, paneId) ??
    windowState.floatingPanes.find((floating) => floating.pane.id === paneId)?.pane
  );
}

/**
 * Updates a pane regardless of whether it is docked or floating. Returning
 * null, or returning a pane with no tabs, removes it and collapses its parent.
 */
export function updatePane(
  windowState: ProjectEditorWindowState,
  paneId: string,
  updater: (pane: ProjectEditorPaneLeaf) => ProjectEditorPaneLeaf | null,
): ProjectEditorWindowState {
  const current = findPane(windowState, paneId);

  if (!current) {
    return windowState;
  }

  const candidate = updater(clonePane(current));

  if (!candidate || candidate.tabs.length === 0) {
    return collapseEmptyPanes(removePane(windowState, paneId));
  }

  const otherTabIds = new Set(
    collectPanes(windowState)
      .filter((pane) => pane.id !== paneId)
      .flatMap((pane) => pane.tabs.map((tab) => tab.id)),
  );

  const tabs = normalizeTypedTabs(candidate.tabs, otherTabIds);

  if (tabs.length === 0) {
    return collapseEmptyPanes(removePane(windowState, paneId));
  }

  const nextPane: ProjectEditorPaneLeaf = {
    type: 'leaf',
    id: current.id,
    tabs,
    activeTabId: tabs.some((tab) => tab.id === candidate.activeTabId) ? candidate.activeTabId : tabs[0].id,
  };

  const root = replacePaneInNode(windowState.root, paneId, nextPane);

  const floatingPanes = windowState.floatingPanes.map((floating) =>
    floating.pane.id === paneId ? { ...floating, pane: nextPane } : floating,
  );

  return finalizeWindow({ ...windowState, root, floatingPanes });
}

/**
 * Opens a tool in a Pane while keeping document identity local to its Tab.
 *
 * An empty editor Tab is a welcome surface, not an alias for the globally
 * selected file. The first real file opened in that Pane binds the empty Tab
 * to the document. Subsequent files receive their own Tab identity. Preview
 * Tabs are the sole exception: a later preview intentionally reuses the same
 * Tab, matching the established IDE preview-tab pattern.
 */
export function openTabInPane(
  windowState: ProjectEditorWindowState,
  options: OpenTabInPaneOptions,
): ProjectEditorWindowState {
  return updatePane(windowState, options.paneId, (pane) => {
    const requested = cloneTab(options.tab);

    const exact = requested.filePath
      ? pane.tabs.find((tab) => tab.panel === requested.panel && tab.filePath === requested.filePath)
      : requested.panel === 'editor'
        ? (pane.tabs.find((tab) => tab.panel === 'editor' && !tab.filePath) ??
          pane.tabs.find((tab) => tab.id === pane.activeTabId && tab.panel === 'editor') ??
          pane.tabs.find((tab) => tab.panel === 'editor'))
        : pane.tabs.find((tab) => tab.panel === requested.panel && !tab.filePath);

    if (exact) {
      const tabs = pane.tabs.map((tab) => {
        if (tab.id !== exact.id) {
          return tab;
        }

        /* Opening a permanent editor through preview must not demote it. */
        const preview =
          requested.preview === true && tab.preview !== true ? tab.preview : (requested.preview ?? tab.preview);

        return {
          ...tab,
          ...(requested.pinned !== undefined ? { pinned: requested.pinned } : {}),
          ...(preview !== undefined ? { preview } : {}),
        };
      });

      return { ...pane, tabs, activeTabId: exact.id };
    }

    const reusable =
      requested.panel === 'editor' && requested.filePath
        ? requested.preview
          ? (pane.tabs.find((tab) => tab.panel === 'editor' && tab.preview) ??
            pane.tabs.find((tab) => tab.panel === 'editor' && !tab.filePath && !tab.pinned))
          : pane.tabs.find((tab) => tab.panel === 'editor' && !tab.filePath && !tab.pinned)
        : undefined;

    if (reusable) {
      const boundTab: ProjectEditorTab = {
        ...reusable,
        panel: 'editor',
        filePath: requested.filePath,
        ...(requested.preview !== undefined ? { preview: requested.preview } : {}),
        ...(requested.pinned !== undefined ? { pinned: requested.pinned } : {}),
      };

      return {
        ...pane,
        tabs: pane.tabs.map((tab) => (tab.id === reusable.id ? boundTab : tab)),
        activeTabId: reusable.id,
      };
    }

    return {
      ...pane,
      tabs: [...pane.tabs, requested],
      activeTabId: requested.id,
    };
  });
}

export function splitPane(windowState: ProjectEditorWindowState, options: SplitPaneOptions): ProjectEditorWindowState {
  const sourcePane = findPaneInNode(windowState.root, options.paneId);

  // A floating pane is already an independent pane; dock it before splitting.
  if (!sourcePane) {
    return windowState;
  }

  const ids = collectWindowIds(windowState);

  const selectedTab =
    sourcePane.tabs.find((tab) => tab.id === options.tabId) ??
    sourcePane.tabs.find((tab) => tab.id === sourcePane.activeTabId) ??
    sourcePane.tabs[0];

  let sourceTabs = sourcePane.tabs;
  let sourceActiveTabId = sourcePane.activeTabId;
  let newTab: ProjectEditorTab;

  if (options.newTab) {
    newTab = normalizeReducerTab(options.newTab, ids.tabIds, options.newTabId);
  } else if (sourcePane.tabs.length > 1) {
    newTab = cloneTab(selectedTab);

    const selectedIndex = sourcePane.tabs.findIndex((tab) => tab.id === selectedTab.id);
    sourceTabs = sourcePane.tabs.filter((tab) => tab.id !== selectedTab.id);

    if (sourceActiveTabId === selectedTab.id) {
      sourceActiveTabId = sourceTabs[Math.min(selectedIndex, sourceTabs.length - 1)].id;
    }
  } else {
    const clonedId = uniqueId(ids.tabIds, options.newTabId ?? `${selectedTab.id}-split`, 'tab');
    newTab = { ...cloneTab(selectedTab), id: clonedId };
  }

  const newPaneId = uniqueId(ids.nodeIds, options.newPaneId, 'pane');
  const splitId = uniqueId(ids.nodeIds, options.splitId, 'split');

  const updatedSource: ProjectEditorPaneLeaf = {
    ...sourcePane,
    tabs: sourceTabs.map(cloneTab),
    activeTabId: sourceActiveTabId,
  };

  const newPane = createProjectEditorPane(newPaneId, [newTab], newTab.id);
  const placement = options.placement ?? 'after';

  const split: ProjectEditorPaneSplit = {
    type: 'split',
    id: splitId,
    direction: options.direction,
    ratio: normalizeSplitRatio(options.ratio),
    first: placement === 'before' ? newPane : updatedSource,
    second: placement === 'before' ? updatedSource : newPane,
  };

  const root = replaceNodeInTree(windowState.root, sourcePane.id, split);

  return finalizeWindow({
    ...windowState,
    root,
    activePaneId: newPane.id,
    maximizedPaneId: undefined,
  });
}

/** Moves a tab; it never swaps it with a destination tab. */
export function moveTab(windowState: ProjectEditorWindowState, options: MoveTabOptions): ProjectEditorWindowState {
  const sourcePane = options.sourcePaneId
    ? findPane(windowState, options.sourcePaneId)
    : findPaneContainingTab(windowState, options.tabId);

  const targetPane = findPane(windowState, options.targetPaneId);

  if (!sourcePane || !targetPane) {
    return windowState;
  }

  const tabIndex = sourcePane.tabs.findIndex((tab) => tab.id === options.tabId);

  if (tabIndex < 0) {
    return windowState;
  }

  if (sourcePane.id === targetPane.id) {
    return reorderTab(windowState, {
      paneId: sourcePane.id,
      tabId: options.tabId,
      toIndex: options.toIndex ?? sourcePane.tabs.length - 1,
    });
  }

  const movedTab = cloneTab(sourcePane.tabs[tabIndex]);

  let next = updatePaneWithoutFallback(windowState, sourcePane.id, (pane) => {
    const tabs = pane.tabs.filter((tab) => tab.id !== movedTab.id);

    if (tabs.length === 0) {
      return null;
    }

    const fallbackIndex = Math.min(tabIndex, tabs.length - 1);

    return {
      ...pane,
      tabs,
      activeTabId: pane.activeTabId === movedTab.id ? tabs[fallbackIndex].id : pane.activeTabId,
    };
  });

  const destination = findPane(next, targetPane.id);

  if (!destination) {
    return windowState;
  }

  const insertionIndex = clampInteger(options.toIndex ?? destination.tabs.length, 0, destination.tabs.length);
  next = updatePaneWithoutFallback(next, destination.id, (pane) => {
    const tabs = [...pane.tabs];
    tabs.splice(insertionIndex, 0, movedTab);

    return { ...pane, tabs, activeTabId: movedTab.id };
  });

  return finalizeWindow({
    ...next,
    activePaneId: destination.id,
    ...(next.maximizedPaneId === sourcePane.id ? { maximizedPaneId: undefined } : {}),
  });
}

export function reorderTab(
  windowState: ProjectEditorWindowState,
  options: ReorderTabOptions,
): ProjectEditorWindowState {
  const pane = findPane(windowState, options.paneId);

  if (!pane) {
    return windowState;
  }

  const fromIndex = pane.tabs.findIndex((tab) => tab.id === options.tabId);

  if (fromIndex < 0) {
    return windowState;
  }

  const toIndex = clampInteger(options.toIndex, 0, pane.tabs.length - 1);

  if (fromIndex === toIndex) {
    return windowState;
  }

  return updatePane(windowState, pane.id, (current) => {
    const tabs = [...current.tabs];
    const [tab] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, tab);

    return { ...current, tabs, activeTabId: tab.id };
  });
}

export function floatPane(windowState: ProjectEditorWindowState, options: FloatPaneOptions): ProjectEditorWindowState {
  const existingFloatingIndex = windowState.floatingPanes.findIndex((floating) => floating.pane.id === options.paneId);

  if (existingFloatingIndex >= 0) {
    const existing = windowState.floatingPanes[existingFloatingIndex];

    const floatingPanes = windowState.floatingPanes.map((floating, index) =>
      index === existingFloatingIndex
        ? {
            ...floating,
            bounds: normalizeFloatingBounds({ ...floating.bounds, ...options.bounds }),
            zIndex: normalizeZIndex(options.zIndex, nextFloatingZIndex(windowState)),
          }
        : floating,
    );

    return finalizeWindow({ ...windowState, floatingPanes, activePaneId: existing.pane.id });
  }

  const pane = findPaneInNode(windowState.root, options.paneId);

  if (!pane) {
    return windowState;
  }

  const ids = collectWindowIds(windowState);

  const floating: ProjectEditorFloatingPane = {
    id: uniqueId(ids.floatingIds, options.floatingId ?? `floating-${pane.id}`, 'floating'),
    pane: clonePane(pane),
    bounds: normalizeFloatingBounds(options.bounds),
    zIndex: normalizeZIndex(options.zIndex, nextFloatingZIndex(windowState)),
    ...captureFloatingPaneDockOrigin(windowState.root, pane.id),
  };

  const root = removePaneFromNode(windowState.root, pane.id);

  return finalizeWindow({
    ...windowState,
    root,
    floatingPanes: [...windowState.floatingPanes, floating],
    activePaneId: pane.id,
  });
}

export function dockPane(windowState: ProjectEditorWindowState, options: DockPaneOptions): ProjectEditorWindowState {
  const floating = windowState.floatingPanes.find((entry) => entry.pane.id === options.paneId);

  if (!floating) {
    return windowState;
  }

  const remainingFloating = windowState.floatingPanes.filter((entry) => entry.pane.id !== options.paneId);

  if (!windowState.root) {
    return finalizeWindow({
      ...windowState,
      root: clonePane(floating.pane),
      floatingPanes: remainingFloating,
      activePaneId: floating.pane.id,
    });
  }

  const shouldRestoreDockOrigin = options.targetPaneId === undefined && options.position === undefined;

  if (shouldRestoreDockOrigin && floating.dockOrigin) {
    const restoredRoot = restorePaneAtDockOrigin(windowState, floating, options);

    if (restoredRoot) {
      return finalizeWindow({
        ...windowState,
        root: restoredRoot,
        floatingPanes: remainingFloating,
        activePaneId: floating.pane.id,
      });
    }
  }

  const requestedTarget = options.targetPaneId ? findPaneInNode(windowState.root, options.targetPaneId) : undefined;
  const target = requestedTarget ?? firstPane(windowState.root);

  if (!target) {
    return windowState;
  }

  const position = options.position ?? 'right';

  if (position === 'center') {
    const tabs = [...target.tabs.map(cloneTab), ...floating.pane.tabs.map(cloneTab)];

    const merged: ProjectEditorPaneLeaf = {
      ...target,
      tabs,
      activeTabId: floating.pane.activeTabId,
    };

    const root = replacePaneInNode(windowState.root, target.id, merged);

    return finalizeWindow({
      ...windowState,
      root,
      floatingPanes: remainingFloating,
      activePaneId: target.id,
      ...(windowState.maximizedPaneId === floating.pane.id ? { maximizedPaneId: target.id } : {}),
    });
  }

  const ids = collectWindowIds(windowState);

  const direction: ProjectEditorSplitDirection =
    position === 'left' || position === 'right' ? 'horizontal' : 'vertical';

  const floatingFirst = position === 'left' || position === 'top';

  const split: ProjectEditorPaneSplit = {
    type: 'split',
    id: uniqueId(ids.nodeIds, options.splitId, 'split'),
    direction,
    ratio: normalizeSplitRatio(options.ratio),
    first: floatingFirst ? clonePane(floating.pane) : target,
    second: floatingFirst ? target : clonePane(floating.pane),
  };

  const root = replaceNodeInTree(windowState.root, target.id, split);

  return finalizeWindow({
    ...windowState,
    root,
    floatingPanes: remainingFloating,
    activePaneId: floating.pane.id,
  });
}

/** Removes empty panes and recursively collapses split nodes with one remaining child. */
export function collapseEmptyPanes(windowState: ProjectEditorWindowState): ProjectEditorWindowState {
  const root = pruneEmptyPanes(windowState.root);
  const floatingPanes = windowState.floatingPanes.filter((floating) => floating.pane.tabs.length > 0);

  let next: ProjectEditorWindowState = { ...windowState, root, floatingPanes };

  if (!root && floatingPanes.length === 0) {
    const ids = collectWindowIds(windowState);
    const tabId = uniqueId(ids.tabIds, DEFAULT_PROJECT_EDITOR_TAB_ID, 'tab');
    const paneId = uniqueId(ids.nodeIds, DEFAULT_PROJECT_EDITOR_PANE_ID, 'pane');
    const pane = createProjectEditorPane(paneId, [createProjectEditorTab('editor', tabId)], tabId);
    next = { ...next, root: pane, activePaneId: pane.id, maximizedPaneId: undefined };
  }

  return finalizeWindowReferences(next);
}

export function setSplitRatio(
  windowState: ProjectEditorWindowState,
  splitId: string,
  ratio: number,
): ProjectEditorWindowState {
  const normalizedRatio = normalizeSplitRatio(ratio);

  const root = updateSplitInNode(windowState.root, splitId, (split) =>
    split.ratio === normalizedRatio ? split : { ...split, ratio: normalizedRatio },
  );

  return root === windowState.root ? windowState : { ...windowState, root };
}

/** Alias matching the resize callback terminology used by resizable panel components. */
export const updateSplitRatio = setSplitRatio;

export function updateFloatingBounds(
  windowState: ProjectEditorWindowState,
  paneId: string,
  bounds: Partial<ProjectEditorFloatingBounds>,
): ProjectEditorWindowState {
  const index = windowState.floatingPanes.findIndex((floating) => floating.pane.id === paneId);

  if (index < 0) {
    return windowState;
  }

  const current = windowState.floatingPanes[index];
  const nextBounds = normalizeFloatingBounds({ ...current.bounds, ...bounds });

  if (
    current.bounds.x === nextBounds.x &&
    current.bounds.y === nextBounds.y &&
    current.bounds.width === nextBounds.width &&
    current.bounds.height === nextBounds.height
  ) {
    return windowState;
  }

  return {
    ...windowState,
    floatingPanes: windowState.floatingPanes.map((floating, floatingIndex) =>
      floatingIndex === index ? { ...floating, bounds: nextBounds } : floating,
    ),
  };
}

export function bringFloatingPaneToFront(
  windowState: ProjectEditorWindowState,
  paneId: string,
): ProjectEditorWindowState {
  const floating = windowState.floatingPanes.find((entry) => entry.pane.id === paneId);

  if (!floating) {
    return windowState;
  }

  const nextZIndex = nextFloatingZIndex(windowState);

  return {
    ...windowState,
    activePaneId: paneId,
    floatingPanes: windowState.floatingPanes.map((entry) =>
      entry.pane.id === paneId ? { ...entry, zIndex: nextZIndex } : entry,
    ),
  };
}

export function setMaximizedPane(windowState: ProjectEditorWindowState, paneId?: string): ProjectEditorWindowState {
  if (!paneId) {
    return windowState.maximizedPaneId ? { ...windowState, maximizedPaneId: undefined } : windowState;
  }

  if (!findPane(windowState, paneId) || windowState.maximizedPaneId === paneId) {
    return windowState;
  }

  return { ...windowState, activePaneId: paneId, maximizedPaneId: paneId };
}

export function toggleMaximizedPane(windowState: ProjectEditorWindowState, paneId: string): ProjectEditorWindowState {
  return windowState.maximizedPaneId === paneId ? setMaximizedPane(windowState) : setMaximizedPane(windowState, paneId);
}

export function collectPanes(windowState: ProjectEditorWindowState): ProjectEditorPaneLeaf[] {
  return allPanesFromParts(windowState.root, windowState.floatingPanes);
}

export function updateProjectEditorWindow(
  layout: ProjectEditorLayoutState,
  windowId: string,
  updater: (window: ProjectEditorWindowState) => ProjectEditorWindowState,
): ProjectEditorLayoutState {
  const current = layout.windows[windowId];

  if (!current) {
    return layout;
  }

  const next = updater(current);

  if (next === current) {
    return layout;
  }

  return {
    ...layout,
    windows: { ...layout.windows, [windowId]: { ...next, id: windowId } },
  };
}

export function projectEditorLayoutReducer(
  state: ProjectEditorLayoutState,
  action: ProjectEditorLayoutAction,
): ProjectEditorLayoutState {
  switch (action.type) {
    case 'window/upsert': {
      const window = normalizeProjectEditorWindow(action.window, action.window.id);

      return {
        ...state,
        activeWindowId: action.activate === false ? state.activeWindowId : window.id,
        windows: { ...state.windows, [window.id]: window },
      };
    }
    case 'window/remove': {
      if (!state.windows[action.windowId]) {
        return state;
      }

      const windows = { ...state.windows };
      delete windows[action.windowId];

      if (Object.keys(windows).length === 0) {
        return createProjectEditorLayout(DEFAULT_PROJECT_EDITOR_WINDOW_ID);
      }

      return {
        ...state,
        windows,
        activeWindowId: state.activeWindowId === action.windowId ? Object.keys(windows)[0] : state.activeWindowId,
      };
    }
    case 'window/activate':
      return state.windows[action.windowId] && state.activeWindowId !== action.windowId
        ? { ...state, activeWindowId: action.windowId }
        : state;
    case 'pane/split':
      return updateProjectEditorWindow(state, action.windowId, (window) => splitPane(window, action.options));
    case 'tab/move':
      return updateProjectEditorWindow(state, action.windowId, (window) => moveTab(window, action.options));
    case 'tab/reorder':
      return updateProjectEditorWindow(state, action.windowId, (window) => reorderTab(window, action.options));
    case 'pane/float':
      return updateProjectEditorWindow(state, action.windowId, (window) => floatPane(window, action.options));
    case 'pane/dock':
      return updateProjectEditorWindow(state, action.windowId, (window) => dockPane(window, action.options));
    case 'pane/floating-bounds':
      return updateProjectEditorWindow(state, action.windowId, (window) =>
        updateFloatingBounds(window, action.paneId, action.bounds),
      );
    case 'pane/bring-to-front':
      return updateProjectEditorWindow(state, action.windowId, (window) =>
        bringFloatingPaneToFront(window, action.paneId),
      );
    case 'pane/maximize':
      return updateProjectEditorWindow(state, action.windowId, (window) => setMaximizedPane(window, action.paneId));
    case 'pane/toggle-maximize':
      return updateProjectEditorWindow(state, action.windowId, (window) => toggleMaximizedPane(window, action.paneId));
    case 'split/resize':
      return updateProjectEditorWindow(state, action.windowId, (window) =>
        setSplitRatio(window, action.splitId, action.ratio),
      );
    default:
      return state;
  }
}

export function getProjectEditorLayoutInvariantViolations(
  state: ProjectEditorLayoutState,
): ProjectEditorLayoutInvariantViolation[] {
  const violations: ProjectEditorLayoutInvariantViolation[] = [];
  const windowEntries = Object.entries(state.windows);

  if (windowEntries.length === 0 || !state.windows[state.activeWindowId]) {
    violations.push({
      code: 'missing-window',
      path: 'windows',
      message: 'A layout must contain its active Window.',
    });
  }

  for (const [windowKey, window] of windowEntries) {
    const basePath = `windows.${windowKey}`;

    if (window.id !== windowKey) {
      violations.push({
        code: 'window-key-mismatch',
        path: `${basePath}.id`,
        message: `Window id ${window.id} does not match record key ${windowKey}.`,
      });
    }

    const nodeIds = new Set<string>();
    const paneIds = new Set<string>();
    const tabIds = new Set<string>();
    inspectNode(window.root, `${basePath}.root`, violations, nodeIds, paneIds, tabIds);

    for (let index = 0; index < window.floatingPanes.length; index += 1) {
      const floating = window.floatingPanes[index];
      const path = `${basePath}.floatingPanes.${index}`;
      inspectPane(floating.pane, `${path}.pane`, violations, nodeIds, paneIds, tabIds);

      if (!isValidFloatingBounds(floating.bounds)) {
        violations.push({
          code: 'invalid-floating-bounds',
          path: `${path}.bounds`,
          message: 'Floating bounds must be finite and meet the minimum size.',
        });
      }

      if (floating.dockOrigin && !isValidFloatingPaneDockOrigin(floating.dockOrigin)) {
        violations.push({
          code: 'invalid-floating-origin',
          path: `${path}.dockOrigin`,
          message: 'A floating Pane origin must contain a valid root-to-parent split path.',
        });
      }
    }

    if (paneIds.size === 0) {
      violations.push({
        code: 'empty-window',
        path: basePath,
        message: 'A Window must contain at least one Pane.',
      });
    }

    if (!paneIds.has(window.activePaneId)) {
      violations.push({
        code: 'invalid-active-pane',
        path: `${basePath}.activePaneId`,
        message: 'The active Pane must exist in this Window.',
      });
    }

    if (window.maximizedPaneId && !paneIds.has(window.maximizedPaneId)) {
      violations.push({
        code: 'invalid-maximized-pane',
        path: `${basePath}.maximizedPaneId`,
        message: 'The maximized Pane must exist in this Window.',
      });
    }
  }

  return violations;
}

export function assertProjectEditorLayoutInvariants(
  state: ProjectEditorLayoutState,
): asserts state is ProjectEditorLayoutState {
  const violations = getProjectEditorLayoutInvariantViolations(state);

  if (violations.length > 0) {
    throw new Error(
      `Invalid Project Editor layout:\n${violations.map((violation) => `- ${violation.path}: ${violation.message}`).join('\n')}`,
    );
  }
}

function createNormalizationContext(): NormalizationContext {
  return { nodeIds: new Set(), tabIds: new Set(), floatingIds: new Set() };
}

function normalizePaneNode(input: unknown, context: NormalizationContext): ProjectEditorPaneNode | null {
  const record = asRecord(input);

  if (!record) {
    return null;
  }

  if (record.type === 'split' || 'first' in record || 'second' in record) {
    const first = normalizePaneNode(record.first, context);
    const second = normalizePaneNode(record.second, context);

    if (!first) {
      return second;
    }

    if (!second) {
      return first;
    }

    return {
      type: 'split',
      id: uniqueId(context.nodeIds, nonEmptyString(record.id), 'split'),
      direction: record.direction === 'vertical' ? 'vertical' : 'horizontal',
      ratio: normalizeSplitRatio(record.ratio),
      first,
      second,
    };
  }

  if (record.type !== 'leaf' && !Array.isArray(record.tabs)) {
    return null;
  }

  const tabs = (Array.isArray(record.tabs) ? record.tabs : [])
    .map((tab) => normalizeTab(tab, context))
    .filter((tab): tab is ProjectEditorTab => Boolean(tab));

  if (tabs.length === 0) {
    tabs.push({
      id: uniqueId(context.tabIds, DEFAULT_PROJECT_EDITOR_TAB_ID, 'tab'),
      panel: 'editor',
    });
  }

  const requestedActiveTabId = nonEmptyString(record.activeTabId);

  return {
    type: 'leaf',
    id: uniqueId(context.nodeIds, nonEmptyString(record.id), 'pane'),
    tabs,
    activeTabId:
      requestedActiveTabId && tabs.some((tab) => tab.id === requestedActiveTabId) ? requestedActiveTabId : tabs[0].id,
  };
}

function normalizeTab(input: unknown, context: NormalizationContext): ProjectEditorTab | null {
  const record = asRecord(input);
  const panel = normalizeTool(record?.panel);

  if (!record || !panel) {
    return null;
  }

  return {
    id: uniqueId(context.tabIds, nonEmptyString(record.id), `tab-${panel}`),
    panel,
    ...(typeof record.pinned === 'boolean' ? { pinned: record.pinned } : {}),
    ...(typeof record.filePath === 'string' && record.filePath.length > 0 ? { filePath: record.filePath } : {}),
    ...(typeof record.preview === 'boolean' ? { preview: record.preview } : {}),
  };
}

function normalizeFloatingPane(
  input: unknown,
  context: NormalizationContext,
  fallbackZIndex: number,
  usedZIndexes: Set<number>,
): ProjectEditorFloatingPane | null {
  const record = asRecord(input);
  const paneInput = record?.pane ?? input;
  const paneRecord = asRecord(paneInput);

  if (!record || !paneRecord || paneRecord.type === 'split' || 'first' in paneRecord || 'second' in paneRecord) {
    return null;
  }

  const pane = normalizePaneNode(paneInput, context);

  if (!pane || pane.type !== 'leaf') {
    return null;
  }

  let zIndex = normalizeZIndex(record.zIndex, fallbackZIndex);

  while (usedZIndexes.has(zIndex)) {
    zIndex += 1;
  }

  usedZIndexes.add(zIndex);

  return {
    id: uniqueId(context.floatingIds, nonEmptyString(record.id) ?? `floating-${pane.id}`, 'floating'),
    pane,
    bounds: normalizeFloatingBounds(record.bounds),
    zIndex,
    ...normalizeFloatingPaneDockOrigin(record.dockOrigin ?? record.origin),
  };
}

function normalizeTypedTabs(tabs: ProjectEditorTab[], usedIds: Set<string>): ProjectEditorTab[] {
  const normalized: ProjectEditorTab[] = [];

  for (const tab of tabs) {
    if (!isProjectEditorTool(tab.panel)) {
      continue;
    }

    normalized.push({
      ...cloneTab(tab),
      id: uniqueId(usedIds, tab.id, `tab-${tab.panel}`),
    });
  }

  return normalized;
}

function normalizeReducerTab(tab: ProjectEditorTab, usedIds: Set<string>, preferredId?: string): ProjectEditorTab {
  const panel = isProjectEditorTool(tab.panel) ? tab.panel : 'editor';

  return {
    ...cloneTab(tab),
    id: uniqueId(usedIds, preferredId ?? tab.id, `tab-${panel}`),
    panel,
  };
}

function normalizeTool(input: unknown): ProjectEditorTool | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }

  if (PROJECT_EDITOR_TOOL_SET.has(input)) {
    return input as ProjectEditorTool;
  }

  return LEGACY_TOOL_ALIASES[input];
}

function isProjectEditorTool(input: unknown): input is ProjectEditorTool {
  return typeof input === 'string' && PROJECT_EDITOR_TOOL_SET.has(input);
}

function normalizeSplitRatio(input: unknown): number {
  return clampFiniteNumber(
    input,
    MIN_PROJECT_EDITOR_SPLIT_RATIO,
    MAX_PROJECT_EDITOR_SPLIT_RATIO,
    DEFAULT_PROJECT_EDITOR_SPLIT_RATIO,
  );
}

function normalizeFloatingBounds(input: unknown): ProjectEditorFloatingBounds {
  const record = asRecord(input) ?? {};

  return {
    x: clampFiniteNumber(record.x, 0, MAX_FLOATING_DIMENSION, DEFAULT_FLOATING_BOUNDS.x),
    y: clampFiniteNumber(record.y, 0, MAX_FLOATING_DIMENSION, DEFAULT_FLOATING_BOUNDS.y),
    width: clampFiniteNumber(record.width, MIN_FLOATING_WIDTH, MAX_FLOATING_DIMENSION, DEFAULT_FLOATING_BOUNDS.width),
    height: clampFiniteNumber(
      record.height,
      MIN_FLOATING_HEIGHT,
      MAX_FLOATING_DIMENSION,
      DEFAULT_FLOATING_BOUNDS.height,
    ),
  };
}

function normalizeFloatingPaneDockOrigin(input: unknown): { dockOrigin: ProjectEditorFloatingPaneOrigin } | {} {
  const record = asRecord(input);

  if (!record || !Array.isArray(record.path)) {
    return {};
  }

  const path = record.path
    .slice(0, 256)
    .map((segment) => normalizeFloatingPaneDockOriginSegment(segment))
    .filter((segment): segment is ProjectEditorFloatingPaneOriginPathSegment => Boolean(segment));

  return path.length > 0 ? { dockOrigin: { path } } : {};
}

function normalizeFloatingPaneDockOriginSegment(
  input: unknown,
): ProjectEditorFloatingPaneOriginPathSegment | undefined {
  const record = asRecord(input);
  const splitId = nonEmptyString(record?.splitId);
  const siblingNodeId = nonEmptyString(record?.siblingNodeId ?? record?.siblingId);
  const direction = record?.direction;
  const branch = record?.branch ?? record?.side;

  if (
    !splitId ||
    !siblingNodeId ||
    (direction !== 'horizontal' && direction !== 'vertical') ||
    (branch !== 'first' && branch !== 'second')
  ) {
    return undefined;
  }

  return {
    splitId,
    siblingNodeId,
    direction,
    branch,
    ratio: normalizeSplitRatio(record?.ratio),
  };
}

function normalizeZIndex(input: unknown, fallback: number): number {
  return clampInteger(typeof input === 'number' ? input : fallback, 1, 2_147_483_647);
}

function findPaneInNode(node: ProjectEditorPaneNode | null, paneId: string): ProjectEditorPaneLeaf | undefined {
  if (!node) {
    return undefined;
  }

  if (node.type === 'leaf') {
    return node.id === paneId ? node : undefined;
  }

  return findPaneInNode(node.first, paneId) ?? findPaneInNode(node.second, paneId);
}

function findNodeInTree(node: ProjectEditorPaneNode | null, nodeId: string): ProjectEditorPaneNode | undefined {
  if (!node) {
    return undefined;
  }

  if (node.id === nodeId) {
    return node;
  }

  return node.type === 'split'
    ? (findNodeInTree(node.first, nodeId) ?? findNodeInTree(node.second, nodeId))
    : undefined;
}

function captureFloatingPaneDockOrigin(
  root: ProjectEditorPaneNode | null,
  paneId: string,
): { dockOrigin: ProjectEditorFloatingPaneOrigin } | {} {
  const path = findPaneOriginPath(root, paneId);
  return path && path.length > 0 ? { dockOrigin: { path } } : {};
}

function findPaneOriginPath(
  node: ProjectEditorPaneNode | null,
  paneId: string,
  path: ProjectEditorFloatingPaneOriginPathSegment[] = [],
): ProjectEditorFloatingPaneOriginPathSegment[] | undefined {
  if (!node) {
    return undefined;
  }

  if (node.type === 'leaf') {
    return node.id === paneId ? path : undefined;
  }

  const inFirst = findPaneOriginPath(node.first, paneId, [
    ...path,
    {
      splitId: node.id,
      direction: node.direction,
      ratio: node.ratio,
      branch: 'first',
      siblingNodeId: node.second.id,
    },
  ]);

  if (inFirst) {
    return inFirst;
  }

  return findPaneOriginPath(node.second, paneId, [
    ...path,
    {
      splitId: node.id,
      direction: node.direction,
      ratio: node.ratio,
      branch: 'second',
      siblingNodeId: node.first.id,
    },
  ]);
}

function restorePaneAtDockOrigin(
  windowState: ProjectEditorWindowState,
  floating: ProjectEditorFloatingPane,
  options: DockPaneOptions,
): ProjectEditorPaneNode | undefined {
  const root = windowState.root;
  const origin = floating.dockOrigin;
  const directParent = origin?.path.at(-1);

  if (!root || !directParent) {
    return undefined;
  }

  const sibling = findNodeInTree(root, directParent.siblingNodeId);

  if (!sibling) {
    return undefined;
  }

  const ids = collectWindowIds(windowState);
  const restoredPane = clonePane(floating.pane);

  const split: ProjectEditorPaneSplit = {
    type: 'split',
    id: uniqueId(ids.nodeIds, options.splitId ?? directParent.splitId, 'split'),
    direction: directParent.direction,
    ratio: options.ratio === undefined ? directParent.ratio : normalizeSplitRatio(options.ratio),
    first: directParent.branch === 'first' ? restoredPane : sibling,
    second: directParent.branch === 'second' ? restoredPane : sibling,
  };

  return replaceNodeInTree(root, sibling.id, split) ?? undefined;
}

function firstPane(node: ProjectEditorPaneNode | null): ProjectEditorPaneLeaf | undefined {
  if (!node) {
    return undefined;
  }

  return node.type === 'leaf' ? node : (firstPane(node.first) ?? firstPane(node.second));
}

function collectPanesFromNode(
  node: ProjectEditorPaneNode | null,
  result: ProjectEditorPaneLeaf[] = [],
): ProjectEditorPaneLeaf[] {
  if (!node) {
    return result;
  }

  if (node.type === 'leaf') {
    result.push(node);
  } else {
    collectPanesFromNode(node.first, result);
    collectPanesFromNode(node.second, result);
  }

  return result;
}

function allPanesFromParts(
  root: ProjectEditorPaneNode | null,
  floatingPanes: ProjectEditorFloatingPane[],
): ProjectEditorPaneLeaf[] {
  return [...collectPanesFromNode(root), ...floatingPanes.map((floating) => floating.pane)];
}

export function findPaneContainingTab(
  windowState: ProjectEditorWindowState,
  tabId: string,
): ProjectEditorPaneLeaf | undefined {
  return collectPanes(windowState).find((pane) => pane.tabs.some((tab) => tab.id === tabId));
}

function replacePaneInNode(
  node: ProjectEditorPaneNode | null,
  paneId: string,
  replacement: ProjectEditorPaneLeaf,
): ProjectEditorPaneNode | null {
  return replaceNodeInTree(node, paneId, replacement);
}

function replaceNodeInTree(
  node: ProjectEditorPaneNode | null,
  nodeId: string,
  replacement: ProjectEditorPaneNode,
): ProjectEditorPaneNode | null {
  if (!node) {
    return null;
  }

  if (node.id === nodeId) {
    return replacement;
  }

  if (node.type === 'leaf') {
    return node;
  }

  const first = replaceNodeInTree(node.first, nodeId, replacement);
  const second = replaceNodeInTree(node.second, nodeId, replacement);

  return first === node.first && second === node.second ? node : { ...node, first: first!, second: second! };
}

function removePaneFromNode(node: ProjectEditorPaneNode | null, paneId: string): ProjectEditorPaneNode | null {
  if (!node) {
    return null;
  }

  if (node.type === 'leaf') {
    return node.id === paneId ? null : node;
  }

  const first = removePaneFromNode(node.first, paneId);
  const second = removePaneFromNode(node.second, paneId);

  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function removePane(windowState: ProjectEditorWindowState, paneId: string): ProjectEditorWindowState {
  return {
    ...windowState,
    root: removePaneFromNode(windowState.root, paneId),
    floatingPanes: windowState.floatingPanes.filter((floating) => floating.pane.id !== paneId),
  };
}

function updatePaneWithoutFallback(
  windowState: ProjectEditorWindowState,
  paneId: string,
  updater: (pane: ProjectEditorPaneLeaf) => ProjectEditorPaneLeaf | null,
): ProjectEditorWindowState {
  const current = findPane(windowState, paneId);

  if (!current) {
    return windowState;
  }

  const updated = updater(clonePane(current));

  if (!updated || updated.tabs.length === 0) {
    return removePane(windowState, paneId);
  }

  const nextPane = { ...updated, type: 'leaf' as const, id: current.id };

  return {
    ...windowState,
    root: replacePaneInNode(windowState.root, paneId, nextPane),
    floatingPanes: windowState.floatingPanes.map((floating) =>
      floating.pane.id === paneId ? { ...floating, pane: nextPane } : floating,
    ),
  };
}

function pruneEmptyPanes(node: ProjectEditorPaneNode | null): ProjectEditorPaneNode | null {
  if (!node) {
    return null;
  }

  if (node.type === 'leaf') {
    return node.tabs.length > 0 ? repairPaneActiveTab(node) : null;
  }

  const first = pruneEmptyPanes(node.first);
  const second = pruneEmptyPanes(node.second);

  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function repairPaneActiveTab(pane: ProjectEditorPaneLeaf): ProjectEditorPaneLeaf {
  return pane.tabs.some((tab) => tab.id === pane.activeTabId) ? pane : { ...pane, activeTabId: pane.tabs[0].id };
}

function finalizeWindow(windowState: ProjectEditorWindowState): ProjectEditorWindowState {
  return finalizeWindowReferences(collapseEmptyPanesWithoutFinalize(windowState));
}

function collapseEmptyPanesWithoutFinalize(windowState: ProjectEditorWindowState): ProjectEditorWindowState {
  return {
    ...windowState,
    root: pruneEmptyPanes(windowState.root),
    floatingPanes: windowState.floatingPanes
      .filter((floating) => floating.pane.tabs.length > 0)
      .map((floating) => ({ ...floating, pane: repairPaneActiveTab(floating.pane) })),
  };
}

function finalizeWindowReferences(windowState: ProjectEditorWindowState): ProjectEditorWindowState {
  const panes = allPanesFromParts(windowState.root, windowState.floatingPanes);

  if (panes.length === 0) {
    const fallback = createProjectEditorPane();

    return {
      ...windowState,
      root: fallback,
      floatingPanes: [],
      activePaneId: fallback.id,
      maximizedPaneId: undefined,
    };
  }

  const paneIds = new Set(panes.map((pane) => pane.id));
  const activePaneId = paneIds.has(windowState.activePaneId) ? windowState.activePaneId : panes[0].id;

  const maximizedPaneId =
    windowState.maximizedPaneId && paneIds.has(windowState.maximizedPaneId) ? windowState.maximizedPaneId : undefined;

  return {
    ...windowState,
    activePaneId,
    ...(maximizedPaneId ? { maximizedPaneId } : { maximizedPaneId: undefined }),
  };
}

function updateSplitInNode(
  node: ProjectEditorPaneNode | null,
  splitId: string,
  updater: (split: ProjectEditorPaneSplit) => ProjectEditorPaneSplit,
): ProjectEditorPaneNode | null {
  if (!node || node.type === 'leaf') {
    return node;
  }

  if (node.id === splitId) {
    return updater(node);
  }

  const first = updateSplitInNode(node.first, splitId, updater);
  const second = updateSplitInNode(node.second, splitId, updater);

  return first === node.first && second === node.second ? node : { ...node, first: first!, second: second! };
}

function collectWindowIds(windowState: ProjectEditorWindowState): {
  nodeIds: Set<string>;
  tabIds: Set<string>;
  floatingIds: Set<string>;
} {
  const nodeIds = new Set<string>();
  const tabIds = new Set<string>();
  const floatingIds = new Set(windowState.floatingPanes.map((floating) => floating.id));

  const visitNode = (node: ProjectEditorPaneNode | null) => {
    if (!node) {
      return;
    }

    nodeIds.add(node.id);

    if (node.type === 'leaf') {
      node.tabs.forEach((tab) => tabIds.add(tab.id));
    } else {
      visitNode(node.first);
      visitNode(node.second);
    }
  };

  visitNode(windowState.root);

  for (const floating of windowState.floatingPanes) {
    nodeIds.add(floating.pane.id);
    floating.pane.tabs.forEach((tab) => tabIds.add(tab.id));
  }

  return { nodeIds, tabIds, floatingIds };
}

function nextFloatingZIndex(windowState: ProjectEditorWindowState): number {
  return Math.max(0, ...windowState.floatingPanes.map((floating) => floating.zIndex)) + 1;
}

function inspectNode(
  node: ProjectEditorPaneNode | null,
  path: string,
  violations: ProjectEditorLayoutInvariantViolation[],
  nodeIds: Set<string>,
  paneIds: Set<string>,
  tabIds: Set<string>,
): void {
  if (!node) {
    return;
  }

  if (node.type === 'leaf') {
    inspectPane(node, path, violations, nodeIds, paneIds, tabIds);
    return;
  }

  if (nodeIds.has(node.id)) {
    violations.push({
      code: 'duplicate-node-id',
      path: `${path}.id`,
      message: `Node id ${node.id} is duplicated.`,
    });
  }

  nodeIds.add(node.id);

  if (
    !Number.isFinite(node.ratio) ||
    node.ratio < MIN_PROJECT_EDITOR_SPLIT_RATIO ||
    node.ratio > MAX_PROJECT_EDITOR_SPLIT_RATIO
  ) {
    violations.push({
      code: 'invalid-split-ratio',
      path: `${path}.ratio`,
      message: 'Split ratio must be finite and between 0.1 and 0.9.',
    });
  }

  inspectNode(node.first, `${path}.first`, violations, nodeIds, paneIds, tabIds);
  inspectNode(node.second, `${path}.second`, violations, nodeIds, paneIds, tabIds);
}

function inspectPane(
  pane: ProjectEditorPaneLeaf,
  path: string,
  violations: ProjectEditorLayoutInvariantViolation[],
  nodeIds: Set<string>,
  paneIds: Set<string>,
  tabIds: Set<string>,
): void {
  if (nodeIds.has(pane.id)) {
    violations.push({
      code: 'duplicate-node-id',
      path: `${path}.id`,
      message: `Node id ${pane.id} is duplicated.`,
    });
  }

  nodeIds.add(pane.id);

  if (paneIds.has(pane.id)) {
    violations.push({
      code: 'duplicate-pane-id',
      path: `${path}.id`,
      message: `Pane id ${pane.id} is duplicated.`,
    });
  }

  paneIds.add(pane.id);

  if (pane.tabs.length === 0) {
    violations.push({
      code: 'empty-pane',
      path: `${path}.tabs`,
      message: 'A Pane must contain at least one Tab.',
    });
  }

  for (let index = 0; index < pane.tabs.length; index += 1) {
    const tab = pane.tabs[index];

    if (!isProjectEditorTool(tab.panel)) {
      violations.push({
        code: 'invalid-tab-tool',
        path: `${path}.tabs.${index}.panel`,
        message: 'A Tab must contain exactly one supported Project Editor tool.',
      });
    }

    if (tabIds.has(tab.id)) {
      violations.push({
        code: 'duplicate-tab-id',
        path: `${path}.tabs.${index}.id`,
        message: `Tab id ${tab.id} is duplicated.`,
      });
    }

    tabIds.add(tab.id);
  }

  if (!pane.tabs.some((tab) => tab.id === pane.activeTabId)) {
    violations.push({
      code: 'invalid-active-tab',
      path: `${path}.activeTabId`,
      message: 'The active Tab must belong to its Pane.',
    });
  }
}

function isValidFloatingBounds(bounds: ProjectEditorFloatingBounds): boolean {
  return (
    Number.isFinite(bounds.x) &&
    bounds.x >= 0 &&
    Number.isFinite(bounds.y) &&
    bounds.y >= 0 &&
    Number.isFinite(bounds.width) &&
    bounds.width >= MIN_FLOATING_WIDTH &&
    Number.isFinite(bounds.height) &&
    bounds.height >= MIN_FLOATING_HEIGHT
  );
}

function isValidFloatingPaneDockOrigin(origin: ProjectEditorFloatingPaneOrigin): boolean {
  return (
    Array.isArray(origin.path) &&
    origin.path.length > 0 &&
    origin.path.every(
      (segment) =>
        Boolean(nonEmptyString(segment.splitId)) &&
        Boolean(nonEmptyString(segment.siblingNodeId)) &&
        (segment.direction === 'horizontal' || segment.direction === 'vertical') &&
        (segment.branch === 'first' || segment.branch === 'second') &&
        Number.isFinite(segment.ratio) &&
        segment.ratio >= MIN_PROJECT_EDITOR_SPLIT_RATIO &&
        segment.ratio <= MAX_PROJECT_EDITOR_SPLIT_RATIO,
    )
  );
}

function isPaneLike(input: unknown): boolean {
  const record = asRecord(input);
  return Boolean(record && (record.type === 'leaf' || record.type === 'split' || Array.isArray(record.tabs)));
}

function asRecord(input: unknown): UnknownRecord | undefined {
  return input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as UnknownRecord) : undefined;
}

function nonEmptyString(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }

  const value = input.trim();

  return value.length > 0 ? value : undefined;
}

function uniqueId(usedIds: Set<string>, preferred: unknown, fallbackPrefix: string): string {
  const base = nonEmptyString(preferred) ?? fallbackPrefix;

  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }

  let suffix = 2;

  while (usedIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  const id = `${base}-${suffix}`;
  usedIds.add(id);

  return id;
}

function uniqueRecordKey(record: Record<string, unknown>, preferred: string, fallbackPrefix: string): string {
  const used = new Set(Object.keys(record));
  return uniqueId(used, preferred, fallbackPrefix);
}

function clampFiniteNumber(input: unknown, min: number, max: number, fallback: number): number {
  const value = typeof input === 'number' && Number.isFinite(input) ? input : fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInteger(input: unknown, min: number, max: number): number {
  const value = typeof input === 'number' && Number.isFinite(input) ? Math.round(input) : min;
  return Math.min(max, Math.max(min, value));
}

function cloneTab(tab: ProjectEditorTab): ProjectEditorTab {
  return { ...tab };
}

function clonePane(pane: ProjectEditorPaneLeaf): ProjectEditorPaneLeaf {
  return { ...pane, tabs: pane.tabs.map(cloneTab) };
}
