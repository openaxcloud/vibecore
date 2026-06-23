import { describe, it, expect } from 'vitest';
import { settingsPersistenceSnapshot } from './settings-snapshot';
import type { UserProfile } from '~/components/@settings/core/types';

describe('settingsPersistenceSnapshot', () => {
  it('serializes only the three persisted keys', () => {
    const snapshot = settingsPersistenceSnapshot({
      notifications: true,
      language: 'en',
      timezone: 'UTC',
    });

    expect(JSON.parse(snapshot)).toEqual({
      notifications: true,
      language: 'en',
      timezone: 'UTC',
    });
  });

  /*
   * Regression for the redundant-PATCH-on-mount bug: the hydration path built
   * its snapshot from `merged = { ...prev, notifications, language, timezone }`,
   * which can carry extra keys such as `theme`. The save effect compared
   * against a 3-key snapshot, so the key sets diverged and the dedup guard
   * never matched. Routing both through this helper makes the merged-profile
   * snapshot (extra keys and all) byte-identical to the save-effect snapshot.
   */
  it('produces an identical snapshot whether or not the profile carries extra keys', () => {
    const persistedFields = {
      notifications: false,
      language: 'fr',
      timezone: 'Europe/Paris',
    };

    // Mirrors the save effect: snapshot taken from just the persisted fields.
    const saveEffectSnapshot = settingsPersistenceSnapshot(persistedFields);

    // Mirrors the hydration merge: extra keys (theme) ride along on the profile.
    const mergedProfile = {
      ...persistedFields,
      theme: 'dark',
    } as unknown as UserProfile;

    const hydrationSnapshot = settingsPersistenceSnapshot(mergedProfile);

    expect(hydrationSnapshot).toBe(saveEffectSnapshot);
  });

  it('ignores key ordering on the input object', () => {
    const a = settingsPersistenceSnapshot({ timezone: 'UTC', language: 'en', notifications: true });
    const b = settingsPersistenceSnapshot({ notifications: true, language: 'en', timezone: 'UTC' });

    expect(a).toBe(b);
  });
});
