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
function foldIpv4MappedIpv6(host: string): string | undefined {
  const dotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);

  if (dotted) {
    return dotted[1];
  }

  const hex =
    host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i) || host.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);

  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);

    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
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
