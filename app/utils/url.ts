/**
 * URL validation utilities with SSRF protection.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // Class B private
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // Class C private
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local
  /^0\.0\.0\.0$/, // Unspecified
];

const BLOCKED_HOSTNAMES = new Set(['localhost', '[::1]', '0.0.0.0']);

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

  // IPv4-mapped / -compatible IPv6 (e.g. ::ffff:169.254.169.254) — re-check the
  // embedded v4 address against the private patterns.
  const mappedV4 = addr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);

  if (addr.includes(':') && mappedV4 && PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(mappedV4[1]))) {
    return true;
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
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return false;
  }

  return true;
}
