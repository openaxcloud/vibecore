import { settingsPersistenceSnapshot } from './settings-snapshot';
import type { UserProfile } from '~/components/@settings/core/types';

type ServerPreferences = {
  language?: string | null;
  timezone?: string | null;
  preferences?: { notifications?: boolean } | null;
};

/*
 * Reconcile the backend-hydration response with the panel's current state.
 *
 * The hydration fetch is async, so the user can flip Notifications or change
 * Language/Timezone *before* it resolves. If we naively let every server value
 * win (`server ?? current`), that pre-hydration edit is silently reverted: the
 * displayed state snaps back to the server value AND the dedup ref ends up
 * equal to the displayed state, so no corrective PATCH is ever issued.
 *
 * To avoid dropping the edit we compare each of the three persisted fields
 * against `baseline` — the cache snapshot captured at mount, before any user
 * interaction. A field that still equals its baseline is untouched, so the
 * server value wins (DB is the source of truth). A field the user changed away
 * from its baseline is a genuine edit, so the *user's* value wins.
 *
 * `serverSnapshot` is the 3-key snapshot of what the backend returned (the
 * value that would be the no-op state if the server won outright). When the
 * reconciled state diverges from it, the caller must fire a corrective PATCH so
 * the pre-hydration edit reaches the backend; the caller seeds its dedup ref
 * with `serverSnapshot` (not the merged state) so that PATCH is not skipped.
 */
export function reconcileHydration(
  current: UserProfile,
  baseline: Pick<UserProfile, 'notifications' | 'language' | 'timezone'>,
  data: ServerPreferences,
): { merged: UserProfile; serverSnapshot: string; needsPatch: boolean } {
  const serverNotifications = data.preferences?.notifications;
  const serverLanguage = data.language;
  const serverTimezone = data.timezone;

  // What the state would be if the server won every field it returned.
  const serverResolved: Pick<UserProfile, 'notifications' | 'language' | 'timezone'> = {
    notifications: serverNotifications ?? current.notifications,
    language: serverLanguage ?? current.language,
    timezone: serverTimezone ?? current.timezone,
  };

  // A field the user changed away from its mount-time baseline is a real edit.
  const notificationsEdited = current.notifications !== baseline.notifications;
  const languageEdited = current.language !== baseline.language;
  const timezoneEdited = current.timezone !== baseline.timezone;

  const merged: UserProfile = {
    ...current,
    notifications: notificationsEdited ? current.notifications : serverResolved.notifications,
    language: languageEdited ? current.language : serverResolved.language,
    timezone: timezoneEdited ? current.timezone : serverResolved.timezone,
  };

  const serverSnapshot = settingsPersistenceSnapshot(serverResolved);
  const mergedSnapshot = settingsPersistenceSnapshot(merged);

  return {
    merged,
    serverSnapshot,
    needsPatch: mergedSnapshot !== serverSnapshot,
  };
}
