import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { classifyResource, type SkillResourceKind } from './skill-manifest.js';
import { buildRawUrl, isAllowedGithubRawUrl } from './skills-github-fetch.js';
import { normalizeOwnerRepo } from './skills-repo-catalog.js';

export const MAX_SKILL_RESOURCE_BYTES = 32 * 1024;
export const MAX_SKILL_RESOURCE_BUNDLE_BYTES = 128 * 1024;
export const MAX_SKILL_RESOURCES = 8;
export const MAX_SKILL_RESOURCE_DEPTH = 3;

const FETCH_TIMEOUT_MS = 6_000;
const BUNDLE_TIMEOUT_MS = 24_000;

export interface SkillResourceSnapshot {
  path: string;
  kind: SkillResourceKind;
  bytes: number;
  content: string;
  contentHash: string;
}

/** Stable internal protocol codes; API handlers localize the public error. */
export enum SkillResourceFailureReason {
  InvalidRepository = 'invalid_repository',
  InvalidPath = 'invalid_path',
  UnsupportedType = 'unsupported_type',
  ResourceCountLimit = 'resource_count_limit',
  ResourceSizeLimit = 'resource_size_limit',
  BundleSizeLimit = 'bundle_size_limit',
  ResourceDepthLimit = 'resource_depth_limit',
  Unavailable = 'unavailable',
  InvalidContent = 'invalid_content',
  EmptyContent = 'empty_content',
}

export type SkillResourceSnapshotResult =
  | { ok: true; resources: SkillResourceSnapshot[]; resourceContents: Record<string, string> }
  | { ok: false; reason: SkillResourceFailureReason; path?: string };

type PathsResult =
  | { ok: true; paths: string[] }
  | {
      ok: false;
      reason: SkillResourceFailureReason.InvalidPath | SkillResourceFailureReason.UnsupportedType;
      path: string;
    };

/** Only inert text is eligible. Scripts are never downloaded or executed. */
function resolveResourcePath(candidate: string, sourcePath?: string): PathsResult {
  const withoutFragment = candidate.split('#', 1)[0].replace(/^\.\//, '');

  if (
    !withoutFragment ||
    withoutFragment.length > 240 ||
    /[%?\\\x00-\x20\x7f:]/.test(withoutFragment) ||
    withoutFragment.startsWith('/') ||
    withoutFragment.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    return { ok: false, reason: SkillResourceFailureReason.InvalidPath, path: candidate };
  }

  /*
   * Explicit bundle roots remain root-relative inside references. Other links
   * in a resource are relative to that resource's directory, never the host.
   */
  const rootRelative = /^(?:references|assets|scripts)\//.test(withoutFragment);

  const path = posix.normalize(
    rootRelative || !sourcePath ? withoutFragment : posix.join(posix.dirname(sourcePath), withoutFragment),
  );

  if (!/^(?:references|assets|scripts)\/[A-Za-z0-9._/-]+$/.test(path)) {
    return { ok: false, reason: SkillResourceFailureReason.InvalidPath, path: candidate };
  }

  if (path.startsWith('scripts/') || !/\.(?:md|txt|json|csv)$/i.test(path)) {
    return { ok: false, reason: SkillResourceFailureReason.UnsupportedType, path };
  }

  return { ok: true, paths: [path] };
}

/**
 * Discover explicit local Markdown links and standalone backticked bundle paths.
 * No repository crawling, URL following, shell parsing, or Markdown execution.
 * External/fragment links are not bundled resources. Reference-style links are
 * supported through their definitions, including definitions in resource files.
 */
export function referencedSkillResourcePaths(text: string, sourcePath?: string): PathsResult {
  const candidates: string[] = [];
  const linkPattern = /!?\[[^\[\]\r\n]*\]\(\s*(?:<([^\[<>\r\n]+)>|([^\s)\[(]+))(?:\s+["'][^\r\n]*?["'])?\s*\)/g;
  const definitionPattern = /^\s{0,3}\[[^\[\]\r\n]+\]:\s*(?:<([^\[<>\r\n]+)>|(\S+))/gm;

  for (const pattern of [linkPattern, definitionPattern]) {
    for (const match of text.matchAll(pattern)) {
      candidates.push(match[1] ?? match[2]);
    }
  }

  for (const match of text.matchAll(/`([^`\r\n]+)`/g)) {
    const value = match[1];

    if (
      /^(?:\.\/?|\/)?(?:references|assets|scripts)[/\\]/.test(value) ||
      /^\.\.\//.test(value) ||
      (sourcePath && /^[A-Za-z0-9._/-]+\.(?:md|txt|json|csv|sh|py|js|ts|mjs|cjs|rb|html|svg|png|pdf)$/i.test(value))
    ) {
      candidates.push(value);
    }
  }

  const paths = new Set<string>();

  for (const candidate of candidates) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(candidate)) {
      continue;
    }

    const resolved = resolveResourcePath(candidate, sourcePath);

    if (!resolved.ok) {
      return resolved;
    }

    for (const path of resolved.paths) {
      paths.add(path);
    }
  }

  return { ok: true, paths: [...paths] };
}

async function readResource(
  response: Response,
  remainingBytes: number,
): Promise<{ ok: true; content: string; bytes: number } | { ok: false; reason: SkillResourceFailureReason }> {
  const declaredLength = Number(response.headers.get('content-length'));

  if (declaredLength > MAX_SKILL_RESOURCE_BYTES) {
    await response.body?.cancel();
    return { ok: false, reason: SkillResourceFailureReason.ResourceSizeLimit };
  }

  if (declaredLength > remainingBytes) {
    await response.body?.cancel();
    return { ok: false, reason: SkillResourceFailureReason.BundleSizeLimit };
  }

  if (!response.body) {
    return { ok: false, reason: SkillResourceFailureReason.EmptyContent };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  let bytes = 0;

  try {
    for (;;) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      bytes += chunk.value.byteLength;

      if (bytes > MAX_SKILL_RESOURCE_BYTES || bytes > remainingBytes) {
        await reader.cancel();
        return {
          ok: false,
          reason:
            bytes > MAX_SKILL_RESOURCE_BYTES
              ? SkillResourceFailureReason.ResourceSizeLimit
              : SkillResourceFailureReason.BundleSizeLimit,
        };
      }

      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = Buffer.concat(chunks, bytes);

  let content: string;

  try {
    // Preserve the BOM so hashing and the stored UTF-8 bytes describe the same content.
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    return { ok: false, reason: SkillResourceFailureReason.InvalidContent };
  }

  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content)) {
    return { ok: false, reason: SkillResourceFailureReason.InvalidContent };
  }

  if (!content.trim()) {
    return { ok: false, reason: SkillResourceFailureReason.EmptyContent };
  }

  return { ok: true, content, bytes };
}

/**
 * Snapshot every explicitly referenced, bounded resource before the caller's audit.
 * Failure returns no partial bundle. The caller must audit instructions AND all
 * returned contents before persisting them in the project's authorized scope.
 * This function never writes files, runs scripts, or grants tool permissions.
 */
export async function fetchSkillResourceSnapshots(
  ownerRepo: string,
  instructions: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillResourceSnapshotResult> {
  const repo = normalizeOwnerRepo(ownerRepo);

  if (!repo) {
    return { ok: false, reason: SkillResourceFailureReason.InvalidRepository };
  }

  const initial = referencedSkillResourcePaths(instructions);

  if (!initial.ok) {
    return initial;
  }

  const queue = initial.paths.map((path) => ({ path, depth: 1 }));
  const known = new Set(initial.paths);
  const resources: SkillResourceSnapshot[] = [];
  const resourceContents: Record<string, string> = Object.create(null);

  let totalBytes = 0;

  const doFetch = options.fetchImpl ?? fetch;
  const bundleSignal = AbortSignal.timeout(BUNDLE_TIMEOUT_MS);

  for (let index = 0; index < queue.length; index++) {
    const { path, depth } = queue[index];

    if (known.size > MAX_SKILL_RESOURCES) {
      return { ok: false, reason: SkillResourceFailureReason.ResourceCountLimit, path };
    }

    if (depth > MAX_SKILL_RESOURCE_DEPTH) {
      return { ok: false, reason: SkillResourceFailureReason.ResourceDepthLimit, path };
    }

    const url = buildRawUrl(repo, path);

    if (!isAllowedGithubRawUrl(url)) {
      return { ok: false, reason: SkillResourceFailureReason.InvalidPath, path };
    }

    try {
      bundleSignal.throwIfAborted();

      const response = await doFetch(url, {
        redirect: 'error',
        signal: AbortSignal.any([bundleSignal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
        headers: { accept: 'text/plain, text/markdown, application/json, text/csv' },
      });

      if (!response.ok || response.redirected || (response.url && response.url !== url)) {
        await response.body?.cancel();
        return { ok: false, reason: SkillResourceFailureReason.Unavailable, path };
      }

      if (response.status !== 200 || response.headers.has('content-range')) {
        await response.body?.cancel();
        return { ok: false, reason: SkillResourceFailureReason.InvalidContent, path };
      }

      const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();

      if (contentType && !['text/plain', 'text/markdown', 'text/csv', 'application/json'].includes(contentType)) {
        await response.body?.cancel();
        return { ok: false, reason: SkillResourceFailureReason.InvalidContent, path };
      }

      const read = await readResource(response, MAX_SKILL_RESOURCE_BUNDLE_BYTES - totalBytes);

      if (!read.ok) {
        return { ...read, path };
      }

      totalBytes += read.bytes;
      resources.push({
        path,
        kind: classifyResource(path),
        bytes: read.bytes,
        content: read.content,
        contentHash: createHash('sha256').update(read.content, 'utf8').digest('hex'),
      });
      resourceContents[path] = read.content;

      const next = referencedSkillResourcePaths(read.content, path);

      if (!next.ok) {
        return next;
      }

      for (const child of next.paths) {
        if (known.has(child)) {
          continue;
        }

        known.add(child);
        queue.push({ path: child, depth: depth + 1 });
      }
    } catch {
      return { ok: false, reason: SkillResourceFailureReason.Unavailable, path };
    }
  }

  return { ok: true, resources, resourceContents };
}
