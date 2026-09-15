import { describe, expect, it } from 'vitest';

import {
  PROJECT_EDITOR_DOCK_TOOLS,
  PROJECT_EDITOR_TOOL_CATALOG,
  PROJECT_EDITOR_TOOL_SHORTCUTS,
  projectEditorToolList,
  projectEditorToolsByCategory,
} from './project-editor-tool-catalog';
import { defaultProjectKeybindings, normalizeCombo } from '~/lib/keybindings';
import { PROJECT_EDITOR_TOOLS } from '~/lib/project-editor-layout';

describe('project editor tool catalog', () => {
  it('covers every tool the layout engine knows about', () => {
    const missing = PROJECT_EDITOR_TOOLS.filter((tool) => !PROJECT_EDITOR_TOOL_CATALOG[tool]);
    expect(missing).toEqual([]);
  });

  it('does not invent tools the engine does not have', () => {
    const known = new Set<string>(PROJECT_EDITOR_TOOLS);
    const extra = Object.keys(PROJECT_EDITOR_TOOL_CATALOG).filter((id) => !known.has(id));
    expect(extra).toEqual([]);
  });

  it('exposes the tools that used to be unreachable from the popup and palette', () => {
    // These were rendered as panels but absent from both hand-maintained lists.
    for (const tool of ['studio', 'domains', 'locks', 'overview', 'logs', 'activity', 'collaborators', 'debugger']) {
      expect(PROJECT_EDITOR_TOOL_CATALOG[tool as never]).toBeDefined();
    }
  });

  it('gives every tool an icon and an accent', () => {
    for (const tool of projectEditorToolList()) {
      expect(tool.icon).toMatch(/^i-ph:/);
      expect(tool.accent).toMatch(/^var\(--vc-ide-/);
    }
  });

  it('places every tool in exactly one rendered category', () => {
    const grouped = projectEditorToolsByCategory().flatMap(([, tools]) => tools.map((tool) => tool.id));

    expect(grouped.slice().sort()).toEqual([...PROJECT_EDITOR_TOOLS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('only docks tools that exist', () => {
    for (const tool of PROJECT_EDITOR_DOCK_TOOLS) {
      expect(PROJECT_EDITOR_TOOL_CATALOG[tool]).toBeDefined();
    }

    expect(new Set(PROJECT_EDITOR_DOCK_TOOLS).size).toBe(PROJECT_EDITOR_DOCK_TOOLS.length);
  });

  it('keeps the dock short enough to fit a tablet-height viewport without scrolling', () => {
    expect(PROJECT_EDITOR_DOCK_TOOLS.length).toBeLessThanOrEqual(9);
  });

  /**
   * A shortcut hint that maps to no registered binding is a lie told to the
   * user; this is the guard against re-introducing one.
   */
  it('only advertises shortcuts that are really bound', () => {
    const bound = new Set(defaultProjectKeybindings.map((binding) => normalizeCombo(binding.combo)));

    for (const [tool, combo] of Object.entries(PROJECT_EDITOR_TOOL_SHORTCUTS)) {
      expect(PROJECT_EDITOR_TOOL_CATALOG[tool as never], `${tool} is not a known tool`).toBeDefined();
      expect(bound.has(normalizeCombo(combo)), `${combo} (${tool}) is not a registered keybinding`).toBe(true);
    }
  });
});
