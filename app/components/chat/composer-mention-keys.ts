/**
 * Pure keyboard-bridge helpers for <ComposerMentionsOverlay>.
 *
 * The @-file-mention palette (<FileMentionsPalette>) lives on a
 * `tabIndex={-1}` div that never holds DOM focus — the chat textarea
 * keeps focus the whole time the user is composing an `@token`. As a
 * result the palette's own `onKeyDown` never fires from real key events,
 * so ArrowUp/Down/Enter/Tab/Escape are handled by the textarea instead.
 * In particular Enter reaches ChatBox's textarea handler and *sends the
 * message* (with the literal `@App` token still in it) rather than
 * picking the highlighted candidate.
 *
 * The overlay fixes this by listening for keydown on the textarea while a
 * trigger is active and *forwarding* the navigation/commit keys into the
 * palette. These helpers are the pure pieces of that bridge so they can be
 * unit-tested without a DOM:
 *
 *   - `isMentionNavigationKey` decides which keys the overlay should
 *     intercept (and therefore stop from reaching the send handler).
 */

/**
 * Keys the mention palette consumes for navigation/commit/dismiss. When a
 * mention trigger is active these must be forwarded to the palette and
 * prevented from bubbling to ChatBox's textarea `onKeyDown` (which would
 * otherwise send the message on Enter or do nothing on the arrows).
 */
export const MENTION_NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'] as const;

export type MentionNavigationKey = (typeof MENTION_NAVIGATION_KEYS)[number];

/**
 * True when `key` is one the active mention palette should handle. A
 * Shift+Enter (newline) is intentionally *not* intercepted so the user
 * can still insert a line break while a trigger is on screen.
 */
export function isMentionNavigationKey(key: string, options: { shiftKey?: boolean } = {}): key is MentionNavigationKey {
  if (key === 'Enter' && options.shiftKey) {
    return false;
  }

  return (MENTION_NAVIGATION_KEYS as readonly string[]).includes(key);
}
