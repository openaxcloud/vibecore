import { describe, expect, it } from 'vitest';
import { readPanelSearchParam, withPanelSearchParam } from './project-ide-panel-url';

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

  it('removes the panel param for the editor while preserving unrelated params', () => {
    const nextParams = withPanelSearchParam(new URLSearchParams('commit=abc123&panel=git'), 'editor');

    expect(nextParams.get('panel')).toBeNull();
    expect(nextParams.get('commit')).toBe('abc123');
  });
});
