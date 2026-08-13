import {
  collectPanes,
  createProjectEditorPane,
  createProjectEditorTab,
  normalizeProjectEditorWindow,
  updatePane,
  type ProjectEditorPaneNode,
  type ProjectEditorWindowState,
} from './project-editor-layout';

export interface PersistedIdeWindowInput {
  paneTree?: unknown;
  floatingPanes?: unknown;
  activePaneId?: unknown;
}

const PREVIEW_INSTANCE_SEPARATOR = '~';

function encodePreviewInstanceSegment(value: string): string {
  return encodeURIComponent(value).replace(/~/g, '%7E');
}

/**
 * Stable, delimiter-safe identity for one Preview tab across React remounts.
 * Tab ids are only unique inside an IDE window, so both dimensions are part
 * of the identity. The explicit escaping keeps user-controlled `peWindow`
 * values from aliasing another window/tab pair.
 */
export function createPreviewLifecycleInstanceId(windowId: string, tabId: string): string {
  return `${encodePreviewInstanceSegment(windowId)}${PREVIEW_INSTANCE_SEPARATOR}${encodePreviewInstanceSegment(tabId)}`;
}

export function previewLifecycleWindowInstancePrefix(windowId: string): string {
  return `${encodePreviewInstanceSegment(windowId)}${PREVIEW_INSTANCE_SEPARATOR}`;
}

/**
 * Restores one IDE window in a single global normalization context. This keeps
 * pane/tab ids unique across docked and floating panes and repairs legacy or
 * truncated layouts that lost either of the two core Editor/Webview tabs.
 */
export function normalizePersistedIdeWindow(
  input: PersistedIdeWindowInput,
): ProjectEditorWindowState & { root: ProjectEditorPaneNode } {
  let normalized = normalizeProjectEditorWindow({
    id: 'window-restored',
    root: input.paneTree,
    floatingPanes: input.floatingPanes,
    activePaneId: input.activePaneId,
  });

  if (!normalized.root) {
    const existingPanes = collectPanes(normalized);
    const paneIds = new Set(existingPanes.map((pane) => pane.id));
    const tabIds = new Set(existingPanes.flatMap((pane) => pane.tabs.map((tab) => tab.id)));

    const freshId = (used: ReadonlySet<string>, base: string) => {
      let candidate = base;
      let suffix = 2;

      while (used.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
      }

      return candidate;
    };
    const fallbackRoot = createProjectEditorPane(freshId(paneIds, 'pane-core'), [
      createProjectEditorTab('editor', freshId(tabIds, 'tab-editor-core')),
      { ...createProjectEditorTab('preview', freshId(tabIds, 'tab-preview-core')), pinned: true },
    ]);
    normalized = normalizeProjectEditorWindow({ ...normalized, root: fallbackRoot });
  }

  const panes = collectPanes(normalized);

  const corePane =
    panes.find((pane) => pane.id === normalized.activePaneId) ?? panes.find((pane) => pane.type === 'leaf') ?? panes[0];

  if (corePane && !panes.some((pane) => pane.tabs.some((tab) => tab.panel === 'editor'))) {
    const usedTabIds = new Set(panes.flatMap((pane) => pane.tabs.map((tab) => tab.id)));

    let editorId = 'tab-editor-core';
    let suffix = 2;

    while (usedTabIds.has(editorId)) {
      editorId = `tab-editor-core-${suffix}`;
      suffix += 1;
    }
    normalized = updatePane(normalized, corePane.id, (pane) => ({
      ...pane,
      tabs: [createProjectEditorTab('editor', editorId), ...pane.tabs],
    }));
  }

  if (corePane && !collectPanes(normalized).some((pane) => pane.tabs.some((tab) => tab.panel === 'preview'))) {
    const usedTabIds = new Set(collectPanes(normalized).flatMap((pane) => pane.tabs.map((tab) => tab.id)));

    let previewId = 'tab-preview-core';
    let suffix = 2;

    while (usedTabIds.has(previewId)) {
      previewId = `tab-preview-core-${suffix}`;
      suffix += 1;
    }
    normalized = updatePane(normalized, corePane.id, (pane) => ({
      ...pane,
      tabs: [...pane.tabs, { ...createProjectEditorTab('preview', previewId), pinned: true }],
    }));
  }

  const finalWindow = normalizeProjectEditorWindow(normalized);

  if (!finalWindow.root) {
    throw new Error('IDE window normalization failed to restore a docked core pane');
  }

  return { ...finalWindow, root: finalWindow.root };
}

export function collectPreviewTabIds(input: Pick<ProjectEditorWindowState, 'root' | 'floatingPanes'>): Set<string> {
  return new Set(
    collectPanes({
      id: 'preview-tab-scan',
      root: input.root,
      floatingPanes: input.floatingPanes,
      activePaneId: '',
    })
      .flatMap((pane) => pane.tabs)
      .filter((tab) => tab.panel === 'preview')
      .map((tab) => tab.id),
  );
}

export function removedPreviewTabIds(previous: ReadonlySet<string>, current: ReadonlySet<string>): string[] {
  return [...previous].filter((tabId) => !current.has(tabId));
}

export function createPreviewLifecycleOwnerRegistry(schedule: (callback: () => void) => void = queueMicrotask) {
  const owners = new Map<string, number>();

  return {
    acquire(owner: string) {
      owners.set(owner, (owners.get(owner) ?? 0) + 1);
    },
    release(owner: string, clearOwner: (owner: string) => void) {
      const remaining = (owners.get(owner) ?? 1) - 1;

      if (remaining <= 0) {
        owners.delete(owner);
        schedule(() => {
          if (!owners.has(owner)) {
            clearOwner(owner);
          }
        });
      } else {
        owners.set(owner, remaining);
      }
    },
  };
}
