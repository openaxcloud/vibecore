/**
 * Platform-aware keyboard-shortcut helpers.
 *
 * These are deliberately pure so they can be unit-tested and so that
 * server-rendered routes can pick a deterministic default for the very first
 * render (matching the SSR output) and only switch to the real,
 * platform-specific value after mount via a `useEffect`. Deriving the label
 * from `navigator.platform` during render causes an SSR/CSR hydration mismatch
 * because `navigator` is undefined on the server.
 */

/** Detect Apple hosts (macOS / iOS) from a platform string. */
export function isApplePlatform(platform: string | undefined | null): boolean {
  if (!platform) {
    return false;
  }

  return /Mac|iPhone|iPad/.test(platform);
}

/**
 * Resolve the Apple-host flag from the current browser environment.
 * Returns `false` when `navigator` is unavailable (e.g. during SSR).
 */
export function detectApplePlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return isApplePlatform(navigator.platform);
}

/**
 * The visible label for the "submit prompt" keyboard shortcut.
 * `⌘↵` on Apple hosts, `Ctrl+↵` everywhere else.
 */
export function submitShortcutLabel(isAppleHost: boolean): string {
  return isAppleHost ? '⌘↵' : 'Ctrl+↵';
}
