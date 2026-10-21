import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { projectSelectionToPersist } from './project-selection-to-persist';

// Execute the actual shell effect: a copy of its timer would not catch a regression.
const source = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects: ts.Expression[] = [];

function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(tree) === 'useEffect' &&
    node.arguments[0]?.getText(tree).includes('projectEditorWindows: { ...existingWindows')
  ) {
    effects.push(node.arguments[0]);
  }

  ts.forEachChild(node, visit);
}
visit(tree);
expect(effects).toHaveLength(1);

const compiled = ts.transpileModule(`return (${effects[0].getText(tree)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

afterEach(() => vi.useRealTimers());

function harness(overrides: Record<string, unknown> = {}) {
  const save = vi.fn().mockResolvedValue(undefined);

  const bindings = {
    projectIdeMode: true,
    projectId: 'project-a',
    currentWorkspaceId: 'workspace-a',
    projectStateReady: true,
    restoredProjectSelectionScope: { current: { projectId: 'project-a', workspaceId: 'workspace-a' } },
    paneTree: { type: 'leaf', id: 'pane-main', tabs: [] },
    activePaneId: 'floating-a',
    floatingPanes: [{ id: 'floating-a', bounds: { x: 10, y: 20, width: 500, height: 400 } }],
    selectedFile: '/home/project/README.md',
    pendingProjectSelectedFile: { current: '/home/project/audit.txt' },
    currentView: 'code',
    rightPanelOpen: true,
    rightPanelMode: 'files',
    rightPanelWidth: 300,
    workspaceTabs: ['editor'],
    activeWorkspacePanel: 'editor',
    isSecondaryProjectEditorWindow: false,
    projectEditorWindowId: 'window-main',
    agentWidth: 300,
    terminalBottomOpen: false,
    terminalBottomHeight: 320,
    cursorPositions: {},
    scrollPositions: {},
    recentTabIds: [],
    closedTabs: [],
    mobilePanel: 'editor',
    editorMinimapEnabled: true,
    backendLockedItems: [],
    backendDeletedPaths: [],
    getProjectIdeMemorySync: () => ({ ui: { projectEditorWindows: { sibling: { activePaneId: 'sibling-pane' } } } }),
    saveProjectIdeMemory: save,
    projectSelectionToPersist,
    window: { setTimeout, clearTimeout },
    ...overrides,
  };
  const effect = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as () =>
    | undefined
    | (() => void);

  return { effect, save, bindings };
}

it('hands the latest layout to durable memory before immediate unmount, preserving pending selection and sibling windows', () => {
  vi.useFakeTimers();

  const { effect, save, bindings } = harness();
  const cleanup = effect();
  cleanup?.();
  expect(save).toHaveBeenCalledWith(
    'project-a',
    {
      ui: expect.objectContaining({
        floatingPanes: bindings.floatingPanes,
        selectedFile: '/home/project/audit.txt',
        projectEditorWindows: {
          sibling: { activePaneId: 'sibling-pane' },
          'window-main': expect.objectContaining({ floatingPanes: bindings.floatingPanes }),
        },
      }),
    },
    'workspace-a',
  );
});

it('does not persist an unrestored layout', () => {
  const { effect, save } = harness({ projectStateReady: false });
  effect();
  expect(save).not.toHaveBeenCalled();
});

it('a secondary window does not overwrite the primary layout', () => {
  const { effect, save } = harness({ isSecondaryProjectEditorWindow: true, projectEditorWindowId: 'secondary' });
  effect();
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][1].ui).not.toHaveProperty('paneTree');
  expect(save.mock.calls[0][1].ui.projectEditorWindows.secondary).toHaveProperty('floatingPanes');
});

it('does not let the UI fallback overwrite a layout whose restoration is still pending', () => {
  const { effect, save } = harness({ restoredProjectSelectionScope: { current: undefined } });
  effect();
  expect(save).not.toHaveBeenCalled();
});
