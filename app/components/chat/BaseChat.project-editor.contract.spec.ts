import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baseChatSource = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');

describe('BaseChat canonical Project Editor contracts', () => {
  it('does not mount or retain state for the legacy Files/Logs right-side shell', () => {
    expect(baseChatSource).not.toContain('rightPanelOpen');
    expect(baseChatSource).not.toContain('rightPanelMode');
    expect(baseChatSource).not.toContain('rightPanelWidth');
    expect(baseChatSource).not.toContain('project-right-panel');
    expect(baseChatSource).not.toContain('Project library panel');
    expect(baseChatSource).not.toContain('Preview logs panel');
  });

  it('bridges the legacy Files toggle to the canonical panel event and ignores explicit closes', () => {
    expect(baseChatSource).toContain("window.addEventListener('vibecore:toggle-project-files-panel'");
    expect(baseChatSource).toContain('if (requestedOpen === false)');
    expect(baseChatSource).toContain("new CustomEvent('vibecore:open-project-ide-panel'");
    expect(baseChatSource).toContain("detail: { panel: 'files' }");
  });

  it('opens Files through the canonical Pane tab action for the sidebar keybinding', () => {
    const sidebarBranch = baseChatSource.slice(
      baseChatSource.indexOf("action === 'sidebar.toggle'"),
      baseChatSource.indexOf("action === 'terminal.toggle'"),
    );

    expect(sidebarBranch).toContain("openWorkspacePanel('files')");
    expect(sidebarBranch).not.toContain('setRightPanel');
  });

  it('uses the exhaustive shared catalog for both desktop tool entry points', () => {
    expect(baseChatSource.match(/PROJECT_EDITOR_TOOL_CATALOG\.map/g)).toHaveLength(2);
  });

  it('synchronizes compatibility UI state from the canonical Window tree', () => {
    expect(baseChatSource).toContain('const panes = collectPanes(projectEditorWindow)');
    expect(baseChatSource).toContain('const canonicalPanels = Array.from(new Set(');
    expect(baseChatSource).toContain('setActiveWorkspacePanel((current) =>');
  });
});
