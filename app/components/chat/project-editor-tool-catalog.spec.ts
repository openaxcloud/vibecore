import { describe, expect, it } from 'vitest';

import {
  PROJECT_EDITOR_DOCK_TOOLS,
  PROJECT_EDITOR_TOOL_ALIASES,
  PROJECT_EDITOR_TOOL_CATALOG,
  PROJECT_EDITOR_TOOL_SHORTCUTS,
  projectEditorToolAlias,
  projectEditorToolCatalogList,
  projectEditorToolList,
  projectEditorToolsByCategory,
  resolveProjectEditorTool,
  resolveProjectEditorToolOpen,
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
    for (const tool of projectEditorToolCatalogList()) {
      expect(tool.icon).toMatch(/^i-ph:/);
      expect(tool.accent).toMatch(/^var\(--vc-ide-/);
    }
  });

  it('places every tool in exactly one rendered category', () => {
    const grouped = projectEditorToolsByCategory('search').flatMap(([, tools]) => tools.map((tool) => tool.id));

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

/**
 * Avi, screenshots in hand: "why do I have a dedicated Domains panel, it's
 * already in Deployments?". It was: the standalone `domains` panel and the
 * Deploy → Domains tab render the SAME `ProjectDomainsPanel`, so the All-tools
 * grid offered two cards for one screen — and the standalone one was a dead end
 * before the first deployment, since the screen itself says the CNAME/A
 * instructions unlock only after a deploy is READY.
 *
 * The previous attempt at this consolidation was held by a code COMMENT ("the
 * standalone Domains panel is removed from the Add-tab selector"), and
 * RPL-IDE-001.5 undid it without a single red test. That is what these guards
 * are for.
 */
describe('project editor tool aliases', () => {
  it('routes domains to the Deployments tab that owns the screen', () => {
    expect(projectEditorToolAlias('domains')).toEqual({ tool: 'deployments', view: 'domains' });
    expect(resolveProjectEditorTool('domains')).toBe('deployments');
  });

  it('leaves a tool that owns its own screen alone', () => {
    expect(projectEditorToolAlias('deployments')).toBeUndefined();
    expect(resolveProjectEditorTool('deployments')).toBe('deployments');
  });

  it('only aliases to real tools, and never chains an alias to another alias', () => {
    for (const [id, alias] of Object.entries(PROJECT_EDITOR_TOOL_ALIASES)) {
      expect(PROJECT_EDITOR_TOOL_CATALOG[alias!.tool], `${id} aliases an unknown tool`).toBeDefined();
      expect(PROJECT_EDITOR_TOOL_ALIASES[alias!.tool], `${id} chains through another alias`).toBeUndefined();
      expect(alias!.tool, `${id} aliases itself`).not.toBe(id);
    }
  });

  /**
   * The load-bearing assertion: no two cards in the grid open the same screen.
   * Break the alias table and this goes red — which is exactly what did NOT
   * happen the last time this consolidation was undone.
   */
  it('gives the grid no card for a tool that is only a tab inside another tool', () => {
    const grid = projectEditorToolList().map((tool) => tool.id);

    expect(grid).not.toContain('domains');
    expect(grid).toContain('deployments');

    for (const id of Object.keys(PROJECT_EDITOR_TOOL_ALIASES)) {
      expect(grid, `${id} is aliased but still has its own grid card`).not.toContain(id);
    }
  });

  /**
   * Counter-proof in the other direction (méthode, règle 6): hiding a tool from
   * the grid must not make it unreachable — that was the RPL-IDE-001.5 bug,
   * where `domains` and `studio` were panels no list could open. An aliased
   * tool has to stay a real, rendered panel reached through its owner.
   */
  it('keeps an aliased tool reachable — it is hidden, not deleted', () => {
    expect(PROJECT_EDITOR_TOOLS).toContain('domains');
    expect(PROJECT_EDITOR_TOOL_CATALOG.domains).toBeDefined();
    expect(projectEditorToolCatalogList().map((tool) => tool.id)).toContain('domains');

    const owner = resolveProjectEditorTool('domains');
    expect(projectEditorToolList().map((tool) => tool.id)).toContain(owner);
  });

  it('drops aliased tools from the rendered grid categories too', () => {
    const gridGrouped = projectEditorToolsByCategory().flatMap(([, tools]) => tools.map((tool) => tool.id));
    const allGrouped = projectEditorToolsByCategory('search').flatMap(([, tools]) => tools.map((tool) => tool.id));

    expect(gridGrouped).not.toContain('domains');
    expect(allGrouped).toContain('domains');
    expect(new Set(gridGrouped).size).toBe(gridGrouped.length);
    expect(gridGrouped.slice().sort()).toEqual(allGrouped.filter((id) => !PROJECT_EDITOR_TOOL_ALIASES[id]).sort());
  });

  /**
   * The call-site guard. The catalog being right has never been the failure
   * mode here — a call site that never asked it is. `openWorkspacePanel` and
   * `activateMobileTool` both delegate to this function, so a regression that
   * drops the redirect at either door has to go through a red test.
   */
  it('tells a door to open Deployments on the Domains tab', () => {
    expect(resolveProjectEditorToolOpen('domains')).toEqual({ panel: 'deployments', deployView: 'domains' });
  });

  it('asks for no tab when the tool owns its own screen', () => {
    expect(resolveProjectEditorToolOpen('deployments')).toEqual({ panel: 'deployments' });
    expect(resolveProjectEditorToolOpen('git')).toEqual({ panel: 'git' });
    expect(resolveProjectEditorToolOpen('git').deployView).toBeUndefined();
  });

  it('names a tab for every alias whose owner is the Deployments panel', () => {
    for (const [id, alias] of Object.entries(PROJECT_EDITOR_TOOL_ALIASES)) {
      const opening = resolveProjectEditorToolOpen(id as never);

      expect(opening.panel, `${id} does not open its alias target`).toBe(alias!.tool);

      if (alias!.tool === 'deployments') {
        expect(opening.deployView, `${id} opens Deployments with no tab, so it lands on Overview`).toBe(alias!.view);
      }
    }
  });

  /**
   * THE regression guard, and the reason this block exists.
   *
   * The first consolidation of Domains was correct and was undone anyway:
   * RPL-IDE-001.5 rebuilt the tool list "from the shared catalog", asked for
   * everything, got everything, and put the duplicate card back — with no test
   * to object, because the only thing holding the rule was a code comment.
   *
   * So the DEFAULT is now the safe answer. A future rebuild that calls these
   * functions the obvious way — no argument, no thought about aliases — gets
   * the deduplicated list. These two assertions fail the moment someone flips
   * that default back, which is the exact gesture that regressed last time.
   */
  it('deduplicates by DEFAULT — asking plainly never returns a second door', () => {
    expect(projectEditorToolList().map((tool) => tool.id)).not.toContain('domains');
    expect(projectEditorToolsByCategory().flatMap(([, tools]) => tools.map((tool) => tool.id))).not.toContain(
      'domains',
    );
  });

  it('takes an explicit opt-in to surface an aliased tool, and only for search', () => {
    expect(projectEditorToolList('search').map((tool) => tool.id)).toContain('domains');
    expect(projectEditorToolList('browse').map((tool) => tool.id)).not.toContain('domains');
  });

  /**
   * Counter-proof for the guard above: `'browse'` written out must mean the
   * same thing as writing nothing. If they ever diverge, the default has
   * stopped being the safe answer and the guard is hollow.
   */
  it('makes the default and an explicit browse identical', () => {
    expect(projectEditorToolList().map((tool) => tool.id)).toEqual(
      projectEditorToolList('browse').map((tool) => tool.id),
    );
    expect(projectEditorToolsByCategory()).toEqual(projectEditorToolsByCategory('browse'));
  });

  /**
   * `projectEditorToolCatalogList` is the one escape hatch that still returns
   * aliased tools with no argument. It is for coverage checks, not for
   * rendering — pinned here so that its purpose is explicit rather than
   * discovered by the next person who reaches for it to build a tool list.
   */
  it('keeps the aliases-included view distinct from every UI view', () => {
    const catalog = projectEditorToolCatalogList().map((tool) => tool.id);

    expect(catalog).toContain('domains');
    expect(catalog.slice().sort()).toEqual([...PROJECT_EDITOR_TOOLS].sort());
    expect(catalog).not.toEqual(projectEditorToolList().map((tool) => tool.id));
  });

  it('never leaves a category heading behind with no cards under it', () => {
    for (const [category, tools] of projectEditorToolsByCategory()) {
      expect(tools.length, `${category} renders an empty heading`).toBeGreaterThan(0);
    }
  });
});
