import { describe, it, expect } from 'vitest';
import { reconcileHydration } from './settings-hydration-merge';
import { settingsPersistenceSnapshot } from './settings-snapshot';
import type { UserProfile } from '~/components/@settings/core/types';

const profile = (over: Partial<UserProfile> = {}): UserProfile =>
  ({
    notifications: true,
    language: 'en',
    timezone: 'UTC',
    ...over,
  }) as UserProfile;

describe('reconcileHydration', () => {
  it('lets the server win for every untouched field and stays a no-op', () => {
    const baseline = { notifications: true, language: 'en', timezone: 'UTC' };
    const current = profile(baseline);

    const { merged, serverSnapshot, needsPatch } = reconcileHydration(current, baseline, {
      preferences: { notifications: false },
      language: 'fr',
      timezone: 'Europe/Paris',
    } as any);

    expect(merged.notifications).toBe(false);
    expect(merged.language).toBe('fr');
    expect(merged.timezone).toBe('Europe/Paris');
    expect(needsPatch).toBe(false);
    expect(serverSnapshot).toBe(settingsPersistenceSnapshot(merged));
  });

  /*
   * Core regression: the user toggled Notifications off DURING the hydration
   * window. The server still reports notifications=true. The edit must win and
   * a corrective PATCH must be flagged so it reaches the backend instead of
   * being silently reverted.
   */
  it('keeps a pre-hydration edit and flags a corrective PATCH', () => {
    const baseline = { notifications: true, language: 'en', timezone: 'UTC' };
    const current = profile({ notifications: false }); // user toggled off mid-fetch

    const { merged, serverSnapshot, needsPatch } = reconcileHydration(current, baseline, {
      preferences: { notifications: true },
      language: 'en',
      timezone: 'UTC',
    } as any);

    expect(merged.notifications).toBe(false); // user value wins
    expect(needsPatch).toBe(true);

    // dedup ref seeds with the server snapshot, which diverges from the merged state
    expect(serverSnapshot).not.toBe(settingsPersistenceSnapshot(merged));
    expect(JSON.parse(serverSnapshot).notifications).toBe(true);
  });

  it('keeps an edited language/timezone while still taking the server for untouched fields', () => {
    const baseline = { notifications: true, language: 'en', timezone: 'UTC' };
    const current = profile({ language: 'de' }); // user changed language mid-fetch

    const { merged, needsPatch } = reconcileHydration(current, baseline, {
      preferences: { notifications: false }, // untouched field -> server wins
      language: 'fr', // edited field -> user wins
      timezone: 'Asia/Tokyo', // untouched field -> server wins
    } as any);

    expect(merged.language).toBe('de');
    expect(merged.notifications).toBe(false);
    expect(merged.timezone).toBe('Asia/Tokyo');
    expect(needsPatch).toBe(true);
  });

  it('treats a null/missing server field as "server returned nothing" and keeps current', () => {
    const baseline = { notifications: true, language: 'en', timezone: 'UTC' };
    const current = profile(baseline);

    const { merged, needsPatch } = reconcileHydration(current, baseline, {
      preferences: { notifications: undefined },
      language: null,
      timezone: null,
    } as any);

    expect(merged.notifications).toBe(true);
    expect(merged.language).toBe('en');
    expect(merged.timezone).toBe('UTC');
    expect(needsPatch).toBe(false);
  });

  it('preserves non-persisted profile keys (e.g. theme) on the merged result', () => {
    const baseline = { notifications: true, language: 'en', timezone: 'UTC' };
    const current = profile({ theme: 'dark' } as any);

    const { merged } = reconcileHydration(current, baseline, {
      language: 'fr',
    } as any);

    expect((merged as any).theme).toBe('dark');
    expect(merged.language).toBe('fr');
  });
});
