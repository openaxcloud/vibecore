import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { ProjectGalleryError, type GalleryPreviewEvidence } from './project-gallery.js';

const MAX_DOCUMENT_BYTES = 1024 * 1024;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_ASSET_COUNT = 32;
const ASSET_FETCH_CONCURRENCY = 4;

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

export interface GalleryPreviewProbeOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
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
  fetchImpl: typeof fetch,
  url: URL,
  timeoutMs: number,
  context: { stage: 'document' | 'asset'; asset?: GalleryPreviewAsset },
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept:
          context.stage === 'document'
            ? 'text/html,application/xhtml+xml;q=0.9'
            : context.asset?.kind === 'style'
              ? 'text/css,*/*;q=0.1'
              : 'text/javascript,application/javascript,*/*;q=0.1',
        'user-agent': 'e-code-gallery-preview-probe/1.0',
      },
    });
  } catch {
    previewFailure(
      'The published preview could not be reached; retry after the deployment is healthy',
      'GALLERY_PREVIEW_UNREACHABLE',
      {
        stage: context.stage,
        ...(context.asset ? { assetType: context.asset.kind, assetPath: safeResourcePath(context.asset.url) } : {}),
      },
    );
  }
}

async function verifyAsset(
  asset: GalleryPreviewAsset,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<GalleryPreviewAssetEvidence> {
  const response = await fetchPreviewResource(fetchImpl, asset.url, timeoutMs, { stage: 'asset', asset });

  if (response.status < 200 || response.status >= 300) {
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

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(250, Math.min(options.timeoutMs ?? 10_000, 30_000));
  const response = await fetchPreviewResource(fetchImpl, url, timeoutMs, { stage: 'document' });

  if (response.status < 200 || response.status >= 300) {
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
    verifyAsset(asset, fetchImpl, timeoutMs),
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
