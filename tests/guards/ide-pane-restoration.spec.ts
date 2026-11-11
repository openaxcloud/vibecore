import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule } from 'typescript';
import { describe, it } from 'vitest';
import {
  collectPanes,
  openTabInPane,
  type ProjectEditorPaneNode,
  type ProjectEditorWindowState,
} from '../../app/lib/project-editor-layout';

// Execute the production normalizer without mounting BaseChat's unrelated services.
const source = readFileSync(new URL('../../app/components/chat/BaseChat.tsx', import.meta.url), 'utf8');
const start = source.indexOf('function collectPaneTabs(');
const end = source.indexOf('function normalizeFloatingPanes(', start);
assert.ok(start >= 0 && end > start, 'The production normalization functions must be present.');

const normalizer = transpileModule(source.slice(start, end), {}).outputText;

const normalize = runInNewContext(normalizer + '\nnormalizePaneTree') as (
  input: ProjectEditorPaneNode,
) => ProjectEditorPaneNode;

function restoredWindow(): ProjectEditorWindowState {
  // Same pane identities and active selection as the failing E2E's persisted layout.
  const root: ProjectEditorPaneNode = {
    type: 'split',
    id: 'split',
    direction: 'horizontal',
    ratio: 0.5,
    first: {
      type: 'leaf',
      id: 'pane-main',
      tabs: [{ id: 'tab-editor-default', panel: 'editor' }],
      activeTabId: 'tab-editor-default',
    },
    second: {
      type: 'leaf',
      id: 'pane',
      tabs: [
        { id: 'tab-deployments', panel: 'deployments', pinned: true },
        { id: 'tab-preview-default', panel: 'preview', pinned: true },
        { id: 'tab-terminal', panel: 'terminal' },
      ],
      activeTabId: 'tab-terminal',
    },
  };

  return { id: 'window-main', root: normalize(root), floatingPanes: [], activePaneId: 'pane' };
}

function openGit(state: ProjectEditorWindowState, paneId: string, tabId = 'tab-git') {
  return openTabInPane(state, { paneId, tab: { id: tabId, panel: 'git' } });
}

describe('persisted pane identity and URL panel opening', () => {
  it('restores both pane IDs and the active pane selection', () => {
    const state = restoredWindow();
    assert.deepEqual(collectPanes(state).map((pane) => pane.id), ['pane-main', 'pane']);
    assert.ok(collectPanes(state).some((pane) => pane.id === state.activePaneId));
  });

  it('opens Git only in the restored active pane without replacing its sibling', () => {
    const state = restoredWindow();
    const sibling = JSON.stringify(collectPanes(state)[0]);
    const next = openGit(state, state.activePaneId);
    const panes = collectPanes(next);
    assert.equal(JSON.stringify(panes[0]), sibling);
    assert.equal(panes[1].activeTabId, 'tab-git');
    assert.equal(panes.flatMap((pane) => pane.tabs).filter((tab) => tab.panel === 'git').length, 1);
    assert.ok(panes[1].tabs.some((tab) => tab.id === 'tab-terminal'));
  });

  it('does not duplicate Git when the same URL effect executes twice', () => {
    const state = restoredWindow();
    const once = openGit(state, state.activePaneId);
    const twice = openGit(once, state.activePaneId, 'second-effect-tab');
    const tabs = collectPanes(twice).flatMap((pane) => pane.tabs).filter((tab) => tab.panel === 'git');
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].id, 'tab-git');
  });

  it('keeps pane identities through a second persistence and restoration cycle', () => {
    const state = restoredWindow();
    const opened = openGit(state, state.activePaneId);
    const restored = { ...opened, root: normalize(JSON.parse(JSON.stringify(opened.root))) };
    const next = openGit(restored, restored.activePaneId, 'reload-tab');
    assert.deepEqual(collectPanes(next).map((pane) => pane.id), ['pane-main', 'pane']);
    assert.equal(collectPanes(next).flatMap((pane) => pane.tabs).filter((tab) => tab.panel === 'git').length, 1);
  });

  it('still permits intentionally opening Git in two distinct panes', () => {
    const state = restoredWindow();
    const first = openGit(state, 'pane-main', 'git-left');
    const second = openGit(first, 'pane', 'git-right');
    assert.deepEqual(
      collectPanes(second).map((pane) => pane.tabs.find((tab) => tab.panel === 'git')?.id),
      ['git-left', 'git-right'],
    );
  });

  it('repairs missing or invalid IDs deterministically without stealing valid IDs', () => {
    for (const invalidId of [undefined, null, 42, '', '   ']) {
      const state = restoredWindow();
      assert.equal(state.root?.type, 'split');
      const input = JSON.parse(JSON.stringify(state.root));
      input.first.id = invalidId;
      input.second.id = 'pane-main';
      const first = normalize(input);
      assert.equal(JSON.stringify(normalize(input)), JSON.stringify(first));
      assert.equal(first.type, 'split');
      if (first.type !== 'split') {
        throw new Error('Expected the restored split.');
      }
      assert.equal(first.first.id, 'pane-main-2');
      assert.equal(first.second.id, 'pane-main');
    }
  });

  it('repairs already persisted duplicate IDs without merging or deleting panes', () => {
    const state = restoredWindow();
    const input = JSON.parse(JSON.stringify(state.root));
    input.second.id = input.first.id;
    const root = normalize(input);
    const repaired = { ...state, root, activePaneId: 'pane-main' };
    assert.deepEqual(collectPanes(repaired).map((pane) => pane.id), ['pane-main', 'pane-main-2']);
    const next = openGit(repaired, repaired.activePaneId);
    assert.equal(collectPanes(next)[0].activeTabId, 'tab-git');
    assert.equal(collectPanes(next)[1].activeTabId, 'tab-terminal');
    assert.equal(collectPanes(next).flatMap((pane) => pane.tabs).filter((tab) => tab.panel === 'git').length, 1);
    assert.equal(JSON.stringify(normalize(root)), JSON.stringify(root));
  });

  it('does not assign a repaired ID already owned by another nested pane', () => {
    const state = restoredWindow();
    const input = JSON.parse(JSON.stringify(state.root));
    input.second = {
      ...input,
      id: 'nested-split',
      first: { ...input.first },
      second: { ...input.second, id: 'pane-main-2' },
    };
    const repaired = { ...state, root: normalize(input) };
    assert.deepEqual(collectPanes(repaired).map((pane) => pane.id), ['pane-main', 'pane-main-3', 'pane-main-2']);
  });

  it('retains the legacy main-pane fallback when no ID was persisted', () => {
    const input = { type: 'leaf', tabs: [], activeTabId: undefined } as unknown as ProjectEditorPaneNode;
    assert.equal(normalize(input).id, 'pane-main');
  });

});
