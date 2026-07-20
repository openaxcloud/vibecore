import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import { Script } from 'node:vm';
import { ProjectGalleryError, type GalleryPreviewEvidence } from './project-gallery.js';

const MAX_DOCUMENT_BYTES = 1024 * 1024;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_ASSET_COUNT = 32;
const ASSET_FETCH_CONCURRENCY = 4;

const BLOCKED_IPV4_SUBNETS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  // Azure's host virtual IP is public-looking but only exposes platform services inside a VM.
  ['168.63.129.16', 32],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const;

const BLOCKED_IPV6_SUBNETS = [
  // Unspecified, loopback, IPv4-compatible, and other IPv4-embedded forms.
  ['::', 96],
  ['::ffff:0:0', 96],
  // NAT64/local-use and transition mechanisms can otherwise encode a private IPv4 target.
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  // Unique-local, deprecated site-local, link-local, and multicast space.
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['ff00::', 8],
] as const;

// Keep the families in separate lists: Node represents IPv4 internally as
// IPv4-mapped IPv6, so adding ::ffff:0:0/96 to a shared list would also match
// every ordinary IPv4 address checked as `ipv4`.
const blockedPreviewIpv4Addresses = new BlockList();
const blockedPreviewIpv6Addresses = new BlockList();

for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockedPreviewIpv4Addresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) {
  blockedPreviewIpv6Addresses.addSubnet(network, prefix, 'ipv6');
}

type GalleryPreviewAssetKind = 'script' | 'style';

interface GalleryPreviewAsset {
  kind: GalleryPreviewAssetKind;
  url: URL;
}

interface GalleryPreviewAssetEvidence {
  bytes: number;
  digest: string;
  kind: GalleryPreviewAssetKind;
  path: string;
}

export interface GalleryPreviewResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type GalleryPreviewHostnameResolver = (hostname: string) => Promise<readonly GalleryPreviewResolvedAddress[]>;

export interface GalleryPreviewProbeOptions {
  /** Test seam only. Production requests use the pinned HTTPS transport below. */
  fetchImpl?: typeof fetch;
  now?: () => Date;
  resolveHostname?: GalleryPreviewHostnameResolver;
  timeoutMs?: number;
}

interface GalleryPreviewRequestContext {
  stage: 'document' | 'asset';
  asset?: GalleryPreviewAsset;
}

interface PinnedPreviewTarget {
  address: string;
  family: 4 | 6;
}

function previewFailure(message: string, code: string, details: Record<string, unknown> = {}): never {
  throw new ProjectGalleryError(message, 422, code, {
    recoverable: true,
    ...details,
  });
}

function responseContentType(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';', 1)[0]!.trim().toLowerCase();
}

function safeResourcePath(url: URL): string {
  // Query strings can contain signed-preview credentials and must never be returned to the client.
  return url.pathname.slice(0, 512) || '/';
}

function requestContextDetails(context: GalleryPreviewRequestContext): Record<string, unknown> {
  return context.asset
    ? { stage: context.stage, assetType: context.asset.kind, assetPath: safeResourcePath(context.asset.url) }
    : { stage: context.stage };
}

function canonicalHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.+$/, '');
}

function hostnameIsIntrinsicallyUnsafe(hostname: string): boolean {
  return (
    !hostname ||
    hostname === 'localhost' ||
    hostname === 'metadata' ||
    hostname === 'instance-data' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa') ||
    hostname.endsWith('.svc') ||
    hostname.endsWith('.cluster.local')
  );
}

function addressIsUnsafe(address: string, family: 4 | 6): boolean {
  return family === 4
    ? blockedPreviewIpv4Addresses.check(address, 'ipv4')
    : blockedPreviewIpv6Addresses.check(address, 'ipv6');
}

const resolveWithSystemDns: GalleryPreviewHostnameResolver = async (hostname) => {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });

  return addresses.flatMap((candidate) => {
    const family = isIP(candidate.address);
    return family === 4 || family === 6 ? [{ address: candidate.address, family }] : [];
  });
};

async function resolveWithinTimeout(
  resolver: GalleryPreviewHostnameResolver,
  hostname: string,
  timeoutMs: number,
): Promise<readonly GalleryPreviewResolvedAddress[]> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      resolver(hostname),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolvePinnedPreviewTarget(
  url: URL,
  resolver: GalleryPreviewHostnameResolver,
  timeoutMs: number,
  context: GalleryPreviewRequestContext,
): Promise<PinnedPreviewTarget> {
  const hostname = canonicalHostname(url);

  if (
    url.protocol !== 'https:' ||
    Boolean(url.username) ||
    Boolean(url.password) ||
    hostnameIsIntrinsicallyUnsafe(hostname)
  ) {
    previewFailure(
      'The published preview URL targets a private or reserved network location',
      'GALLERY_PREVIEW_UNSAFE_NETWORK_TARGET',
      { ...requestContextDetails(context), reason: 'BLOCKED_HOST' },
    );
  }

  const literalFamily = isIP(hostname);
  let addresses: readonly GalleryPreviewResolvedAddress[];

  if (literalFamily === 4 || literalFamily === 6) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await resolveWithinTimeout(resolver, hostname, timeoutMs);
    } catch {
      previewFailure(
        'The published preview could not be reached; retry after the deployment is healthy',
        'GALLERY_PREVIEW_UNREACHABLE',
        requestContextDetails(context),
      );
    }
  }

  if (addresses.length === 0) {
    previewFailure(
      'The published preview could not be reached; retry after the deployment is healthy',
      'GALLERY_PREVIEW_UNREACHABLE',
      requestContextDetails(context),
    );
  }

  const normalized = addresses.map((candidate) => {
    const family = isIP(candidate.address);

    if ((family !== 4 && family !== 6) || family !== candidate.family || candidate.address.includes('%')) {
      previewFailure(
        'The published preview URL targets a private or reserved network location',
        'GALLERY_PREVIEW_UNSAFE_NETWORK_TARGET',
        { ...requestContextDetails(context), reason: 'INVALID_DNS_ANSWER' },
      );
    }

    return { address: candidate.address, family } satisfies PinnedPreviewTarget;
  });

  // Reject the whole DNS answer if even one route is private. Selecting only a
  // public sibling would leave a rebinding/mixed-answer bypass for later retries.
  if (normalized.some((candidate) => addressIsUnsafe(candidate.address, candidate.family))) {
    previewFailure(
      'The published preview URL targets a private or reserved network location',
      'GALLERY_PREVIEW_UNSAFE_NETWORK_TARGET',
      { ...requestContextDetails(context), reason: 'BLOCKED_ADDRESS' },
    );
  }

  return normalized[0]!;
}

function pinnedHttpsFetch(
  url: URL,
  target: PinnedPreviewTarget,
  signal: AbortSignal,
  headers: Record<string, string>,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) {
        callback(null, [{ address: target.address, family: target.family }]);
        return;
      }

      callback(null, target.address, target.family);
    };
    const request = httpsRequest(
      url,
      {
        method: 'GET',
        headers,
        lookup: pinnedLookup,
        signal,
      },
      (response) => {
        const status = response.statusCode ?? 502;
        const responseHeaders = new Headers();

        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          const name = response.rawHeaders[index];
          const value = response.rawHeaders[index + 1];
          if (name && value !== undefined) responseHeaders.append(name, value);
        }

        const hasBody = ![101, 204, 205, 304].includes(status);
        const body = hasBody ? (Readable.toWeb(response) as ReadableStream<Uint8Array>) : null;

        resolve(
          new Response(body, {
            status,
            statusText: response.statusMessage,
            headers: responseHeaders,
          }),
        );
      },
    );

    request.once('error', reject);
    request.end();
  });
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
  context: { stage: 'document' | 'asset'; asset?: GalleryPreviewAsset },
): Promise<{ bytes: number; text: string }> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    previewFailure(
      'The published preview returned a resource that is too large to verify safely',
      'GALLERY_PREVIEW_TOO_LARGE',
      {
        stage: context.stage,
        ...(context.asset ? { assetType: context.asset.kind, assetPath: safeResourcePath(context.asset.url) } : {}),
        maxBytes,
      },
    );
  }

  if (!response.body) return { bytes: 0, text: '' };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;

      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        previewFailure(
          'The published preview returned a resource that is too large to verify safely',
          'GALLERY_PREVIEW_TOO_LARGE',
          {
            stage: context.stage,
            ...(context.asset ? { assetType: context.asset.kind, assetPath: safeResourcePath(context.asset.url) } : {}),
            maxBytes,
          },
        );
      }

      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

  try {
    return { bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(body) };
  } catch {
    previewFailure(
      'The published preview returned non-text content where application code was expected',
      'GALLERY_PREVIEW_INVALID_CONTENT',
      {
        stage: context.stage,
        ...(context.asset ? { assetType: context.asset.kind, assetPath: safeResourcePath(context.asset.url) } : {}),
      },
    );
  }
}

function parseTagAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (name) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function documentBaseUrl(html: string, previewUrl: URL): URL {
  const baseTag = html.match(/<base\b([^>]*)>/i);
  const href = baseTag ? parseTagAttributes(baseTag[1] ?? '').get('href') : undefined;

  if (!href) return previewUrl;

  try {
    return new URL(href, previewUrl);
  } catch {
    previewFailure('The published preview contains an invalid base URL', 'GALLERY_PREVIEW_INVALID_CONTENT', {
      stage: 'document',
    });
  }
}

function resolveAssetUrl(rawUrl: string, baseUrl: URL): URL | undefined {
  try {
    const url = new URL(rawUrl, baseUrl);
    url.hash = '';
    return url;
  } catch {
    return undefined;
  }
}

function extractSameOriginAssets(html: string, previewUrl: URL): GalleryPreviewAsset[] {
  const baseUrl = documentBaseUrl(html, previewUrl);
  const assets: GalleryPreviewAsset[] = [];
  const seen = new Set<string>();

  const addAsset = (kind: GalleryPreviewAssetKind, rawUrl: string | undefined) => {
    if (!rawUrl?.trim()) {
      previewFailure(
        'The published preview contains an empty script or stylesheet URL',
        'GALLERY_PREVIEW_INVALID_CONTENT',
        {
          stage: 'document',
          assetType: kind,
        },
      );
    }

    const url = resolveAssetUrl(rawUrl, baseUrl);

    if (!url) {
      previewFailure(
        'The published preview contains an invalid script or stylesheet URL',
        'GALLERY_PREVIEW_INVALID_CONTENT',
        {
          stage: 'document',
          assetType: kind,
        },
      );
    }

    // Cross-origin dependencies are deliberately not fetched by this server-side probe.
    // An empty SPA shell must still have a verifiable same-origin entrypoint below.
    if (url.origin !== previewUrl.origin || !['http:', 'https:'].includes(url.protocol)) return;

    const key = `${kind}:${url.href}`;
    if (seen.has(key)) return;
    seen.add(key);
    assets.push({ kind, url });
  };

  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = parseTagAttributes(match[1] ?? '');
    if (attributes.has('src')) addAsset('script', attributes.get('src'));
  }

  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = parseTagAttributes(match[1] ?? '');
    const rel = new Set((attributes.get('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean));
    const as = (attributes.get('as') ?? '').toLowerCase();

    if (rel.has('stylesheet')) addAsset('style', attributes.get('href'));
    else if (rel.has('modulepreload') || (rel.has('preload') && as === 'script')) {
      addAsset('script', attributes.get('href'));
    } else if (rel.has('preload') && as === 'style') {
      addAsset('style', attributes.get('href'));
    }
  }

  if (assets.length > MAX_ASSET_COUNT) {
    previewFailure(
      'The published preview references too many executable or stylesheet assets to verify safely',
      'GALLERY_PREVIEW_ASSET_LIMIT_EXCEEDED',
      { stage: 'document', assetCount: assets.length, maxAssetCount: MAX_ASSET_COUNT },
    );
  }

  return assets;
}

function inlineClientEntrypointIsPlausible(html: string): boolean {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = parseTagAttributes(match[1] ?? '');
    if (attributes.has('src')) continue;

    const type = (attributes.get('type') ?? '').trim().toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;

    const source = (match[2] ?? '').trim();
    if (source.length < 24) continue;

    if (type === 'module') return true;

    try {
      new Script(source);
      return true;
    } catch {
      previewFailure('The published preview contains invalid inline JavaScript', 'GALLERY_PREVIEW_INVALID_CONTENT', {
        stage: 'document',
        assetType: 'script',
      });
    }
  }

  return false;
}

function visibleDocumentText(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? html;

  return body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:script|style|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos);/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertMeaningfulDocument(html: string, assets: readonly GalleryPreviewAsset[]) {
  const visibleText = visibleDocumentText(html);
  const hasVisualRenderTarget = /<(?:canvas|svg|img|video|iframe)\b/i.test(html);
  const hasSameOriginScript = assets.some((asset) => asset.kind === 'script');
  const hasInlineClientEntrypoint = inlineClientEntrypointIsPlausible(html);

  if (visibleText.length < 12 && !hasVisualRenderTarget && !hasSameOriginScript && !hasInlineClientEntrypoint) {
    previewFailure(
      'The published preview is only an empty application shell and has no verifiable client entrypoint',
      'GALLERY_PREVIEW_NOT_FUNCTIONAL',
      { stage: 'document', reason: 'EMPTY_SHELL' },
    );
  }
}

function assetContentTypeIsValid(kind: GalleryPreviewAssetKind, contentType: string): boolean {
  if (!contentType || ['application/octet-stream', 'text/plain'].includes(contentType)) return true;
  if (kind === 'style') return contentType === 'text/css';

  return /(?:java|ecma)script/.test(contentType);
}

async function fetchPreviewResource(
  url: URL,
  timeoutMs: number,
  context: GalleryPreviewRequestContext,
  options: Pick<GalleryPreviewProbeOptions, 'fetchImpl' | 'resolveHostname'>,
): Promise<Response> {
  const target = await resolvePinnedPreviewTarget(
    url,
    options.resolveHostname ?? resolveWithSystemDns,
    timeoutMs,
    context,
  );
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = {
    accept:
      context.stage === 'document'
        ? 'text/html,application/xhtml+xml;q=0.9'
        : context.asset?.kind === 'style'
          ? 'text/css,*/*;q=0.1'
          : 'text/javascript,application/javascript,*/*;q=0.1',
    'user-agent': 'e-code-gallery-preview-probe/1.0',
  };

  try {
    // The production transport connects to the already-validated IP while
    // retaining the original hostname for Host/SNI. This removes the second
    // DNS lookup in global fetch that would otherwise reopen a rebinding race.
    if (!options.fetchImpl) return await pinnedHttpsFetch(url, target, signal, headers);

    return await options.fetchImpl(url, { method: 'GET', redirect: 'manual', signal, headers });
  } catch {
    previewFailure(
      'The published preview could not be reached; retry after the deployment is healthy',
      'GALLERY_PREVIEW_UNREACHABLE',
      requestContextDetails(context),
    );
  }
}

async function verifyAsset(
  asset: GalleryPreviewAsset,
  timeoutMs: number,
  options: Pick<GalleryPreviewProbeOptions, 'fetchImpl' | 'resolveHostname'>,
): Promise<GalleryPreviewAssetEvidence> {
  const response = await fetchPreviewResource(asset.url, timeoutMs, { stage: 'asset', asset }, options);

  if (response.status < 200 || response.status >= 300) {
    await response.body?.cancel().catch(() => undefined);
    previewFailure(
      'The published preview references a script or stylesheet that is unavailable',
      'GALLERY_PREVIEW_ASSET_UNAVAILABLE',
      {
        stage: 'asset',
        assetType: asset.kind,
        assetPath: safeResourcePath(asset.url),
        httpStatus: response.status,
      },
    );
  }

  const contentType = responseContentType(response);
  const body = await readLimitedText(response, MAX_ASSET_BYTES, { stage: 'asset', asset });
  const looksLikeHtml = /<!doctype\s+html|<html\b|<body\b/i.test(body.text.slice(0, 2048));

  if (!body.text.trim() || looksLikeHtml || !assetContentTypeIsValid(asset.kind, contentType)) {
    previewFailure(
      'The published preview returned invalid content for a script or stylesheet',
      'GALLERY_PREVIEW_ASSET_INVALID',
      {
        stage: 'asset',
        assetType: asset.kind,
        assetPath: safeResourcePath(asset.url),
        contentType: contentType || undefined,
      },
    );
  }

  return {
    bytes: body.bytes,
    digest: createHash('sha256').update(body.text).digest('hex'),
    kind: asset.kind,
    path: safeResourcePath(asset.url),
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await operation(values[index]!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

/**
 * Browser-independent publication gate. It proves that the deployed HTML is a
 * meaningful document and that every same-origin script/stylesheet needed by
 * its entrypoint is currently fetchable and has plausible content. Runtime E2E
 * remains the stronger browser proof, but a broken asset shell can no longer be
 * accepted merely because index.html returned bytes.
 */
export async function probeGalleryFunctionalPreview(
  previewUrl: string,
  options: GalleryPreviewProbeOptions = {},
): Promise<GalleryPreviewEvidence> {
  let url: URL;

  try {
    url = new URL(previewUrl);
  } catch {
    previewFailure('The published preview URL is invalid', 'GALLERY_PREVIEW_NOT_FUNCTIONAL', {
      stage: 'document',
      reason: 'INVALID_URL',
    });
  }

  if (url.protocol !== 'https:') {
    previewFailure('The published preview must use HTTPS', 'GALLERY_PREVIEW_NOT_FUNCTIONAL', {
      stage: 'document',
      reason: 'INVALID_URL',
    });
  }

  const timeoutMs = Math.max(250, Math.min(options.timeoutMs ?? 10_000, 30_000));
  const requestOptions = { fetchImpl: options.fetchImpl, resolveHostname: options.resolveHostname };
  const response = await fetchPreviewResource(url, timeoutMs, { stage: 'document' }, requestOptions);

  if (response.status < 200 || response.status >= 300) {
    await response.body?.cancel().catch(() => undefined);
    previewFailure('The published preview document is unavailable', 'GALLERY_PREVIEW_NOT_FUNCTIONAL', {
      stage: 'document',
      reason: 'HTTP_STATUS',
      httpStatus: response.status,
    });
  }

  const contentType = responseContentType(response);
  const document = await readLimitedText(response, MAX_DOCUMENT_BYTES, { stage: 'document' });
  const looksLikeHtml = /<!doctype\s+html|<html\b|<head\b|<body\b/i.test(document.text.slice(0, 4096));

  if (
    !document.text.trim() ||
    (contentType && !['text/html', 'application/xhtml+xml'].includes(contentType)) ||
    !looksLikeHtml
  ) {
    previewFailure(
      'The published preview did not return a valid HTML application document',
      'GALLERY_PREVIEW_NOT_FUNCTIONAL',
      {
        stage: 'document',
        reason: 'INVALID_DOCUMENT',
        contentType: contentType || undefined,
      },
    );
  }

  const assets = extractSameOriginAssets(document.text, url);
  assertMeaningfulDocument(document.text, assets);

  const assetEvidence = await mapWithConcurrency(assets, ASSET_FETCH_CONCURRENCY, (asset) =>
    verifyAsset(asset, timeoutMs, requestOptions),
  );
  const checkedAssetBytes = assetEvidence.reduce((sum, asset) => sum + asset.bytes, 0);

  if (checkedAssetBytes > MAX_TOTAL_ASSET_BYTES) {
    previewFailure('The published preview assets exceed the safe verification budget', 'GALLERY_PREVIEW_TOO_LARGE', {
      stage: 'asset',
      maxBytes: MAX_TOTAL_ASSET_BYTES,
    });
  }

  const marker = createHash('sha256').update(document.text);
  for (const asset of assetEvidence) {
    marker.update(`\0${asset.kind}\0${asset.path}\0${asset.digest}`);
  }

  return {
    previewUrl,
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
    httpStatus: response.status,
    rendered: true,
    marker: marker.digest('hex').slice(0, 16),
    checkedAssetCount: assetEvidence.length,
    checkedAssetBytes,
    documentBytes: document.bytes,
  };
}
