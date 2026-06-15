/**
 * SSRF guard for remote MCP server URLs, mirrored from the API's
 * `isBlockedMcpUrl` (services/api/src/mcp-marketplace.ts) so the WEB pod -
 * which opens the SSE / streamable-http transport itself - applies the same
 * defense as the save-time API check. Without this, a route that connects to a
 * user-supplied MCP url (e.g. /api/mcp-update-config) is an authenticated SSRF
 * primitive against cloud metadata (169.254.169.254) and internal services.
 *
 * Keep in sync with the API copy. Both are intentionally self-contained (no
 * deps) so they can live in their respective bundles.
 */

function foldIpv4MappedIpv6(host: string): string | undefined {
  const dotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);

  if (dotted) {
    return dotted[1];
  }

  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);

  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);

    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  const transition =
    host.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i) || host.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/i);

  if (transition) {
    const hi = parseInt(transition[1], 16);
    const lo = parseInt(transition[2], 16);

    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  const compat = host.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);

  if (compat) {
    const hi = parseInt(compat[1], 16);
    const lo = parseInt(compat[2], 16);

    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return undefined;
}

/**
 * True when an MCP server URL must be rejected: non-https, unparseable, or
 * pointing at loopback / link-local / private / cloud-metadata addresses
 * (including IPv4-mapped/compat/transition IPv6 folds).
 */
export function isBlockedMcpUrl(rawUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }

  if (url.protocol !== 'https:') {
    return true;
  }

  const host = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.+$/, '');

  if (!host) {
    return true;
  }

  const candidates = [host, foldIpv4MappedIpv6(host)].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (
      candidate === 'localhost' ||
      candidate === '0.0.0.0' ||
      candidate === '::1' ||
      candidate === '::' ||
      candidate.endsWith('.localhost') ||
      candidate.endsWith('.internal') ||
      candidate.endsWith('.local') ||
      /^127\./.test(candidate) ||
      /^0\./.test(candidate) ||
      /^10\./.test(candidate) ||
      /^192\.168\./.test(candidate) ||
      /^169\.254\./.test(candidate) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(candidate) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(candidate) ||
      /^f[cd][0-9a-f]{0,2}:/.test(candidate) ||
      /^fe[89ab][0-9a-f]:/.test(candidate)
    ) {
      return true;
    }
  }

  return false;
}
