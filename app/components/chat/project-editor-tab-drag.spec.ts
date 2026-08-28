import { describe, expect, it } from 'vitest';

import {
  TAB_DRAG_PANE_MIME,
  TAB_DRAG_TAB_MIME,
  dropSlotForTab,
  isProjectEditorTabDrag,
  samePaneReorderIndex,
} from './project-editor-tab-drag';
import {
  createProjectEditorTab,
  createProjectEditorWindow,
  findPane,
  moveTab,
  reorderTab,
  splitPane,
  type ProjectEditorWindowState,
} from '~/lib/project-editor-layout';

describe('dropSlotForTab', () => {
  const bounds = { left: 100, width: 80 };

  it('inserts before the tab when the pointer sits left of its midpoint', () => {
    expect(dropSlotForTab(3, 120, bounds)).toBe(3);
  });

  it('inserts after the tab when the pointer sits right of its midpoint', () => {
    expect(dropSlotForTab(3, 160, bounds)).toBe(4);
  });

  it('treats the exact midpoint as "before" so the gesture is deterministic', () => {
    expect(dropSlotForTab(0, 140, bounds)).toBe(0);
  });
});

describe('samePaneReorderIndex', () => {
  it('shifts the slot down by one when the tab travels rightwards', () => {
    // Tab at 0 dropped into slot 2 of [a,b,c] lands at post-removal index 1.
    expect(samePaneReorderIndex(0, 2, 3)).toBe(1);
  });

  it('keeps the slot when the tab travels leftwards', () => {
    expect(samePaneReorderIndex(2, 0, 3)).toBe(0);
  });

  it('returns null for a no-op drop on either side of the dragged tab', () => {
    expect(samePaneReorderIndex(1, 1, 3)).toBeNull();
    expect(samePaneReorderIndex(1, 2, 3)).toBeNull();
  });

  it('returns null when the pane holds a single tab', () => {
    expect(samePaneReorderIndex(0, 1, 1)).toBeNull();
  });

  it('clamps an append slot to the last index', () => {
    expect(samePaneReorderIndex(0, 3, 3)).toBe(2);
  });
});

describe('isProjectEditorTabDrag', () => {
  it('accepts a drag carrying the tab payload', () => {
    expect(isProjectEditorTabDrag([TAB_DRAG_PANE_MIME, TAB_DRAG_TAB_MIME])).toBe(true);
  });

  it('rejects an unrelated drag such as a file drop', () => {
    expect(isProjectEditorTabDrag(['Files', 'text/plain'])).toBe(false);
  });
});

/**
 * The slot convention only earns its keep if it produces the right order once
 * fed to the engine. These drive the real engine transforms end to end.
 */
describe('slot maths against the layout engine', () => {
  function twoPaneWindow(): { state: ProjectEditorWindowState; leftId: string; rightId: string } {
    let state = createProjectEditorWindow('window-test');

    const [firstPane] = [state.root as { id: string; tabs: Array<{ id: string }> }];

    state = splitPane(state, { paneId: firstPane.id, direction: 'horizontal' });

    const paneIds: string[] = [];

    const walk = (node: any) => {
      if (node.type === 'leaf') {
        paneIds.push(node.id);
        return;
      }

      walk(node.first);
      walk(node.second);
    };
    walk(state.root);

    return { state, leftId: paneIds[0], rightId: paneIds[1] };
  }

  it('reorders within a pane using the converted post-removal index', () => {
    let state = createProjectEditorWindow('window-test');

    const paneId = (state.root as any).id;

    state = { ...state, root: { ...(state.root as any), tabs: [], activeTabId: '' } } as ProjectEditorWindowState;

    // Rebuild a deterministic 3-tab pane (distinct ids — the factory defaults them).
    const tabs = (['files', 'terminal', 'git'] as const).map((panel) => createProjectEditorTab(panel, `tab-${panel}`));
    state = {
      ...state,
      root: { type: 'leaf', id: paneId, tabs, activeTabId: tabs[0].id },
    } as ProjectEditorWindowState;

    // Drag "files" (index 0) onto the right half of "git" (index 2) → slot 3.
    const target = samePaneReorderIndex(0, 3, 3);
    expect(target).toBe(2);

    const next = reorderTab(state, { paneId, tabId: tabs[0].id, toIndex: target! });

    expect(findPane(next, paneId)!.tabs.map((tab) => tab.panel)).toEqual(['terminal', 'git', 'files']);
  });

  it('MOVES a tab across panes instead of swapping it', () => {
    const { state, leftId, rightId } = twoPaneWindow();

    const leftBefore = findPane(state, leftId)!;
    const rightBefore = findPane(state, rightId)!;
    const travelling = leftBefore.tabs[0];

    const next = moveTab(state, {
      tabId: travelling.id,
      sourcePaneId: leftId,
      targetPaneId: rightId,
      toIndex: 0,
    });

    const rightAfter = findPane(next, rightId)!;

    // The destination gained the tab at the requested slot...
    expect(rightAfter.tabs[0].id).toBe(travelling.id);
    expect(rightAfter.tabs).toHaveLength(rightBefore.tabs.length + 1);

    // ...and nothing travelled back the other way (the old swap behaviour).
    const leftAfter = findPane(next, leftId);
    const leftTabIds = leftAfter?.tabs.map((tab) => tab.id) ?? [];
    expect(leftTabIds).not.toContain(travelling.id);
    expect(rightAfter.tabs.filter((tab) => tab.id === travelling.id)).toHaveLength(1);
  });

  it('collapses the source pane when its last tab is dragged away', () => {
    const { state, leftId, rightId } = twoPaneWindow();

    let next = state;

    for (const tab of findPane(state, leftId)!.tabs) {
      next = moveTab(next, { tabId: tab.id, sourcePaneId: leftId, targetPaneId: rightId });
    }

    expect(findPane(next, leftId)).toBeUndefined();
    expect(findPane(next, rightId)).toBeDefined();
  });
});
