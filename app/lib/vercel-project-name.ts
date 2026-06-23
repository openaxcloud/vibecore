/*
 * Pure helper for deriving the Vercel project name (and thus the public
 * `*.vercel.app` deploy URL) from a chat id. Kept side-effect free so it can be
 * unit tested and reused without pulling in the route module.
 *
 * Vercel project names must be lowercase and may only contain alphanumerics,
 * `.`, `_` and `-`, must be <= 100 chars, and cannot start/end with a separator.
 * We also use a neutral, brand-correct prefix so the upstream codename never
 * leaks into the public deploy URL or the Vercel dashboard.
 */

const MAX_VERCEL_PROJECT_NAME_LENGTH = 100;

/**
 * Sanitize an arbitrary chat id into a fragment that is safe to embed in a
 * Vercel project name. Lowercases, replaces disallowed characters with `-`,
 * collapses repeated separators and trims leading/trailing separators.
 */
export function sanitizeVercelNameFragment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a unique, brand-correct Vercel project name for a chat. Uses the
 * `ecode-` prefix (the product brand) rather than leaking the upstream
 * `bolt-diy-` codename into the public deploy URL.
 */
export function buildVercelProjectName(chatId: string, now: number = Date.now()): string {
  const fragment = sanitizeVercelNameFragment(chatId);
  const base = fragment ? `ecode-${fragment}-${now}` : `ecode-${now}`;

  return base.slice(0, MAX_VERCEL_PROJECT_NAME_LENGTH).replace(/-+$/g, '');
}
