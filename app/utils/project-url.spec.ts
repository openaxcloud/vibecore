import { describe, expect, it } from 'vitest';
import {
  canonicalAccountSlugFromParam,
  canonicalProjectPath,
  legacyProjectIdePath,
  projectIdePath,
  projectPanelPath,
  slugifyProjectUrlSegment,
} from './project-url';

describe('project URL helpers', () => {
  it('builds canonical account/project paths when slugs are present', () => {
    expect(canonicalProjectPath({ id: 'project_1', slug: 'volt-watt', organizationSlug: 'henri45' })).toBe(
      '/@henri45/volt-watt',
    );
    expect(projectIdePath({ id: 'project_1', slug: 'volt-watt', organizationSlug: 'henri45' })).toBe(
      '/@henri45/volt-watt',
    );
  });

  it('falls back to legacy project IDE paths when canonical slugs are unavailable', () => {
    expect(legacyProjectIdePath('project_1')).toBe('/projects/project_1/ide');
    expect(projectIdePath({ id: 'project_1' })).toBe('/projects/project_1/ide');
  });

  it('adds panel search params without losing existing query state', () => {
    expect(
      projectIdePath(
        { id: 'project_1', slug: 'volt-watt', organizationSlug: 'henri45' },
        { panel: 'preview', searchParams: new URLSearchParams('commit=abc') },
      ),
    ).toBe('/@henri45/volt-watt?commit=abc&panel=preview');
    expect(projectPanelPath({ id: 'project_1', slug: 'volt-watt', organizationSlug: 'henri45' }, 'editor')).toBe(
      '/@henri45/volt-watt?panel=editor',
    );
  });

  it('normalizes user-entered canonical route segments for resolution', () => {
    expect(canonicalAccountSlugFromParam('@Henri 45')).toBe('henri-45');
    expect(canonicalAccountSlugFromParam('henri45')).toBeUndefined();
    expect(slugifyProjectUrlSegment('VoltWatt')).toBe('voltwatt');
  });
});
