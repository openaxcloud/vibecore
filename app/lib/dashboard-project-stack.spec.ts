import { describe, expect, it } from 'vitest';
import { projectStackLabel } from './dashboard-project-stack';

describe('projectStackLabel', () => {
  it('prefers the git repository URL', () => {
    expect(projectStackLabel({ gitRepositoryUrl: 'https://github.com/acme/app', sourceType: 'template' })).toBe(
      'https://github.com/acme/app',
    );
  });

  it('falls back to the sourceType when there is no git URL', () => {
    expect(projectStackLabel({ sourceType: 'template' })).toBe('template');
    expect(projectStackLabel({ gitRepositoryUrl: '', sourceType: 'template' })).toBe('template');
    expect(projectStackLabel({ gitRepositoryUrl: '   ', sourceType: 'template' })).toBe('template');
  });

  it('falls back to the E-Code brand (never the upstream codename) when neither is set', () => {
    expect(projectStackLabel({})).toBe('E-Code project');
    expect(projectStackLabel({ gitRepositoryUrl: '', sourceType: '' })).toBe('E-Code project');
    expect(projectStackLabel({ gitRepositoryUrl: null, sourceType: null })).toBe('E-Code project');
    expect(projectStackLabel({})).not.toMatch(/bolt/i);
  });
});
