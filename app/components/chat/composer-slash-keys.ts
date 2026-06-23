/**
 * Pure keyboard-bridge helpers for the slash-command composer overlay.
 *
 * The palette (<SlashCommandsPalette>) owns all of its keyboard
 * navigation (ArrowUp/Down, Enter, Tab, Escape) on its own root <div>.
 * But in production the keyboard focus stays in the chat textarea — the
 * palette div is never focused — so its handler never fires and Enter
 * falls through to the textarea's own handler, which submits the raw
 * `/command` text to the LLM.
 *
 * `ComposerSlashOverlay` bridges the gap by listening for keydown on the
 * textarea (capture phase, before the composer's own Enter handler) and,
 * when a slash trigger is active, forwarding the navigation keys to the
 * palette. This module isolates the decision of *which* keys to forward
 * so it can be unit-tested without a DOM.
 */

/**
 * Keys the slash palette is responsible for while a `/` trigger is
 * active in the composer. These must be intercepted before the
 * textarea's own onKeyDown (which would otherwise send the literal
 * command to the chat on Enter).
 */
export const SLASH_PALETTE_NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'] as const;

export type SlashPaletteNavKey = (typeof SLASH_PALETTE_NAV_KEYS)[number];

/**
 * Decide whether a keydown should be forwarded from the focused
 * textarea to the slash palette.
 *
 * Returns false (let the textarea handle it normally) when:
 *  - no slash trigger is active (`triggerActive` is false), or
 *  - the key is not one of the palette's navigation keys, or
 *  - the user is holding a modifier (Shift+Enter inserts a newline,
 *    Cmd/Ctrl/Alt combos are app shortcuts) — except Escape, which is
 *    always a dismiss regardless of modifiers.
 */
export function shouldForwardKeyToSlashPalette(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey' | 'isComposing'>,
  triggerActive: boolean,
): boolean {
  if (!triggerActive) {
    return false;
  }

  if (!isSlashPaletteNavKey(event.key)) {
    return false;
  }

  /*
   * An in-flight IME composition Enter/Tab confirms the composition; do
   * not hijack it for command selection.
   */
  if (event.isComposing) {
    return false;
  }

  if (event.key === 'Escape') {
    return true;
  }

  /*
   * Shift+Enter = newline, and any Cmd/Ctrl/Alt combination is a shortcut
   * the palette has no business stealing.
   */
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  return true;
}

export function isSlashPaletteNavKey(key: string): key is SlashPaletteNavKey {
  return (SLASH_PALETTE_NAV_KEYS as readonly string[]).includes(key);
}
