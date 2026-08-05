/**
 * Pure, testable helpers for the desktop-settings route.
 *
 * Each helper wraps an Electron bridge IPC call so that a rejected promise
 * (notification permission denied, `settings.set` write failure, folder-dialog
 * error, etc.) is turned into a status string instead of an unhandled rejection
 * that would silently leave the status line stuck on its previous value.
 *
 * Kept out of the route module so it can be unit-tested without rendering the
 * route (and because route files that import *.server modules may only export
 * route entrypoints — pure helpers live in `app/lib/**`).
 */

import {
  getDesktopSettingsCopy,
  resolveDesktopSettingsLanguage,
  type DesktopSettingsKey,
  type DesktopSettingsLanguage,
} from './i18n/catalogs/desktop-settings';

type DesktopBridge = NonNullable<typeof globalThis.window.vibecoreDesktop>;
export type DesktopSettingsStatusKey = Extract<DesktopSettingsKey, `desktopSettings.status.${string}`>;

/**
 * Persists desktop settings through the bridge. Returns the status line to
 * display. Never throws: a rejected `settings.set` becomes an error status.
 */
export async function saveDesktopSettings(
  bridge: DesktopBridge | undefined,
  next: unknown,
): Promise<DesktopSettingsStatusKey> {
  if (!bridge) {
    return 'desktopSettings.status.openAppSettings';
  }

  try {
    await bridge.settings.set(next);
    return 'desktopSettings.status.saved';
  } catch {
    return 'desktopSettings.status.saveFailed';
  }
}

/**
 * Shows a native test notification. Returns the status line to display.
 * Never throws: a rejected `notifications.show` becomes an error status.
 */
export async function showDesktopTestNotification(
  bridge: DesktopBridge | undefined,
  language?: DesktopSettingsLanguage,
): Promise<DesktopSettingsStatusKey> {
  if (!bridge) {
    return 'desktopSettings.status.openAppNotification';
  }

  try {
    const copy = getDesktopSettingsCopy(resolveDesktopSettingsLanguage(language));

    await bridge.notifications.show({
      title: copy['desktopSettings.notification.title'],
      body: copy['desktopSettings.notification.body'],
    });

    return 'desktopSettings.status.notificationSent';
  } catch {
    return 'desktopSettings.status.notificationFailed';
  }
}

/**
 * Opens the native folder picker. Returns the status line to display.
 * Never throws: a rejected `files.openLocalFolder` becomes an error status.
 */
export async function openDesktopLocalFolder(bridge: DesktopBridge | undefined): Promise<DesktopSettingsStatusKey> {
  if (!bridge) {
    return 'desktopSettings.status.openAppFolder';
  }

  try {
    const folder = await bridge.files.openLocalFolder();
    return folder ? 'desktopSettings.status.folderSelected' : 'desktopSettings.status.folderCanceled';
  } catch {
    return 'desktopSettings.status.folderFailed';
  }
}

/**
 * Wraps a function so it only runs after `delayMs` of inactivity. Used to avoid
 * persisting `settings.set` once per keystroke in the manual-server field.
 * Exposes `cancel()` so callers can drop the pending call on unmount.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): ((...args: Args) => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Args) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}
