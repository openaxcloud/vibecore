/**
 * Cross-domain theme persistence (single source of truth).
 *
 * localStorage is partitioned per-origin, so a theme chosen on the marketing
 * site (`e-code.ai`) does NOT carry over to the app / IDE (`app.e-code.ai`):
 * they are distinct origins and never share localStorage. To make the user's
 * light/dark choice follow them across every E-Code surface we mirror it into a
 * cookie scoped to the *registrable* parent domain (`Domain=.e-code.ai`), which
 * the browser sends to every subdomain.
 *
 * The cookie is intentionally NOT httpOnly: the pre-hydration inline boot script
 * in app/root.tsx and the runtime theme toggle both read/write it from
 * JavaScript (document.cookie). It carries no secret — only `light` | `dark`.
 *
 * This module is import-safe in any environment (SSR, tests, browser): every
 * function guards on `typeof document`/`typeof window` and swallows access
 * errors (Safari Private Browsing / partitioned-cookie contexts throw).
 */

export const THEME_COOKIE = 'ecode_theme';

/** One year, in seconds. Matches the localStorage "remember forever" semantics. */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isIpHost(hostname: string): boolean {
  // IPv4 (1.2.3.4) or bracketed/colon IPv6 — cookies can't carry a Domain for these.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':') || hostname.startsWith('[');
}

/**
 * Compute the `Domain=` attribute so the cookie is shared across every E-Code
 * subdomain. We use the registrable domain — the last two labels of the host
 * (`app.e-code.ai` → `e-code.ai`, `e-code.ai` → `e-code.ai`) — prefixed with a
 * leading dot so it applies to the apex and all subdomains.
 *
 * Returns `null` (host-only cookie, no Domain attribute) for `localhost`, bare
 * single-label hosts, and IP addresses, where a Domain attribute is invalid and
 * the browser would silently drop the cookie. `.e-code.ai` uses a single-part
 * public suffix (`.ai`), so last-two-labels is the correct registrable domain;
 * we do not attempt to handle multi-part suffixes (`.co.uk`) because E-Code does
 * not deploy under one.
 */
export function themeCookieDomain(hostname: string): string | null {
  if (!hostname || hostname === 'localhost' || isIpHost(hostname)) {
    return null;
  }

  const labels = hostname.split('.').filter(Boolean);

  if (labels.length < 2) {
    return null;
  }

  return `.${labels.slice(-2).join('.')}`;
}

function parseCookie(cookieString: string, name: string): string | null {
  for (const pair of cookieString.split(';')) {
    const index = pair.indexOf('=');

    if (index === -1) {
      continue;
    }

    if (pair.slice(0, index).trim() === name) {
      return decodeURIComponent(pair.slice(index + 1).trim());
    }
  }

  return null;
}

/** Read the shared theme cookie. Returns `'light' | 'dark' | null`. */
export function readThemeCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  try {
    return parseCookie(document.cookie, THEME_COOKIE);
  } catch {
    return null;
  }
}

/**
 * Write the shared theme cookie on the registrable parent domain so the choice
 * propagates to every E-Code surface (marketing + app + IDE). Best-effort: never
 * throws (cookie writes can fail in locked-down browsers).
 */
export function writeThemeCookie(theme: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  try {
    const domain = themeCookieDomain(window.location.hostname);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    const domainAttr = domain ? `; Domain=${domain}` : '';

    document.cookie = `${THEME_COOKIE}=${encodeURIComponent(
      theme,
    )}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${domainAttr}${secure}`;
  } catch {
    /*
     * Cookies blocked (Safari Private Browsing / partitioned). localStorage
     * still holds the choice for this origin; cross-domain sync is best-effort.
     */
  }
}
