import { describe, expect, it } from 'vitest';
import { SURFACE_AUTHED_TWINS, resolveSurfaceTwin } from './surface-twins';
import { getEcodeSurfacePage } from '~/components/marketing/EcodeSurfacePages';

describe('surface authed twins', () => {
  it('maps known surface slugs to their real in-app destination', () => {
    expect(resolveSurfaceTwin('account')).toBe('/account-settings');
    expect(resolveSurfaceTwin('profile')).toBe('/account-settings');
    expect(resolveSurfaceTwin('plans')).toBe('/billing');
    expect(resolveSurfaceTwin('subscribe')).toBe('/upgrade');
    expect(resolveSurfaceTwin('teams')).toBe('/organization-members');
  });

  it('returns undefined for a slug with no authed twin', () => {
    expect(resolveSurfaceTwin('runtimes')).toBeUndefined();
    expect(resolveSurfaceTwin('definitely-not-a-slug')).toBeUndefined();
  });

  it('only maps slugs that are real marketing surfaces (so the route actually matches)', () => {
    for (const slug of Object.keys(SURFACE_AUTHED_TWINS)) {
      expect(getEcodeSurfacePage(slug), `"${slug}" must be a real surface slug`).toBeTruthy();
    }
  });

  it('only targets absolute in-app paths', () => {
    for (const target of Object.values(SURFACE_AUTHED_TWINS)) {
      expect(target.startsWith('/')).toBe(true);
    }
  });
});
