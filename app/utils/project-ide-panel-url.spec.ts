import { describe, expect, it } from 'vitest';
import { isRedundantPanelSearchParamUpdate, readPanelSearchParam, withPanelSearchParam } from './project-ide-panel-url';

describe('project IDE panel URL helpers', () => {
  it('reads only supported panel params', () => {
    const allowedPanels = ['editor', 'deployments', 'collaborators'];

    expect(readPanelSearchParam(new URLSearchParams('panel=collaborators'), allowedPanels)).toBe('collaborators');
    expect(readPanelSearchParam(new URLSearchParams('panel=unknown'), allowedPanels)).toBeUndefined();
    expect(readPanelSearchParam(new URLSearchParams('panel='), allowedPanels)).toBeUndefined();
  });

  it('sets a non-editor panel while preserving unrelated params', () => {
    const nextParams = withPanelSearchParam(new URLSearchParams('commit=abc123&panel=deployments'), 'collaborators');

    expect(nextParams.get('panel')).toBe('collaborators');
    expect(nextParams.get('commit')).toBe('abc123');
  });

  it('sets the editor panel while preserving unrelated params', () => {
    const nextParams = withPanelSearchParam(new URLSearchParams('commit=abc123&panel=git'), 'editor');

    expect(nextParams.get('panel')).toBe('editor');
    expect(nextParams.get('commit')).toBe('abc123');
  });

  /*
   * BUG-IDE-PANEL-RECLICK-REPROVISION-001 — re-clicking the already-active
   * panel must not navigate (a same-URL navigation revalidates the whole IDE
   * route). Redundant when the written value equals the current one.
   */
  it('flags a re-click on the already-active panel as redundant', () => {
    expect(isRedundantPanelSearchParamUpdate(new URLSearchParams('panel=preview'), 'preview')).toBe(true);
    expect(isRedundantPanelSearchParamUpdate(new URLSearchParams('panel=deployments&commit=abc'), 'deployments')).toBe(
      true,
    );
    expect(isRedundantPanelSearchParamUpdate(new URLSearchParams(''), undefined)).toBe(true);
    expect(isRedundantPanelSearchParamUpdate(new URLSearchParams(''), '')).toBe(true);
  });

  it('does not flag a genuine panel change as redundant', () => {
    expect(isRedundantPanelSearchParamUpdate(new URLSearchParams('panel=preview'), 'git')).toBe(false);
    expect(isRedundantPanelSearchParamUpdate(new URLSearchParams(''), 'preview')).toBe(false);
    expect(isRedundantPanelSearchParamUpdate(new URLSearchParams('panel=git'), undefined)).toBe(false);
  });
});
