import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(new URL('../../routes/projects.$projectId.ide.tsx', import.meta.url), 'utf8');

describe('Project Editor route contracts', () => {
  it('uses Project Editor terminology in browser and boundary metadata', () => {
    expect(routeSource).toContain('`${projectName} — Project Editor`');
    expect(routeSource).toContain('title="Project Editor"');
  });

  it('treats the client-only window selector like panel and commit selectors', () => {
    expect(routeSource).toContain("new Set(['panel', 'commit', 'window'])");
  });

  it('wires the project name and real Resources surface into the top bar', () => {
    expect(routeSource).toContain('<ProjectSpotlightButton');
    expect(routeSource).toContain('<ProjectActionsMenu');
    expect(routeSource).toContain('<ProjectResourcesPopover');
  });

  it('opens Files as a canonical Project Editor tab instead of toggling the legacy Library shell', () => {
    expect(routeSource).toContain('aria-label="Open Files tab"');
    expect(routeSource).toContain("new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'files' } })");
    expect(routeSource).not.toContain('workbenchStore.projectFilesPanelOpen');
    expect(routeSource).not.toContain('workbenchStore.requestProjectFilesPanel');
    expect(routeSource).not.toContain('vibecore:toggle-project-files-panel');
  });
});
