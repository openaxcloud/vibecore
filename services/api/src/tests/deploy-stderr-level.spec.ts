import { describe, expect, it } from 'vitest';

import { stderrLevel } from '../deploy-workspace-agent.js';

/*
 * A failed deploy's log opened with a wall of red:
 *   [Erreur] npm warn tar TAR_ENTRY_ERROR ENOENT: no such file or directory …
 * repeated over a hundred times. Those are npm WARNINGS — npm writes them to
 * stderr, and the whole stream was classified as `error`. The one line that
 * actually explained the failure ("échec de l'installation des dépendances
 * (sortie 254)") was buried among 121 fake errors.
 */
describe('a build tool writing to stderr is not automatically an error', () => {
  it('does not paint npm warnings red', () => {
    expect(stderrLevel('npm warn tar TAR_ENTRY_ERROR ENOENT: no such file or directory')).toBe('info');
    expect(stderrLevel('npm warn deprecated foo@1.0.0')).toBe('info');
    expect(stderrLevel('  npm WARN mixed case')).toBe('info');
    expect(stderrLevel('warning: something cosmetic')).toBe('info');
  });

  it('keeps every real failure at error level', () => {
    expect(stderrLevel('npm error code ENOENT')).toBe('error');
    expect(stderrLevel('npm error enoent Could not read package.json')).toBe('error');
    expect(stderrLevel('fatal: not a git repository')).toBe('error');
    expect(stderrLevel('Error: build failed')).toBe('error');
  });

  it('stays conservative: an unrecognised stderr line is still an error', () => {
    expect(stderrLevel('something entirely unexpected')).toBe('error');
    expect(stderrLevel('')).toBe('error');
  });

  it('never downgrades a line that merely mentions a warning later on', () => {
    expect(stderrLevel('npm error this is not a warning')).toBe('error');
  });
});
