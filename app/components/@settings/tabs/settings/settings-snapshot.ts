import type { UserProfile } from '~/components/@settings/core/types';

/*
 * The settings panel only persists three fields (notifications, language,
 * timezone) to the backend. The save effect dedups network writes by
 * comparing a stable JSON snapshot of exactly those three keys against the
 * last-persisted value. Both the hydration path and the save path MUST build
 * the snapshot through this helper so the key sets line up — otherwise extra
 * keys carried on the profile (e.g. `theme`, written by the theme store /
 * Toggle-Theme control) make the two JSON strings diverge, the dedup guard
 * never matches, and a redundant PATCH + 'Settings updated' toast fires on
 * every mount even though nothing changed.
 */
export function settingsPersistenceSnapshot(
  settings: Pick<UserProfile, 'notifications' | 'language' | 'timezone'>,
): string {
  return JSON.stringify({
    notifications: settings.notifications,
    language: settings.language,
    timezone: settings.timezone,
  });
}
