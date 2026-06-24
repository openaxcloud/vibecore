/**
 * SSRF guard for USER-SUPPLIED LLM provider base URLs (providerSettings.baseUrl
 * from the client). Such a URL is fetched server-side (dynamic model lists,
 * completions), so without a guard a tenant can point it at cloud metadata
 * (169.254.169.254) or internal cluster services.
 *
 * Loopback is ALLOWED so genuinely-local providers (Ollama, LM Studio) keep
 * working; link-local / metadata / RFC1918 / ULA are blocked by default. A
 * self-host deployment that legitimately runs a model server on a private IP can
 * opt out with ALLOW_PRIVATE_PROVIDER_BASE_URLS=true.
 */
/**
 * Decode the IPv4 address embedded in the low 32 bits of an IPv6 host, regardless
 * of the surrounding prefix. This folds back IPv4-mapped (::ffff:a.b.c.d /
 * ::ffff:hi:lo), the bare ::hi:lo form, AND the NAT64 well-known prefix
 * (64:ff9b::a.b.c.d / 64:ff9b::hi:lo, RFC 6052) so the embedded IPv4 can be run
 * through the blocklist. Being prefix-agnostic also closes any future
 * IPv4-in-IPv6 translation prefix that an egress translator might honour.
 */
function foldIpv4MappedIpv6(host: string): string | undefined {
  // Trailing dotted-quad form: <anything>::a.b.c.d (e.g. ::ffff:1.2.3.4, 64:ff9b::1.2.3.4).
  const dotted = host.match(/(?::|^)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);

  if (dotted) {
    return dotted[1];
  }

  /*
   * Trailing two-hextet form: <prefix>::hi:lo or <prefix>:hi:lo where the low 32
   * bits encode the IPv4. The host must contain a `::` (compressed run) so we only
   * fold genuine embedded-IPv4 layouts and not arbitrary full IPv6 addresses whose
   * last two groups merely look numeric.
   */
  if (host.includes('::')) {
    const hex = host.match(/(?:::|:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);

    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);

      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }

  return undefined;
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127\./.test(host) || host.endsWith('.localhost');
}

/**
 * True when a user-supplied provider base URL must be rejected (metadata /
 * link-local / private / ULA), unless private hosts are explicitly allowed for a
 * self-host deployment. Loopback is always permitted. Unparseable / non-http(s)
 * URLs are rejected.
 */
export function isBlockedProviderBaseUrl(rawUrl: string, allowPrivate = false): boolean {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return true;
  }

  const host = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.+$/, '');

  if (!host) {
    return true;
  }

  if (isLoopback(host)) {
    return false;
  }

  const candidates = [host, foldIpv4MappedIpv6(host)].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    /*
     * Cloud metadata / link-local is NEVER a legitimate provider endpoint — block
     * it even when private hosts are allowed.
     */
    if (/^169\.254\./.test(candidate) || /^fe[89ab][0-9a-f]:/.test(candidate) || candidate.endsWith('.internal')) {
      return true;
    }

    if (allowPrivate) {
      continue;
    }

    if (
      candidate === '0.0.0.0' ||
      candidate === '::' ||
      /^0\./.test(candidate) ||
      /^10\./.test(candidate) ||
      /^192\.168\./.test(candidate) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(candidate) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(candidate) ||
      /^f[cd][0-9a-f]{0,2}:/.test(candidate)
    ) {
      return true;
    }
  }

  return false;
}
