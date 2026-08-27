import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatWorkbenchSurfaceCopy,
  formatWorkbenchSurfaceNumber,
  getWorkbenchSurfaceCopy,
  workbenchSurfaceEn,
  workbenchSurfaceFr,
} from '~/lib/i18n/catalogs/workbench-surface';

describe('Workbench i18n', () => {
  it('keeps complete EN/FR parity, interpolation, number formatting, and English fallback', () => {
    expect(Object.keys(workbenchSurfaceFr).sort()).toEqual(Object.keys(workbenchSurfaceEn).sort());
    expect(getWorkbenchSurfaceCopy('de-DE')).toBe(workbenchSurfaceEn);
    expect(
      formatWorkbenchSurfaceCopy(workbenchSurfaceFr['workbenchSurface.files.savedNamed'], {
        file: 'App.tsx',
      }),
    ).toBe('App.tsx enregistré');
    expect(formatWorkbenchSurfaceNumber('fr-FR', 12_345)).toMatch(/^12[\s\u202f]345$/u);
  });

  it('keeps the frozen mobile Terminal label and removes direct visible copy from the Workbench source', () => {
    const source = readFileSync(new URL('./Workbench.client.tsx', import.meta.url), 'utf8');

    expect(source).toContain("const SHELL_TERMINAL_LABEL = 'Shell (Terminal)';");
    expect(source).not.toContain('File list copied to clipboard');
    expect(source).not.toContain('Failed to update file content');
    expect(source).not.toContain('Open a project workspace to use Git tools.');
    expect(source).toContain("copy['workbenchSurface.git.unavailable']");
  });
});
