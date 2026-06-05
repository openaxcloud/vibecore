import { lookup } from 'node:dns/promises';
import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { isAllowedUrl, isPrivateIp } from '~/utils/url';

const MAX_CONTENT_LENGTH = 8000;
const MAX_REDIRECTS = 5;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);

  if (match) {
    return match[1].trim();
  }

  // Try reverse attribute order
  const altMatch = html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);

  return altMatch ? altMatch[1].trim() : '';
}

function extractTextContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reject a URL whose host resolves to an internal address. The string-level
 * `isAllowedUrl` only inspects the hostname literal; this resolves DNS so a
 * public hostname that maps to a private/link-local/loopback IP (DNS rebinding,
 * or a redirect into the metadata server) is blocked.
 */
async function assertHostAllowed(rawUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedUrl(rawUrl)) {
    return { ok: false, error: 'URL is not allowed. Only public HTTP/HTTPS URLs are accepted.' };
  }

  const hostname = new URL(rawUrl).hostname;

  try {
    const records = await lookup(hostname, { all: true });

    if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
      return { ok: false, error: 'URL resolves to a disallowed (internal) address.' };
    }
  } catch {
    return { ok: false, error: 'Could not resolve the URL host.' };
  }

  return { ok: true };
}

/**
 * Fetch following redirects manually so every hop's destination is
 * re-validated against the SSRF allow-list. The default `redirect: 'follow'`
 * would let a public URL 302 the request into an internal host.
 */
async function safeFetch(
  initialUrl: string,
): Promise<{ ok: true; response: Response } | { ok: false; status: number; error: string }> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const guard = await assertHostAllowed(currentUrl);

    if (!guard.ok) {
      return { ok: false, status: 400, error: guard.error };
    }

    const response = await fetch(currentUrl, {
      headers: FETCH_HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      currentUrl = new URL(response.headers.get('location')!, currentUrl).toString();
      continue;
    }

    return { ok: true, response };
  }

  return { ok: false, status: 502, error: 'Too many redirects' };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { url } = (await request.json()) as { url?: string };

    if (!url || typeof url !== 'string') {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    const fetched = await safeFetch(url);

    if (!fetched.ok) {
      return json({ error: fetched.error }, { status: fetched.status });
    }

    const response = fetched.response;

    if (!response.ok) {
      return json({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` }, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return json({ error: 'URL must point to an HTML or text page' }, { status: 400 });
    }

    const html = await response.text();
    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const content = extractTextContent(html);

    return json({
      success: true,
      data: {
        title,
        description,
        content: content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) + '...' : content,
        sourceUrl: url,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return json({ error: 'Request timed out after 10 seconds' }, { status: 504 });
    }

    console.error('Web search error:', error);

    return json({ error: error instanceof Error ? error.message : 'Failed to fetch URL' }, { status: 500 });
  }
}
