import { describe, expect, it } from 'vitest';
import { projectStackLabel } from './dashboard-project-stack';

describe('projectStackLabel', () => {
  it('shows the repository provider without exposing the raw URL', () => {
    expect(projectStackLabel({ gitRepositoryUrl: 'https://github.com/acme/app', sourceType: 'template' })).toBe(
      'GitHub repository',
    );
    expect(projectStackLabel({ gitRepositoryUrl: 'https://gitlab.com/acme/app' })).toBe('GitLab repository');
    expect(projectStackLabel({ gitRepositoryUrl: 'https://bitbucket.org/acme/app' })).toBe('Bitbucket repository');
    expect(projectStackLabel({ gitRepositoryUrl: 'not-a-url' })).toBe('Git repository');
  });

  it('translates source identifiers into product vocabulary', () => {
    expect(projectStackLabel({ sourceType: 'template' })).toBe('Template');
    expect(projectStackLabel({ gitRepositoryUrl: '', sourceType: 'github' })).toBe('GitHub repository');
    expect(projectStackLabel({ gitRepositoryUrl: '   ', sourceType: 'custom_import' })).toBe('Custom import');
  });

  it('falls back to the E-Code brand (never the upstream codename) when neither is set', () => {
    expect(projectStackLabel({})).toBe('E-Code project');
    expect(projectStackLabel({ gitRepositoryUrl: '', sourceType: '' })).toBe('E-Code project');
    expect(projectStackLabel({ gitRepositoryUrl: null, sourceType: null })).toBe('E-Code project');
    expect(projectStackLabel({})).not.toMatch(/bolt/i);
  });

  it('uses French product vocabulary without exposing unknown source identifiers', () => {
    expect(projectStackLabel({ gitRepositoryUrl: 'https://github.com/acme/app' }, 'fr')).toBe('Dépôt GitHub');
    expect(projectStackLabel({ sourceType: 'template' }, 'fr')).toBe('Modèle');
    expect(projectStackLabel({ sourceType: 'custom_import' }, 'fr')).toBe('Projet E-Code');
  });
});
