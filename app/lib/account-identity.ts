/**
 * BUG-USR-001 — the user-area account footer/menu must show WHO is signed in.
 *
 * The shell historically read the legacy bolt.diy `profileStore` (a localStorage
 * `{ username, bio, avatar }` edited only by the old @settings ProfileTab), which is
 * empty for essentially every real SaaS user — so the account trigger and menu always
 * rendered the generic placeholder "Signed in user". The authenticated identity is
 * available from `/api/me` (`displayName` / `name` / `email` / `username`); this pure
 * helper picks the best label from it, with the legacy profile only as a last resort
 * before the placeholder, so the resolution is deterministic and unit-testable.
 */

export interface ViewerIdentity {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
  username?: string | null;
}

export const ACCOUNT_DISPLAY_PLACEHOLDER = 'Signed in user';

const clean = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

/** Initials for the avatar chip. An email (single token with `@`) uses its first two letters. */
export function accountInitials(label: string): string {
  const parts = clean(label)
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '';
  }

  if (parts.length === 1 && parts[0].includes('@')) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export interface AccountDisplay {
  /** The label to render (never empty — falls back to the placeholder). */
  displayName: string;
  /** Avatar initials, empty when only the placeholder is available. */
  initials: string;
  /** True when NO real identity was resolved (render the generic user icon, not initials). */
  isPlaceholder: boolean;
  /** Secondary line (email) when it is distinct from the display name. */
  secondary: string;
}

/**
 * Resolve the account label from the authenticated viewer, falling back through
 * displayName → name → username → email → legacy profile username → placeholder.
 */
export function resolveAccountDisplay(
  viewer: ViewerIdentity | null | undefined,
  legacyUsername?: string | null,
): AccountDisplay {
  const email = clean(viewer?.email);
  const label =
    clean(viewer?.displayName) ||
    clean(viewer?.name) ||
    clean(viewer?.username) ||
    email ||
    clean(legacyUsername);

  if (!label) {
    return { displayName: ACCOUNT_DISPLAY_PLACEHOLDER, initials: '', isPlaceholder: true, secondary: '' };
  }

  return {
    displayName: label,
    initials: accountInitials(label),
    isPlaceholder: false,
    secondary: email && email !== label ? email : '',
  };
}
