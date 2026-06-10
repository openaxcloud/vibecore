/**
 * URL validation utilities with SSRF protection.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // Class B private
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // Class C private
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/, // CGNAT 100.64.0.0/10
  /^0\.0\.0\.0$/, // Unspecified
];

const BLOCKED_HOSTNAMES = new Set(['localhost', '[::1]', '0.0.0.0']);

/**
 * Is this URL host literal an internal/blocked target? IPv6-aware: strips
 * brackets and routes IP literals through isPrivateIp (which folds IPv4-mapped
 * IPv6, ::1, fc/fd ULA, fe80 link-local), then applies the internal-name
 * suffixes. Hostname-based only — DNS-rebinding is handled separately by callers
 * that resolve + re-check the address. Shared by the git-forge SSRF guards.
 */
export function isBlockedHost(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase();
  const bare = hostname.replace(/^\[/, '').replace(/\]$/, '');

  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOSTNAMES.has(bare) || bare === '::1' || bare === '::') {
    return true;
  }

  if (bare === 'localhost' || bare.endsWith('.localhost') || bare.endsWith('.internal') || bare.endsWith('.local')) {
    return true;
  }

  return isPrivateIp(bare);
}

/** https URL to a non-internal host — the SSRF guard for user-supplied git-forge URLs. */
export function isSafeGitForgeUrl(rawUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  return url.protocol === 'https:' && Boolean(url.hostname) && !isBlockedHost(url.hostname);
}

export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns true if an *already-resolved* IP literal (v4 or v6) points at a
 * private, loopback, link-local, or otherwise internal range. This is the check
 * that must run against DNS-resolved addresses (not just the hostname string),
 * because a public hostname can resolve to an internal IP (DNS rebinding).
 */
export function isPrivateIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(addr))) {
    return true;
  }

  /*
   * IPv4-mapped IPv6 in DOTTED form (::ffff:169.254.169.254) — re-check the
   * embedded v4 against the private patterns.
   */
  const mappedV4 = addr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);

  if (addr.includes(':') && mappedV4 && PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(mappedV4[1]))) {
    return true;
  }

  /*
   * IPv4-mapped IPv6 in HEX-COMPRESSED form (::ffff:7f00:1). The WHATWG URL parser
   * normalizes [::ffff:127.0.0.1] to this, so the dotted regex above misses it —
   * decode the two hextets back to dotted-quad and re-check.
   */
  const hexMapped = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);

  if (hexMapped) {
    const value = (parseInt(hexMapped[1], 16) << 16) | parseInt(hexMapped[2], 16);
    const dotted = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');

    if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(dotted))) {
      return true;
    }
  }

  if (addr.includes(':')) {
    // IPv6 loopback / unspecified.
    if (addr === '::1' || addr === '::') {
      return true;
    }

    // Unique-local fc00::/7 (fc.. / fd..) and link-local fe80::/10.
    if (/^f[cd][0-9a-f]{0,2}:/.test(addr) || /^fe[89ab][0-9a-f]:/.test(addr)) {
      return true;
    }
  }

  return false;
}

export function isAllowedUrl(input: string): boolean {
  if (!isValidUrl(input)) {
    return false;
  }

  const url = new URL(input);

  /*
   * IPv6-aware: routes bracketed/mapped IPv6 + dotted-quad literals through the
   * shared blocklist instead of a raw-string regex that missed [::1]/[::ffff:..].
   */
  return !isBlockedHost(url.hostname);
}
