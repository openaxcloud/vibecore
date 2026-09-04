import { createHash } from 'node:crypto';

const GITHUB_API_HOST = 'api.github.com';
const GITHUB_RAW_HOST = 'raw.githubusercontent.com';
const FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_BUNDLE_TIMEOUT_MS = 30_000;
const DEFAULT_DOWNLOAD_CONCURRENCY = 4;
const MAX_DOWNLOAD_CONCURRENCY = 8;
const MAX_SKILL_FILES = 200;
const MAX_SKILL_FILE_BYTES = 512 * 1024;
const MAX_SKILL_BUNDLE_BYTES = 5 * 1024 * 1024;
const MAX_SKILL_DEPTH = 8;
const MAX_GITHUB_JSON_BYTES = 12 * 1024 * 1024;
const MAX_GITHUB_COMMIT_JSON_BYTES = 64 * 1024;

const OWNER_REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,99})\/[A-Za-z0-9._-]{1,100}$/;
const COMMIT_SHA_RE = /^[a-f0-9]{40}$/i;
const CANONICAL_BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type SkillSourceErrorCode =
  | 'SKILL_SOURCE_INVALID'
  | 'SKILL_SOURCE_NOT_FOUND'
  | 'SKILL_SOURCE_FORBIDDEN'
  | 'SKILL_SOURCE_ABORTED'
  | 'SKILL_SOURCE_TIMEOUT'
  | 'SKILL_SOURCE_UNREACHABLE'
  | 'SKILL_SOURCE_TOO_LARGE'
  | 'SKILL_SOURCE_UNSAFE'
  | 'SKILL_SOURCE_RATE_LIMITED';

export class SkillSourceError extends Error {
  readonly code: SkillSourceErrorCode;
  readonly statusCode: number;

  constructor(code: SkillSourceErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'SkillSourceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface GithubSkillSource {
  ownerRepo: string;

  /** Folder containing SKILL.md, relative to the repository root. */
  skillPath: string;

  /** Branch, tag, or commit. It is always resolved to an immutable commit SHA. */
  ref?: string;
}

export interface GithubSkillBundleFile {
  /** POSIX path relative to the selected skill folder. */
  path: string;
  contentBase64: string;
  byteLength: number;

  /** Git tree mode. Symlinks and non-regular files are rejected before this point. */
  mode: '100644' | '100755';
}

export interface GithubSkillBundle {
  ownerRepo: string;
  skillPath: string;
  commitSha: string;
  sourceUrl: string;
  digest: string;
  files: GithubSkillBundleFile[];
}

interface GithubCommitResponse {
  sha?: unknown;
}

interface GithubTreeEntry {
  path?: unknown;
  mode?: unknown;
  type?: unknown;
  size?: unknown;
}

interface GithubTreeResponse {
  truncated?: unknown;
  tree?: unknown;
}

function checkedUrl(raw: string, host: string): string {
  const parsed = new URL(raw);

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase().replace(/\.+$/, '') !== host) {
    throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'Skill source URL is outside the GitHub allowlist.', 400);
  }

  if (parsed.username || parsed.password) {
    throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'Credential-bearing skill source URLs are forbidden.', 400);
  }

  return parsed.toString();
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function normalizeGithubSkillSource(input: GithubSkillSource): Required<GithubSkillSource> {
  const ownerRepo = input.ownerRepo.trim().replace(/\.git$/i, '');
  const repository = ownerRepo.split('/')[1];

  if (!OWNER_REPO_RE.test(ownerRepo) || repository === '.' || repository === '..') {
    throw new SkillSourceError('SKILL_SOURCE_INVALID', 'ownerRepo must be a valid GitHub owner/repository slug.', 400);
  }

  const parts = input.skillPath.trim().split('/').filter(Boolean);

  if (
    parts.length === 0 ||
    parts.length > MAX_SKILL_DEPTH ||
    parts.some((part) => part === '.' || part === '..' || part.includes('\\') || /[\u0000-\u001f\u007f]/.test(part))
  ) {
    throw new SkillSourceError('SKILL_SOURCE_INVALID', 'skillPath must identify a confined repository folder.', 400);
  }

  const ref = (input.ref ?? 'HEAD').trim();

  if (
    !ref ||
    ref.length > 200 ||
    ref === '.' ||
    ref === '..' ||
    ref.startsWith('/') ||
    ref.endsWith('/') ||
    ref.endsWith('.') ||
    ref.includes('//') ||
    ref.includes('..') ||
    ref.includes('@{') ||
    /[\u0000-\u0020\u007f~^:?*[\\]/.test(ref)
  ) {
    throw new SkillSourceError('SKILL_SOURCE_INVALID', 'ref is invalid.', 400);
  }

  return { ownerRepo, skillPath: parts.join('/'), ref };
}

function requestHeaders(githubToken?: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    'user-agent': 'E-Code-Agent-Skills-Auditor/1.0',
    'x-github-api-version': '2022-11-28',
    ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
  };
}

async function githubFetch(
  url: string,
  options: { fetchImpl: typeof fetch; githubToken?: string; accept?: string; signal?: AbortSignal },
): Promise<Response> {
  let response: Response;

  const hopTimeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, hopTimeout]) : hopTimeout;

  try {
    response = await options.fetchImpl(url, {
      redirect: 'error',
      signal,
      headers: {
        ...requestHeaders(options.githubToken),
        ...(options.accept ? { accept: options.accept } : {}),
      },
    });
  } catch {
    if (options.signal?.aborted) {
      throw new SkillSourceError('SKILL_SOURCE_ABORTED', 'The skill import was cancelled.', 499);
    }

    throw new SkillSourceError('SKILL_SOURCE_UNREACHABLE', 'GitHub could not be reached for skill audit.', 502);
  }

  if (response.status === 404) {
    throw new SkillSourceError('SKILL_SOURCE_NOT_FOUND', 'The skill source or requested path was not found.', 404);
  }

  if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
    throw new SkillSourceError('SKILL_SOURCE_RATE_LIMITED', 'GitHub rate-limited the skill audit request.', 429);
  }

  if (response.status === 401 || response.status === 403) {
    throw new SkillSourceError(
      'SKILL_SOURCE_FORBIDDEN',
      'GitHub denied access to the skill source; verify the repository and audit token permissions.',
      403,
    );
  }

  if (!response.ok) {
    throw new SkillSourceError(
      'SKILL_SOURCE_UNREACHABLE',
      'GitHub returned an error for the skill audit request.',
      502,
    );
  }

  return response;
}

async function readBoundedResponse(response: Response, maxBytes: number, errorMessage: string): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');

  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new SkillSourceError('SKILL_SOURCE_TOO_LARGE', errorMessage, 413);
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength > maxBytes) {
      throw new SkillSourceError('SKILL_SOURCE_TOO_LARGE', errorMessage, 413);
    }

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  let byteLength = 0;

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      byteLength += chunk.value.byteLength;

      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SkillSourceError('SKILL_SOURCE_TOO_LARGE', errorMessage, 413);
      }

      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(byteLength);

  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

async function readGithubJson<T>(response: Response, maxBytes: number): Promise<T> {
  const bytes = await readBoundedResponse(
    response,
    maxBytes,
    'The GitHub metadata response is too large to audit safely.',
  );

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text) as T;
  } catch {
    throw new SkillSourceError('SKILL_SOURCE_UNREACHABLE', 'GitHub returned invalid metadata for the skill.', 502);
  }
}

async function resolveCommitSha(
  source: Required<GithubSkillSource>,
  options: { fetchImpl: typeof fetch; githubToken?: string; signal?: AbortSignal },
): Promise<string> {
  if (COMMIT_SHA_RE.test(source.ref)) {
    return source.ref.toLowerCase();
  }

  const [owner, repo] = source.ownerRepo.split('/');

  const url = checkedUrl(
    `https://${GITHUB_API_HOST}/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/commits/${encodeURIComponent(source.ref)}`,
    GITHUB_API_HOST,
  );

  const response = await githubFetch(url, options);
  const payload = await readGithubJson<GithubCommitResponse>(response, MAX_GITHUB_COMMIT_JSON_BYTES);

  if (typeof payload.sha !== 'string' || !COMMIT_SHA_RE.test(payload.sha)) {
    throw new SkillSourceError('SKILL_SOURCE_UNREACHABLE', 'GitHub returned an invalid commit for the skill.', 502);
  }

  return payload.sha.toLowerCase();
}

function positiveBoundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;

  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new SkillSourceError('SKILL_SOURCE_INVALID', `Expected an integer between 1 and ${maximum}.`, 400);
  }

  return value;
}

function abortLike(error: unknown): boolean {
  return (
    (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
  );
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('The skill import was cancelled.', 'AbortError');
  }
}

async function concurrentMap<T, R>(
  values: readonly T[],
  concurrency: number,
  signal: AbortSignal,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);

  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      throwIfCancelled(signal);

      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) return;
      results[index] = await mapper(values[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));

  return results;
}

function normalizeTreeFile(
  entry: GithubTreeEntry,
  root: string,
): { repositoryPath: string; relativePath: string; size: number; mode: '100644' | '100755' } | undefined {
  if (typeof entry.path !== 'string' || typeof entry.mode !== 'string') {
    return undefined;
  }

  const rootPrefix = `${root}/`;

  if (!entry.path.startsWith(rootPrefix)) {
    return undefined;
  }

  if (entry.mode === '120000' || entry.mode === '160000') {
    throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'Symlinks and git submodules are forbidden in skills.', 422);
  }

  if (entry.type !== 'blob') {
    return undefined;
  }

  const relativePath = entry.path.slice(rootPrefix.length);
  const parts = relativePath.split('/');

  if (
    !relativePath ||
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    parts.length > MAX_SKILL_DEPTH ||
    parts.some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f]/.test(part))
  ) {
    throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'The skill contains an unsafe file path.', 422);
  }

  if (entry.mode !== '100644' && entry.mode !== '100755') {
    throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'The skill contains a non-regular file.', 422);
  }

  if (typeof entry.size !== 'number' || !Number.isSafeInteger(entry.size) || entry.size < 0) {
    throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'The skill contains a file with invalid size metadata.', 422);
  }

  const size = entry.size;

  if (size > MAX_SKILL_FILE_BYTES) {
    throw new SkillSourceError('SKILL_SOURCE_TOO_LARGE', `Skill file '${relativePath}' exceeds the size limit.`, 413);
  }

  return { repositoryPath: entry.path, relativePath, size, mode: entry.mode };
}

export function computeGithubSkillBundleDigest(files: GithubSkillBundleFile[]): string {
  const digest = createHash('sha256');

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const bytes = Buffer.from(file.contentBase64, 'base64');
    digest.update(file.path, 'utf8');
    digest.update('\0');
    digest.update(String(file.mode), 'utf8');
    digest.update('\0');
    digest.update(String(bytes.byteLength), 'utf8');
    digest.update('\0');
    digest.update(bytes);
    digest.update('\0');
  }

  return digest.digest('hex');
}

/** Validate stored transport bytes before they are scanned or installed. */
export function validateGithubSkillBundleFiles(files: readonly GithubSkillBundleFile[]): void {
  const seen = new Set<string>();

  let totalBytes = 0;

  if (files.length === 0 || files.length > MAX_SKILL_FILES) {
    throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'The skill bundle has an invalid file count.', 422);
  }

  for (const file of files) {
    const parts = file.path.split('/');

    if (
      !file.path ||
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      parts.length > MAX_SKILL_DEPTH ||
      parts.some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f]/.test(part)) ||
      seen.has(file.path) ||
      (file.mode !== '100644' && file.mode !== '100755') ||
      !Number.isSafeInteger(file.byteLength) ||
      file.byteLength < 0 ||
      file.byteLength > MAX_SKILL_FILE_BYTES ||
      !CANONICAL_BASE64_RE.test(file.contentBase64)
    ) {
      throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'The skill bundle failed file integrity validation.', 422);
    }

    const bytes = Buffer.from(file.contentBase64, 'base64');

    if (bytes.byteLength !== file.byteLength || bytes.toString('base64') !== file.contentBase64) {
      throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'The skill bundle failed byte integrity validation.', 422);
    }

    totalBytes += bytes.byteLength;

    if (totalBytes > MAX_SKILL_BUNDLE_BYTES) {
      throw new SkillSourceError('SKILL_SOURCE_TOO_LARGE', 'The skill bundle exceeds the total size limit.', 413);
    }

    seen.add(file.path);
  }

  if (!seen.has('SKILL.md')) {
    throw new SkillSourceError('SKILL_SOURCE_NOT_FOUND', 'The selected folder has no exact SKILL.md file.', 404);
  }
}

/**
 * Download one exact Agent Skill folder from GitHub for quarantine/audit.
 *
 * The moving ref is resolved once, every subsequent request uses the immutable
 * commit SHA, and the returned digest covers path, mode, length, and bytes.
 */
export async function fetchGithubSkillBundle(
  input: GithubSkillSource,
  options: {
    fetchImpl?: typeof fetch;
    githubToken?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    downloadConcurrency?: number;
  } = {},
): Promise<GithubSkillBundle> {
  const source = normalizeGithubSkillSource(input);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = positiveBoundedInteger(options.timeoutMs, DEFAULT_BUNDLE_TIMEOUT_MS, 120_000);
  const downloadConcurrency = positiveBoundedInteger(
    options.downloadConcurrency,
    DEFAULT_DOWNLOAD_CONCURRENCY,
    MAX_DOWNLOAD_CONCURRENCY,
  );
  const deadlineSignal = AbortSignal.timeout(timeoutMs);
  const failFastController = new AbortController();
  const operationSignal = AbortSignal.any(
    [options.signal, deadlineSignal, failFastController.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    ),
  );

  try {
    throwIfCancelled(operationSignal);

    const commitSha = await resolveCommitSha(source, {
      fetchImpl,
      githubToken: options.githubToken,
      signal: operationSignal,
    });
    const [owner, repo] = source.ownerRepo.split('/');
    const treeUrl = checkedUrl(
      `https://${GITHUB_API_HOST}/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/git/trees/${commitSha}?recursive=1`,
      GITHUB_API_HOST,
    );
    const treeResponse = await githubFetch(treeUrl, {
      fetchImpl,
      githubToken: options.githubToken,
      signal: operationSignal,
    });
    const treePayload = await readGithubJson<GithubTreeResponse>(treeResponse, MAX_GITHUB_JSON_BYTES);

    if (treePayload.truncated === true) {
      throw new SkillSourceError('SKILL_SOURCE_TOO_LARGE', 'The repository tree is too large to audit safely.', 413);
    }

    if (!Array.isArray(treePayload.tree)) {
      throw new SkillSourceError('SKILL_SOURCE_UNREACHABLE', 'GitHub returned an invalid repository tree.', 502);
    }

    const selected = treePayload.tree
      .map((entry) => normalizeTreeFile(entry as GithubTreeEntry, source.skillPath))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (new Set(selected.map((entry) => entry.relativePath)).size !== selected.length) {
      throw new SkillSourceError('SKILL_SOURCE_UNSAFE', 'The skill tree contains duplicate file paths.', 422);
    }

    if (!selected.some((entry) => entry.relativePath === 'SKILL.md')) {
      throw new SkillSourceError('SKILL_SOURCE_NOT_FOUND', 'The selected folder has no exact SKILL.md file.', 404);
    }

    if (selected.length > MAX_SKILL_FILES) {
      throw new SkillSourceError('SKILL_SOURCE_TOO_LARGE', 'The skill contains too many files.', 413);
    }

    const declaredBytes = selected.reduce((sum, entry) => sum + entry.size, 0);

    if (declaredBytes > MAX_SKILL_BUNDLE_BYTES) {
      throw new SkillSourceError('SKILL_SOURCE_TOO_LARGE', 'The skill bundle exceeds the total size limit.', 413);
    }

    const sortedEntries = selected.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const files = await concurrentMap(sortedEntries, downloadConcurrency, operationSignal, async (entry) => {
      const rawUrl = checkedUrl(
        `https://${GITHUB_RAW_HOST}/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/${commitSha}/${encodePath(entry.repositoryPath)}`,
        GITHUB_RAW_HOST,
      );
      const response = await githubFetch(rawUrl, {
        fetchImpl,
        githubToken: options.githubToken,
        accept: 'application/octet-stream',
        signal: operationSignal,
      });
      const bytes = await readBoundedResponse(
        response,
        Math.min(MAX_SKILL_FILE_BYTES, entry.size + 1),
        `Skill file '${entry.relativePath}' exceeds the size limit.`,
      );

      throwIfCancelled(operationSignal);

      if (bytes.byteLength !== entry.size) {
        throw new SkillSourceError(
          'SKILL_SOURCE_UNSAFE',
          `Skill file '${entry.relativePath}' did not match its immutable tree metadata.`,
          422,
        );
      }

      return {
        path: entry.relativePath,
        contentBase64: Buffer.from(bytes).toString('base64'),
        byteLength: bytes.byteLength,
        mode: entry.mode,
      } satisfies GithubSkillBundleFile;
    });

    validateGithubSkillBundleFiles(files);

    return {
      ownerRepo: source.ownerRepo,
      skillPath: source.skillPath,
      commitSha,
      sourceUrl: `https://github.com/${source.ownerRepo}/tree/${commitSha}/${source.skillPath}`,
      digest: computeGithubSkillBundleDigest(files),
      files,
    };
  } catch (cause) {
    failFastController.abort();

    if (options.signal?.aborted) {
      throw new SkillSourceError('SKILL_SOURCE_ABORTED', 'The skill import was cancelled by the caller.', 499);
    }

    if (deadlineSignal.aborted) {
      throw new SkillSourceError('SKILL_SOURCE_TIMEOUT', 'The skill import exceeded its total time limit.', 504);
    }

    if (cause instanceof SkillSourceError) {
      throw cause;
    }

    if (abortLike(cause)) {
      throw new SkillSourceError('SKILL_SOURCE_UNREACHABLE', 'GitHub timed out during skill audit.', 502);
    }

    throw new SkillSourceError('SKILL_SOURCE_UNREACHABLE', 'GitHub could not be reached for skill audit.', 502);
  }
}
