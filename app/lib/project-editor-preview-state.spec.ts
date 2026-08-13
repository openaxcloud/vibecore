import { describe, expect, it } from 'vitest';
import { collectPanes } from './project-editor-layout';
import {
  collectPreviewTabIds,
  createPreviewLifecycleInstanceId,
  createPreviewLifecycleOwnerRegistry,
  normalizePersistedIdeWindow,
  previewLifecycleWindowInstancePrefix,
  removedPreviewTabIds,
} from './project-editor-preview-state';

function allIds(window: ReturnType<typeof normalizePersistedIdeWindow>) {
  const panes = collectPanes(window);
  return {
    paneIds: panes.map((pane) => pane.id),
    tabIds: panes.flatMap((pane) => pane.tabs.map((tab) => tab.id)),
  };
}

describe('normalizePersistedIdeWindow', () => {
  it('repairs editor-only and preview-only legacy layouts', () => {
    const editorOnly = normalizePersistedIdeWindow({
      paneTree: { type: 'leaf', id: 'pane-main', tabs: [{ id: 'editor', panel: 'editor' }], activeTabId: 'editor' },
    });
    expect(collectPanes(editorOnly).flatMap((pane) => pane.tabs.map((tab) => tab.panel))).toContain('preview');
    expect(
      collectPanes(editorOnly)
        .flatMap((pane) => pane.tabs)
        .find((tab) => tab.panel === 'preview')?.pinned,
    ).toBe(true);

    const previewOnly = normalizePersistedIdeWindow({
      paneTree: { type: 'leaf', id: 'pane-main', tabs: [{ id: 'preview', panel: 'preview' }], activeTabId: 'preview' },
    });
    expect(collectPanes(previewOnly).flatMap((pane) => pane.tabs.map((tab) => tab.panel))).toContain('editor');
  });

  it('deduplicates persisted split and floating ids globally while preserving a preview pane', () => {
    const restored = normalizePersistedIdeWindow({
      paneTree: {
        type: 'split',
        id: 'split-main',
        direction: 'horizontal',
        first: { type: 'leaf', id: 'pane-main', tabs: [{ id: 'tab-default', panel: 'editor' }] },
        second: { type: 'leaf', id: 'pane-main', tabs: [{ id: 'tab-default', panel: 'preview' }] },
      },
      floatingPanes: [
        {
          id: 'floating-main',
          pane: { type: 'leaf', id: 'pane-main', tabs: [{ id: 'tab-default', panel: 'preview' }] },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          zIndex: 1,
        },
      ],
      activePaneId: 'pane-main',
    });

    const ids = allIds(restored);
    expect(new Set(ids.paneIds).size).toBe(ids.paneIds.length);
    expect(new Set(ids.tabIds).size).toBe(ids.tabIds.length);
    expect(collectPreviewTabIds(restored).size).toBeGreaterThan(0);
    expect(ids.paneIds).toContain(restored.activePaneId);
  });

  it('normalizes a malformed root and floating default ids in one context', () => {
    const restored = normalizePersistedIdeWindow({
      paneTree: {},
      floatingPanes: [
        {
          id: 'floating-main',
          pane: {
            type: 'leaf',
            id: 'pane-main',
            tabs: [
              { id: 'tab-editor-default', panel: 'editor' },
              { id: 'tab-preview-default', panel: 'preview' },
            ],
          },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          zIndex: 1,
        },
      ],
    });

    const ids = allIds(restored);
    expect(new Set(ids.paneIds).size).toBe(ids.paneIds.length);
    expect(new Set(ids.tabIds).size).toBe(ids.tabIds.length);
    expect(ids.paneIds).toContain(restored.activePaneId);
  });

  it('preserves a floating active pane when a split-shaped root is irrecoverable', () => {
    const restored = normalizePersistedIdeWindow({
      paneTree: { type: 'split', id: 'broken', first: null, second: null },
      floatingPanes: [
        {
          id: 'floating-main',
          pane: {
            type: 'leaf',
            id: 'pane-main',
            tabs: [
              { id: 'tab-editor-default', panel: 'editor' },
              { id: 'tab-preview-default', panel: 'preview' },
            ],
            activeTabId: 'tab-preview-default',
          },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          zIndex: 1,
        },
      ],
      activePaneId: 'pane-main',
    });

    const ids = allIds(restored);
    const floating = restored.floatingPanes[0].pane;
    expect(restored.activePaneId).toBe(floating.id);
    expect(floating.tabs.find((tab) => tab.id === floating.activeTabId)?.panel).toBe('preview');
    expect(new Set(ids.paneIds).size).toBe(ids.paneIds.length);
    expect(new Set(ids.tabIds).size).toBe(ids.tabIds.length);
  });

  it('does not rename an active preview whose legacy id resembles the missing editor id', () => {
    const restored = normalizePersistedIdeWindow({
      paneTree: {
        type: 'leaf',
        id: 'pane-main',
        tabs: [{ id: 'tab-editor-default', panel: 'preview' }],
        activeTabId: 'tab-editor-default',
      },
    });

    const pane = collectPanes(restored)[0];
    expect(pane.tabs.find((tab) => tab.id === pane.activeTabId)).toMatchObject({
      id: 'tab-editor-default',
      panel: 'preview',
    });
  });
});

describe('removedPreviewTabIds', () => {
  it('clears only preview instances that disappeared after a committed layout update', () => {
    expect(removedPreviewTabIds(new Set(['preview-a', 'preview-b']), new Set(['preview-b', 'preview-c']))).toEqual([
      'preview-a',
    ]);
    expect(removedPreviewTabIds(new Set(['preview-a']), new Set(['preview-a']))).toEqual([]);
  });
});

describe('preview lifecycle instance identity', () => {
  it('is stable and cannot alias delimiter-like window and tab ids', () => {
    const first = createPreviewLifecycleInstanceId('window:a~b', 'tab:c~d');
    const second = createPreviewLifecycleInstanceId('window', 'a~b~tab:c~d');

    expect(first).not.toBe(second);
    expect(first).toBe(createPreviewLifecycleInstanceId('window:a~b', 'tab:c~d'));
    expect(first.startsWith(previewLifecycleWindowInstancePrefix('window:a~b'))).toBe(true);
    expect(first.startsWith(previewLifecycleWindowInstancePrefix('window'))).toBe(false);
  });
});

describe('preview lifecycle owner registry', () => {
  it('preserves state across a same-project handoff and clears after the last real owner leaves', () => {
    const scheduled: Array<() => void> = [];
    const cleared: string[] = [];
    const registry = createPreviewLifecycleOwnerRegistry((callback) => scheduled.push(callback));
    registry.acquire('project-a');
    registry.release('project-a', (owner) => cleared.push(owner));
    registry.acquire('project-a');
    scheduled.splice(0).forEach((callback) => callback());
    expect(cleared).toEqual([]);

    registry.acquire('project-a');
    registry.release('project-a', (owner) => cleared.push(owner));
    scheduled.splice(0).forEach((callback) => callback());
    expect(cleared).toEqual([]);
    registry.release('project-a', (owner) => cleared.push(owner));
    scheduled.splice(0).forEach((callback) => callback());
    expect(cleared).toEqual(['project-a']);
  });
});
