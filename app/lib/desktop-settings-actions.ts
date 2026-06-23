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

type DesktopBridge = NonNullable<typeof globalThis.window.vibecoreDesktop>;

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Persists desktop settings through the bridge. Returns the status line to
 * display. Never throws: a rejected `settings.set` becomes an error status.
 */
export async function saveDesktopSettings(bridge: DesktopBridge | undefined, next: unknown): Promise<string> {
  if (!bridge) {
    return 'Desktop bridge not detected. Settings are staged in this browser session.';
  }

  try {
    await bridge.settings.set(next);
    return 'Desktop settings saved.';
  } catch (error) {
    return toMessage(error);
  }
}

/**
 * Shows a native test notification. Returns the status line to display.
 * Never throws: a rejected `notifications.show` becomes an error status.
 */
export async function showDesktopTestNotification(bridge: DesktopBridge | undefined): Promise<string> {
  if (!bridge) {
    return 'Desktop bridge not detected. Native notifications require Electron.';
  }

  try {
    await bridge.notifications.show({
      title: 'E-Code',
      body: 'Native notifications are enabled.',
    });
    return 'Test notification sent.';
  } catch (error) {
    return toMessage(error);
  }
}

/**
 * Opens the native folder picker. Returns the status line to display.
 * Never throws: a rejected `files.openLocalFolder` becomes an error status.
 */
export async function openDesktopLocalFolder(bridge: DesktopBridge | undefined): Promise<string> {
  if (!bridge) {
    return 'Desktop bridge not detected. Local folder import requires Electron.';
  }

  try {
    const folder = await bridge.files.openLocalFolder();
    return folder ? `Folder selected: ${folder}` : 'Folder selection canceled.';
  } catch (error) {
    return toMessage(error);
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
