import { execFile as execFileCallback } from 'node:child_process';
import { access, link, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join, normalize, relative } from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { appPublicEnglish } from './app-public-copy.js';

const execFile = promisify(execFileCallback);

function commandStdout(result: unknown) {
  if (typeof result === 'string') {
    return result;
  }

  if (Array.isArray(result)) {
    return String(result[0] ?? '');
  }

  return String((result as { stdout?: unknown })?.stdout ?? '');
}

async function pathExists(path: string) {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

/**
 * How a file's `content` string is encoded. Absent/`utf8` = plain text (the
 * legacy/default shape, so existing persisted data keeps working). `base64` =
 * the file is binary (image, font, wasm, …) and `content` is its base64 — this
 * is what stops binary assets being mangled when read/written as UTF-8 during
 * git import, archive/snapshot round-trips, and webcontainer restore.
 */
export type FileEncoding = 'utf8' | 'base64';

export interface ProjectFile {
  path: string;
  content: string;
  encoding?: FileEncoding;
  updatedAt: string;
}

/**
 * Decide whether a buffer is binary: a NUL byte in the head, or bytes that don't
 * round-trip cleanly through UTF-8 (lossy decode). Text files stay UTF-8; binary
 * files are base64-encoded so no byte is lost.
 */
export function detectBinaryBuffer(buf: Buffer): boolean {
  const sample = Math.min(buf.length, 8000);

  for (let i = 0; i < sample; i += 1) {
    if (buf[i] === 0) {
      return true;
    }
  }

  /*
   * Re-encoding a valid-UTF-8 buffer yields identical bytes; a mismatch means the
   * original wasn't valid UTF-8 (i.e. it's binary) and would be corrupted as text.
   */
  return !Buffer.from(buf.toString('utf8'), 'utf8').equals(buf);
}

/** Encode a raw file buffer into the {content, encoding} ProjectFile shape. */
export function encodeFileBuffer(buf: Buffer): { content: string; encoding: FileEncoding } {
  return detectBinaryBuffer(buf)
    ? { content: buf.toString('base64'), encoding: 'base64' }
    : { content: buf.toString('utf8'), encoding: 'utf8' };
}

/** Decode a ProjectFile's content string back to its raw bytes for writing. */
export function decodeFileContent(content: string, encoding?: FileEncoding): Buffer {
  return Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
}

export interface StoredArchive {
  storageKey: string;
  byteLength: number;
  base64?: string;
  createdAt: string;
}

export interface GitCommitNode {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  date: string;
  message: string;
  refs?: string;
}

export interface GitBlameLine {
  line: number;
  sha: string;
  author: string;
  date: string;
  content: string;
}

export interface GitProvider {
  importRepository(input: {
    repositoryUrl: string;
    branch?: string;
  }): Promise<{ files: ProjectFile[]; defaultBranch: string; remoteUrl: string }>;
  status(
    projectId: string,
    workspaceId?: string,

    /*
     * The caller's current files. Passing them lets the provider refresh the git
     * working tree first — without that, an edit saved in the IDE (which lands in
     * the pod and in `ide-state`, never in the working tree) was invisible and
     * `status` reported "0 changes" forever.
     */
    files?: ProjectFile[],
  ): Promise<{
    branch: string;

    /** True when HEAD is detached; `branch` then carries the short commit SHA. */
    detached?: boolean;
    changedFiles: string[];
    fileStatuses?: Array<{ path: string; status: string }>;
    conflicts?: Array<{ path: string; status: string }>;
    ahead: number;
    behind: number;
  }>;
  commit(input: {
    projectId: string;
    workspaceId?: string;
    message: string;
    files: ProjectFile[];
    selectedFiles?: string[];
    authorName?: string;
    authorEmail?: string;
  }): Promise<{ sha: string; message: string }>;
  push(input: {
    projectId: string;
    workspaceId?: string;
    branch: string;
  }): Promise<{ pushed: boolean; branch: string }>;
  pull(input: {
    projectId: string;
    workspaceId?: string;
    branch: string;
  }): Promise<{ pulled: boolean; branch: string; changedFiles: string[] }>;
  configureRemote?(input: {
    projectId: string;
    workspaceId?: string;
    remoteUrl: string;
  }): Promise<{ remote: string; remoteUrl: string }>;
  removeRemote?(input: { projectId: string; workspaceId?: string }): Promise<{ removed: boolean }>;
  listBranches(projectId: string, workspaceId?: string): Promise<string[]>;
  checkoutBranch(input: {
    projectId: string;
    workspaceId?: string;
    branch: string;
    create?: boolean;
    startPoint?: string;
  }): Promise<{ branch: string }>;
  stashPush(input: {
    projectId: string;
    workspaceId?: string;
    message?: string;
  }): Promise<{ stashed: boolean; output: string }>;
  stashList(projectId: string, workspaceId?: string): Promise<Array<{ id: string; branch?: string; message: string }>>;
  stashApply(input: {
    projectId: string;
    workspaceId?: string;
    stashRef: string;
    drop?: boolean;
  }): Promise<{ applied: boolean; output: string }>;
  cherryPick(input: {
    projectId: string;
    workspaceId?: string;
    sha: string;
  }): Promise<{ picked: boolean; output: string }>;
  resolveConflict(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    strategy: 'ours' | 'theirs';
  }): Promise<{ resolved: boolean; filePath: string; strategy: 'ours' | 'theirs' }>;
  discard(input: {
    projectId: string;
    workspaceId?: string;
    filePaths?: string[];
  }): Promise<{ discarded: boolean; filePaths: string[] }>;
  /*
   * Optional (so lightweight test mocks need not implement them). The real
   * project-storage provider always has them; routes guard for undefined.
   */
  commitDetail?(
    projectId: string,
    sha: string,
    workspaceId?: string,
  ): Promise<{ sha: string; files: Array<{ status: string; path: string }>; diff: string }>;
  restoreCommit?(projectId: string, sha: string, workspaceId?: string): Promise<{ restored: boolean; sha: string }>;
  conflictFile?(
    projectId: string,
    filePath: string,
    workspaceId?: string,
  ): Promise<{ filePath: string; content: string }>;
  markResolved?(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    content: string;
  }): Promise<{ resolved: boolean; filePath: string }>;
  logGraph(projectId: string, limit?: number, workspaceId?: string): Promise<GitCommitNode[]>;
  diff(projectId: string, filePath?: string, workspaceId?: string): Promise<string>;
  blame(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
  }): Promise<GitBlameLine[]>;
  createPullRequest(input: {
    projectId: string;
    workspaceId?: string;
    title: string;
    body?: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<{ url: string; number: number }>;
}

export interface ProjectStorage {
  writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string; encoding?: FileEncoding }>,
    workspaceId?: string,
    guard?: () => Promise<void>,
  ): Promise<ProjectFile[]>;
  listFiles(projectId: string, workspaceId?: string): Promise<ProjectFile[]>;
  exportZip(projectId: string): Promise<StoredArchive & { base64: string }>;
  importZip(projectId: string, base64: string, options?: { replaceExisting?: boolean }): Promise<ProjectFile[]>;
  createSnapshot(input: {
    projectId: string;
    label?: string;
    files: ProjectFile[];
    /** Server-chosen deterministic key for crash-safe, idempotent snapshots. */
    storageKey?: string;
    /** Revalidate durable remix ownership immediately before every file-system mutation. */
    guard?: () => Promise<void>;
  }): Promise<StoredArchive>;
  getSnapshotFiles(storageKey: string): Promise<ProjectFile[]>;
  restoreSnapshot(
    input: { projectId: string; workspaceId?: string; files: ProjectFile[] },
    guard?: () => Promise<void>,
  ): Promise<ProjectFile[]>;
  /**
   * Remove the complete physical tree of a partially-created project. This is
   * deliberately separate from `restoreSnapshot([])`, which preserves `.git`
   * and secondary workspaces and therefore cannot certify rollback cleanup.
   */
  deleteProjectFiles(projectId: string, guard?: () => Promise<void>): Promise<void>;
}

/** Executed while the cross-replica project lock is held, immediately before a tree mutation. */
export type ProjectMutationGuard = (projectId: string, workspaceId?: string) => Promise<void>;

export const SECONDARY_WORKSPACES_DIR = '.vibecore-workspaces';

const SAFE_WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function workspaceSubpath(workspaceId: string, filePath = '') {
  if (!SAFE_WORKSPACE_ID.test(workspaceId)) {
    throw new Error(appPublicEnglish('INVALID_WORKSPACE_ID'));
  }

  return filePath
    ? `${SECONDARY_WORKSPACES_DIR}/${workspaceId}/${filePath}`
    : `${SECONDARY_WORKSPACES_DIR}/${workspaceId}`;
}

function safeWorkspacePath(projectId: string, workspaceId?: string, filePath = '') {
  if (!workspaceId) {
    return safeProjectPath(projectId, filePath);
  }

  return safeProjectPath(projectId, workspaceSubpath(workspaceId, filePath));
}

function now() {
  return new Date().toISOString();
}

function archiveKey(prefix: string, projectId: string) {
  return `${prefix}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.zip`;
}

function storageRoot() {
  return (
    process.env.PROJECT_STORAGE_DIR ??
    (process.env.NODE_ENV === 'production'
      ? '/tmp/vibecore-project-storage'
      : join(process.cwd(), '.vibecore-project-storage'))
  );
}

function safeProjectPath(projectId: string, filePath = '') {
  const root = join(storageRoot(), projectId);
  const target = normalize(join(root, filePath));

  if (relative(root, target).startsWith('..')) {
    throw new Error(appPublicEnglish('INVALID_PROJECT_PATH'));
  }

  return target;
}

/*
 * Cross-replica advisory locking for project mutations.
 *
 * Two coordination layers compose here:
 *
 *  1. In-memory promise chain (`PROJECT_MUTATION_QUEUE`). Serializes all
 *     mutations for a given projectId inside a single Node process so the
 *     hot path never sleeps on filesystem syscalls.
 *  2. NFS-safe file lock (`acquireFileLock`). When multiple API replicas
 *     race for the same project, one wins the link(2) and the others
 *     spin-wait. Filestore BASIC mounts with `nolock` (no NLM daemon),
 *     so flock(2) is a no-op there — link(2) on a unique temp file is
 *     the canonical NFSv3-safe primitive (see Filestore docs § locking).
 *
 * Reads (status, log, listFiles, …) intentionally skip the lock: git
 * reads tolerate writer races (worst case is a stale view that the next
 * refresh corrects) and serializing them would tank perceived latency.
 */
const PROJECT_MUTATION_QUEUE = new Map<string, Promise<unknown>>();
const PROJECT_LOCK_OWNER = `${hostname()}-${process.pid}`;

/*
 * Must exceed the longest single locked operation, else a legitimately-running
 * git op gets its lock declared stale and stolen mid-flight (concurrent writers
 * on one working tree → index.lock collisions / corrupt refs). git network ops
 * run with a 120s execFile timeout, so keep this comfortably above that.
 */
const PROJECT_LOCK_STALE_MS = 180_000;
const PROJECT_LOCK_ACQUIRE_TIMEOUT_MS = 60_000;
const PROJECT_LOCK_RETRY_BASE_MS = 25;
const PROJECT_LOCK_RETRY_MAX_MS = 500;

function locksRoot() {
  return join(storageRoot(), '_locks');
}

const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

async function acquireFileLock(projectId: string): Promise<() => Promise<void>> {
  if (!SAFE_PROJECT_ID.test(projectId)) {
    throw new Error(appPublicEnglish('INVALID_PROJECT_PATH'));
  }

  const root = locksRoot();
  await mkdir(root, { recursive: true });

  const lockPath = join(root, `${projectId}.lock`);

  /*
   * Unique per-acquire fencing token, stored as the lock file's content (the
   * sentinel is hardlinked to lockPath). Lets release verify the lock is still
   * OURS before deleting it, and tags any stale-steal we perform.
   */
  const lockToken = `${PROJECT_LOCK_OWNER}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const sentinelPath = join(root, `${projectId}.${lockToken}.tmp`);

  await writeFile(sentinelPath, `${lockToken}\n${new Date().toISOString()}\n`, 'utf8');

  const startedAt = Date.now();

  while (true) {
    try {
      await link(sentinelPath, lockPath);
      await unlink(sentinelPath).catch(() => undefined);

      return async () => {
        /*
         * Only release the lock if it is still OURS. The previous unconditional
         * unlink could delete a DIFFERENT replica's live lock if ours had been
         * stale-reclaimed in the meantime. Compare the fencing token in the lock
         * file's content; a missing file (already gone) is a no-op.
         */
        const current = await readFile(lockPath, 'utf8').catch(() => '');

        if (current.startsWith(lockToken)) {
          await unlink(lockPath).catch(() => undefined);
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code !== 'EEXIST') {
        await unlink(sentinelPath).catch(() => undefined);
        throw error;
      }

      const stats = await stat(lockPath).catch(() => undefined);

      if (stats && Date.now() - stats.mtimeMs > PROJECT_LOCK_STALE_MS) {
        /*
         * Atomic stale-steal: rename (not unlink) the stale lock to a unique
         * path so only ONE concurrent reclaimer wins. Losing reclaimers' rename
         * fails (source already gone) and they fall through to retry/wait — so
         * two replicas can't both delete the lock and both proceed.
         */
        const stolenPath = `${lockPath}.stale.${lockToken}`;

        const reclaimed = await rename(lockPath, stolenPath)
          .then(() => true)
          .catch(() => false);

        if (reclaimed) {
          await unlink(stolenPath).catch(() => undefined);
        }

        continue;
      }

      if (Date.now() - startedAt > PROJECT_LOCK_ACQUIRE_TIMEOUT_MS) {
        await unlink(sentinelPath).catch(() => undefined);
        throw Object.assign(new Error(appPublicEnglish('PROJECT_LOCK_TIMEOUT', { projectId })), {
          code: 'PROJECT_LOCK_TIMEOUT',
          statusCode: 503,
        });
      }

      const delay = Math.min(
        PROJECT_LOCK_RETRY_MAX_MS,
        PROJECT_LOCK_RETRY_BASE_MS + Math.floor(Math.random() * PROJECT_LOCK_RETRY_MAX_MS),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  /*
   * Disable cross-replica file locking in unit tests, which run many parallel
   * workers against tmp dirs. The in-memory queue still serializes per-process.
   */
  const enableFileLock = process.env.VIBECORE_PROJECT_LOCK !== 'disabled' && process.env.NODE_ENV !== 'test';

  const previous = PROJECT_MUTATION_QUEUE.get(projectId) ?? Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const release = enableFileLock ? await acquireFileLock(projectId) : async () => undefined;

      try {
        return await fn();
      } finally {
        await release();
      }
    });

  PROJECT_MUTATION_QUEUE.set(projectId, next);

  try {
    return (await next) as T;
  } finally {
    if (PROJECT_MUTATION_QUEUE.get(projectId) === next) {
      PROJECT_MUTATION_QUEUE.delete(projectId);
    }
  }
}

/*
 * A stale NFS/overlay file handle (ESTALE) is TRANSIENT: it appears when the
 * backing mount is re-pointed (a pod moving during a redeploy) while an fd is
 * open, and it clears as soon as the path is re-resolved. Measured in prod
 * 2026-08-03: bursts of `listProjectFilesIncludingIdeState` 500s during
 * rollouts, all `errno -116` (ESTALE) on read. Node does not always map -116 to
 * the string code 'ESTALE' (the raw entry showed code "Unknown system error
 * -116"), so we match BOTH the mapped code and the raw errno.
 *
 * Retry is scoped to ESTALE only — ENOENT (a concurrent delete) must still fall
 * through to the existing TOCTOU skip, never be retried.
 */
export function isStaleHandle(error: unknown): boolean {
  const e = error as NodeJS.ErrnoException | undefined;

  return e?.code === 'ESTALE' || e?.errno === -116;
}

export async function withStaleRetry<T>(op: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      if (!isStaleHandle(error) || attempt >= attempts) {
        throw error;
      }

      // Short backoff (20ms, 40ms): a stale handle resolves on re-open, so a
      // couple of quick retries lisse the redeploy blip without slowing reads.
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
}

async function walkFiles(root: string, current = ''): Promise<ProjectFile[]> {
  const dir = join(root, current);

  const entries = await withStaleRetry(() => readdir(dir, { withFileTypes: true })).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return [];
      }

      throw error;
    },
  );

  const files: ProjectFile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === '.git') {
      continue;
    }

    if (entry.isDirectory() && current === '' && entry.name === SECONDARY_WORKSPACES_DIR) {
      continue;
    }

    const child = join(current, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, child)));
      continue;
    }

    if (entry.isFile()) {
      const fullPath = join(root, child);

      /*
       * TOCTOU: a concurrent write/save can delete or rename a file between the
       * readdir above and the stat/readFile here (e.g. the IDE rewriting
       * index.html while the dashboard lists files). A per-file ENOENT must skip
       * that entry, not throw — otherwise one racing delete 500s the entire
       * project listing (observed in prod as `ENOENT ... index.html` on
       * /projects/:projectId/dashboard).
       */
      try {
        const metadata = await withStaleRetry(() => stat(fullPath));

        /*
         * Read raw bytes and detect binary, so non-text assets (images, fonts, wasm)
         * survive instead of being lossily decoded as UTF-8 (git-import corruption).
         */
        const { content, encoding } = encodeFileBuffer(await withStaleRetry(() => readFile(fullPath)));
        files.push({ path: child, content, encoding, updatedAt: metadata.mtime.toISOString() });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }

        throw error;
      }
    }
  }

  return files;
}

export async function archiveFiles(files: Array<{ path: string; content: string; encoding?: FileEncoding }>) {
  const zip = new JSZip();

  for (const file of files) {
    /*
     * Pack the real bytes (base64-decoded for binary) so the zip preserves the
     * file exactly rather than storing a UTF-8-mangled string.
     */
    zip.file(file.path, decodeFileContent(file.content, file.encoding));
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

/*
 * Bound decompression so a small, highly-compressed archive (a "zip bomb")
 * cannot expand to gigabytes and exhaust the API pod's memory/disk on import or
 * snapshot restore. A normal project is well under these limits.
 */
const MAX_ZIP_ENTRIES = 5_000;
const MAX_ZIP_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MAX_ZIP_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB decompressed total

function zipLimitError(code: string, message: string) {
  return Object.assign(new Error(message), { statusCode: 413, code });
}

export async function filesFromZipBase64(
  base64: string,
): Promise<Array<{ path: string; content: string; encoding: FileEncoding }>> {
  return filesFromZip(await JSZip.loadAsync(Buffer.from(base64, 'base64')));
}

export async function filesFromZip(
  zip: JSZip,
): Promise<Array<{ path: string; content: string; encoding: FileEncoding }>> {
  const entries = Object.entries(zip.files).filter(([, entry]) => !entry.dir);

  if (entries.length > MAX_ZIP_ENTRIES) {
    throw zipLimitError('ZIP_TOO_MANY_ENTRIES', `Archive contains too many files (limit ${MAX_ZIP_ENTRIES})`);
  }

  const files: Array<{ path: string; content: string; encoding: FileEncoding }> = [];

  let totalBytes = 0;

  for (const [path, entry] of entries) {
    /*
     * Reject an entry whose declared uncompressed size already exceeds the cap
     * BEFORE decompressing it, so a malicious header can't force a huge inflate.
     */
    const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;

    if (typeof declaredSize === 'number' && declaredSize > MAX_ZIP_FILE_BYTES) {
      throw zipLimitError('ZIP_FILE_TOO_LARGE', `Archive entry ${path} exceeds the per-file size limit`);
    }

    /*
     * Read raw bytes and classify, so a binary entry is preserved as base64
     * rather than corrupted by a UTF-8 string decode.
     */
    const bytes = Buffer.from(await entry.async('uint8array'));
    const byteLength = bytes.length;

    if (byteLength > MAX_ZIP_FILE_BYTES) {
      throw zipLimitError('ZIP_FILE_TOO_LARGE', `Archive entry ${path} exceeds the per-file size limit`);
    }

    totalBytes += byteLength;

    if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
      throw zipLimitError('ZIP_TOTAL_TOO_LARGE', 'Archive exceeds the total decompressed size limit');
    }

    files.push({ path, ...encodeFileBuffer(bytes) });
  }

  return files;
}

export class LocalProjectStorage implements ProjectStorage {
  constructor(
    private readonly mutationGuard?: ProjectMutationGuard,
    /** `_objects` writes bypass checkpoint barriers but never account-purge fencing. */
    private readonly objectMutationGuard?: ProjectMutationGuard,
  ) {}

  private withTreeMutation<T>(
    projectId: string,
    workspaceId: string | undefined,
    mutate: () => Promise<T>,
  ): Promise<T> {
    return withProjectLock(projectId, async () => {
      await this.mutationGuard?.(projectId, workspaceId);
      return mutate();
    });
  }

  async writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string; encoding?: FileEncoding }>,
    workspaceId?: string,
    guard?: () => Promise<void>,
  ) {
    return this.withTreeMutation(projectId, workspaceId, async () => {
      for (const file of files) {
        const target = safeWorkspacePath(projectId, workspaceId, file.path);
        await guard?.();
        await mkdir(dirname(target), { recursive: true });
        await guard?.();
        await writeFile(target, decodeFileContent(file.content, file.encoding));
      }

      return walkFiles(safeWorkspacePath(projectId, workspaceId));
    });
  }

  async listFiles(projectId: string, workspaceId?: string) {
    return walkFiles(safeWorkspacePath(projectId, workspaceId));
  }

  async exportZip(projectId: string) {
    return withProjectLock(projectId, async () => {
      await this.objectMutationGuard?.(projectId);
      const content = await archiveFiles(await walkFiles(safeProjectPath(projectId)));
      const storageKey = archiveKey('exports', projectId);
      const target = safeProjectPath('_objects', storageKey);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);

      return { storageKey, byteLength: content.byteLength, base64: content.toString('base64'), createdAt: now() };
    });
  }

  async importZip(projectId: string, base64: string, options: { replaceExisting?: boolean } = {}) {
    return this.withTreeMutation(projectId, undefined, async () => {
      const files = await filesFromZipBase64(base64);

      if (options.replaceExisting) {
        /*
         * Clear the primary tree but preserve `.vibecore-workspaces/`, exactly
         * like restoreSnapshot. A blanket rm of the project dir destroys every
         * secondary workspace's `.git` and working tree — and this path runs on
         * every autosave (pushFilesToProjectStorage uses replaceExisting), so
         * the unguarded rm silently wiped secondary workspaces on normal editing.
         */
        await clearTreePreservingSecondaryWorkspaces(safeProjectPath(projectId));
      }

      for (const file of files) {
        const target = safeProjectPath(projectId, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, decodeFileContent(file.content, file.encoding));
      }

      return walkFiles(safeProjectPath(projectId));
    });
  }

  async createSnapshot(input: {
    projectId: string;
    label?: string;
    files: ProjectFile[];
    storageKey?: string;
    guard?: () => Promise<void>;
  }) {
    return withProjectLock(input.projectId, async () => {
      await this.objectMutationGuard?.(input.projectId);
      const content = await archiveFiles(input.files);
      const storageKey = input.storageKey ?? archiveKey('snapshots', input.projectId);
      const target = safeProjectPath('_objects', storageKey);
      await input.guard?.();
      await mkdir(dirname(target), { recursive: true });
      await input.guard?.();
      await writeFile(target, content);

      return { storageKey, byteLength: content.byteLength, base64: content.toString('base64'), createdAt: now() };
    });
  }

  async getSnapshotFiles(storageKey: string) {
    const files = await filesFromZipBase64(
      (await readFile(safeProjectPath('_objects', storageKey))).toString('base64'),
    );

    const updatedAt = now();

    return files.map((file) => ({ ...file, updatedAt }));
  }

  async restoreSnapshot(
    input: { projectId: string; workspaceId?: string; files: ProjectFile[] },
    guard?: () => Promise<void>,
  ) {
    return this.withTreeMutation(input.projectId, input.workspaceId, async () => {
      const target = safeWorkspacePath(input.projectId, input.workspaceId);

      /*
       * Clear the working tree but PRESERVE `.git` (and, for the primary tree,
       * the nested secondary-workspaces dir). The secondary-workspace branch
       * previously rm'd the whole dir including its `.git`, so a routine
       * snapshot/manifest restore wiped that workspace's commit history, branches
       * and stashes — clearTreePreservingSecondaryWorkspaces skips .git, fixing it.
       */
      await guard?.();
      await clearTreePreservingSecondaryWorkspaces(target);

      for (const file of input.files) {
        await guard?.();
        const writeTarget = safeWorkspacePath(input.projectId, input.workspaceId, file.path);
        await mkdir(dirname(writeTarget), { recursive: true });
        await writeFile(writeTarget, decodeFileContent(file.content, file.encoding));
      }

      return walkFiles(safeWorkspacePath(input.projectId, input.workspaceId));
    });
  }

  async deleteProjectFiles(projectId: string, guard?: () => Promise<void>): Promise<void> {
    await this.withTreeMutation(projectId, undefined, async () => {
      await guard?.();
      await resilientRm(safeProjectPath(projectId));
    });
  }
}

/**
 * `rm -rf` that survives a concurrent-writer race. When another process — e.g. a
 * deploy build populating `.vibecore-deploy-home/.npm-cache/_cacache/tmp` — writes
 * INTO a directory being deleted, `fs.rm` can throw ENOTEMPTY in the window between
 * its internal readdir and rmdir, even with `force: true` (force only suppresses
 * ENOENT). That intermittently 500'd `POST /files/import/zip` (whose
 * replaceExisting clears the tree on every autosave).
 *
 * We ask fs.rm to retry — it backs off and retries on ENOTEMPTY / EBUSY / EPERM /
 * EMFILE / ENFILE — and if it still can't finish we swallow ENOTEMPTY / ENOENT /
 * EBUSY so a transient cache write never crashes the import. Any leftover transient
 * cache dir is harmless (and re-cleared next time). Idempotent: a missing path is a
 * no-op (force), and a second call after a partial delete is safe.
 */
export async function resilientRm(target: string) {
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === 'ENOTEMPTY' || code === 'ENOENT' || code === 'EBUSY') {
      return;
    }

    throw error;
  }
}

async function clearTreePreservingSecondaryWorkspaces(target: string) {
  const entries = await readdir(target, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  for (const entry of entries) {
    /*
     * Preserve the secondary-workspaces dir AND the primary tree's `.git`. A
     * snapshot restore / importZip(replaceExisting) clears the working tree, but
     * wiping .git destroys the project's commit history, branches, stashes and
     * configured origin remote — unrecoverable. Snapshots only capture working
     * files, never git metadata, so .git must survive the clear.
     */
    if (entry.isDirectory() && (entry.name === SECONDARY_WORKSPACES_DIR || entry.name === '.git')) {
      continue;
    }

    // Resilient rm: a concurrent cache write (deploy build home) must not 500 the
    // zip import with ENOTEMPTY. See resilientRm.
    await resilientRm(join(target, entry.name));
  }
}

export class GitCliProvider implements GitProvider {
  constructor(private readonly mutationGuard?: ProjectMutationGuard) {}

  private withMutationLock<T>(
    projectId: string,
    workspaceId: string | undefined,
    mutate: () => Promise<T>,
  ): Promise<T> {
    return withProjectLock(projectId, async () => {
      await this.mutationGuard?.(projectId, workspaceId);
      return mutate();
    });
  }

  private workspacePath(projectId: string, workspaceId?: string) {
    if (!workspaceId) {
      return safeProjectPath(projectId);
    }

    if (!SAFE_WORKSPACE_ID.test(workspaceId)) {
      throw new Error(appPublicEnglish('INVALID_WORKSPACE_ID'));
    }

    return safeProjectPath(projectId, `${SECONDARY_WORKSPACES_DIR}/${workspaceId}`);
  }

  private gitDir(projectId: string, workspaceId?: string) {
    return join(this.workspacePath(projectId, workspaceId), '.git');
  }

  private gitEnv() {
    return {
      ...process.env,
      GIT_CEILING_DIRECTORIES: storageRoot(),

      /*
       * Never let git block on an interactive credential/passphrase prompt — a
       * private remote (or a bad credential) would otherwise hang the child
       * process indefinitely, pinning the worker and holding the project lock.
       */
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
      GCM_INTERACTIVE: 'never',
    };
  }

  private async excludeSecondaryWorkspaceDir(projectId: string) {
    const excludePath = join(safeProjectPath(projectId), '.git', 'info', 'exclude');
    const marker = `/${SECONDARY_WORKSPACES_DIR}/`;

    try {
      const existing = await readFile(excludePath, 'utf8').catch(() => '');

      if (existing.split('\n').some((line) => line.trim() === marker)) {
        return;
      }

      await mkdir(dirname(excludePath), { recursive: true });
      await writeFile(excludePath, `${existing.replace(/\n*$/, '')}\n${marker}\n`, 'utf8');
    } catch {
      // Best-effort: failure to update the exclude file should not block git operations.
    }
  }

  private async ensureRepository(projectId: string, workspaceId?: string) {
    const target = this.workspacePath(projectId, workspaceId);
    const gitDir = this.gitDir(projectId, workspaceId);

    await mkdir(target, { recursive: true });

    /*
     * Validate the repo is REAL, not merely that a `.git` path exists. A stale,
     * empty, or partially-written `.git` (an interrupted init/clone, a zip import
     * that carried a broken `.git`, or a snapshot-restore/storage-sync artifact)
     * passes a bare pathExists check, so ensureRepository used to SKIP `git init`
     * — then every subsequent command failed with "fatal: not a git repository",
     * surfacing in the IDE Git tab as PANEL_BACKEND_UNAVAILABLE (status + branches
     * both 500). `git rev-parse --git-dir` is the cheap, authoritative "is this a
     * real repo?" probe; on failure we fall through and (re)init, which safely
     * reinitialises an existing partial `.git`.
     */
    const isValidRepo = await execFile('git', ['--git-dir', gitDir, '--work-tree', target, 'rev-parse', '--git-dir'], {
      cwd: target,
      env: this.gitEnv(),
    })
      .then(() => true)
      .catch(() => false);

    if (isValidRepo) {
      await execFile('git', ['--git-dir', gitDir, '--work-tree', target, 'config', 'user.name', 'You'], {
        cwd: target,
        env: this.gitEnv(),
      }).catch(() => undefined);
      await execFile(
        'git',
        ['--git-dir', gitDir, '--work-tree', target, 'config', 'user.email', 'you@vibecore.local'],
        {
          cwd: target,
          env: this.gitEnv(),
        },
      ).catch(() => undefined);

      if (!workspaceId) {
        await this.excludeSecondaryWorkspaceDir(projectId);
      }

      return;
    }

    await execFile('git', ['init', '--initial-branch=main'], { cwd: target, env: this.gitEnv() }).catch(async () => {
      await execFile('git', ['init'], { cwd: target, env: this.gitEnv() });
      await execFile('git', ['checkout', '-B', 'main'], { cwd: target, env: this.gitEnv() });
    });
    await execFile('git', ['config', 'user.name', 'You'], { cwd: target, env: this.gitEnv() });
    await execFile('git', ['config', 'user.email', 'you@vibecore.local'], { cwd: target, env: this.gitEnv() });

    if (!workspaceId) {
      await this.excludeSecondaryWorkspaceDir(projectId);
    }
  }

  /**
   * Bring the git working tree up to date with the caller's view of the files.
   *
   * The IDE saves an edit to the workspace pod and to `ide-state`; neither of
   * those is the git working tree. Nothing else wrote it either — only an agent
   * artifact close did — so a hand-edited file was invisible to git: `status`
   * reported "0 changes" forever and the commit buttons stayed disabled. That
   * is why `commit()` is handed `listProjectFilesIncludingIdeState(...)`, a
   * parameter it then ignored.
   *
   * Only changed content is written, so polling `status` does not churn the
   * tree (and does not make every file look freshly modified to git).
   *
   * NOTE: never call `writeFiles()` from here — it takes the same project lock
   * that `commit()` already holds, which would deadlock.
   */
  private async materializeWorkingTree(projectId: string, files: ProjectFile[] | undefined, workspaceId?: string) {
    if (!files?.length) {
      return;
    }

    for (const file of files) {
      const target = safeWorkspacePath(projectId, workspaceId, file.path);
      const next = decodeFileContent(file.content, file.encoding);
      const current = await readFile(target).catch(() => undefined);

      if (current && current.equals(next)) {
        continue;
      }

      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, next);
    }
  }

  /**
   * Even nominally read-only Git commands call ensureRepository(), which may
   * create/configure `.git`. Keep the safe default fenced and locked; mutation
   * methods already holding the lock call gitLocked() directly.
   */
  private git(projectId: string, args: string[], workspaceId?: string, raw = false): Promise<string> {
    return this.withMutationLock(projectId, workspaceId, () => this.gitLocked(projectId, args, workspaceId, raw));
  }

  private async gitLocked(projectId: string, args: string[], workspaceId?: string, raw = false) {
    await this.ensureRepository(projectId, workspaceId);

    const result = await execFile(
      'git',
      [
        '--git-dir',
        this.gitDir(projectId, workspaceId),
        '--work-tree',
        this.workspacePath(projectId, workspaceId),
        ...args,
      ],
      {
        cwd: this.workspacePath(projectId, workspaceId),
        env: this.gitEnv(),

        /*
         * 64MB output cap (vs execFile's 1MB default) so a large diff/log/blame
         * on a big repo/file doesn't throw ERR_CHILD_PROCESS_STDIO_MAXBUFFER and
         * 500; a hard timeout so a network op (push/pull/fetch) that stalls can't
         * pin the worker and hold the project lock indefinitely.
         */
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120_000,
      },
    );

    /*
     * `trim()` is right for the single-value commands (rev-parse, symbolic-ref,
     * …) but WRONG for porcelain: `git status --porcelain=v1` marks an unstaged
     * change with a LEADING SPACE (" M path"), and trimming the whole output ate
     * it on the first line — so `statusPath`'s `slice(3)` cut one character too
     * many and the first changed file came back as "pp.tsx" instead of
     * "App.tsx". A corrupt path then broke every per-file git action on it.
     * Callers that parse column-aligned output ask for the raw text.
     */
    return raw ? commandStdout(result) : commandStdout(result).trim();
  }

  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    const projectId = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    return withProjectLock(projectId, async () => {
      const target = safeProjectPath(projectId);
      await mkdir(dirname(target), { recursive: true });

      try {
        await execFile(
          'git',
          ['clone', '--depth=1', ...(input.branch ? ['--branch', input.branch] : []), input.repositoryUrl, target],

          /*
           * Network clone: hard timeout + raised maxBuffer so a stalled or chatty
           * remote can't hang the worker or overflow the 1MB default output buffer.
           */
          { env: this.gitEnv(), timeout: 120_000, maxBuffer: 64 * 1024 * 1024 },
        );

        const files = await walkFiles(target);

        const defaultBranch =
          input.branch ??
          commandStdout(
            await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: target, env: this.gitEnv() }),
          ).trim();

        return { files, defaultBranch, remoteUrl: input.repositoryUrl };
      } finally {
        /*
         * The throwaway clone (including its full .git history) has been read into
         * `files`; the caller copies those into the real project dir, so remove the
         * temp dir here. Without this, every GitHub import permanently leaked a repo
         * copy on the shared API pod's disk until /tmp filled and writes failed for
         * all tenants (cross-tenant availability).
         */
        await rm(target, { recursive: true, force: true }).catch(() => {});
      }
    });
  }

  async status(projectId: string, workspaceId?: string, files?: ProjectFile[]) {
    return this.withMutationLock(projectId, workspaceId, () => this.statusLocked(projectId, workspaceId, files));
  }

  private async statusLocked(projectId: string, workspaceId?: string, files?: ProjectFile[]) {
    await this.materializeWorkingTree(projectId, files, workspaceId);

    /*
     * `symbolic-ref` fails both when HEAD is detached and when the repo is
     * broken. Distinguish the two so the IDE can render a real detached-HEAD
     * warning instead of silently claiming "main": when detached, report the
     * short commit SHA as `branch` plus `detached: true`.
     */
    let branch = 'main';
    let detached = false;

    try {
      branch = await this.gitLocked(projectId, ['symbolic-ref', '--short', 'HEAD'], workspaceId);
    } catch {
      const headSha = await this.gitLocked(projectId, ['rev-parse', '--short', 'HEAD'], workspaceId).catch(() => '');

      if (headSha) {
        branch = headSha;
        detached = true;
      }
    }
    const porcelain = await this.gitLocked(projectId, ['status', '--porcelain=v1', '-uall'], workspaceId, true);
    const statusLines = porcelain.split('\n').filter(Boolean);

    /*
     * Porcelain v1 emits rename/copy entries as "R  old -> new"; slicing at col 3
     * would yield the literal "old -> new" as a single corrupt path that breaks
     * any downstream per-file git op. Report the NEW path for those.
     */
    const statusPath = (line: string) => {
      const raw = line.slice(3);
      const arrow = raw.indexOf(' -> ');

      return arrow >= 0 ? raw.slice(arrow + 4) : raw;
    };

    const changedFiles = statusLines.map(statusPath);
    const fileStatuses = statusLines.map((line) => ({
      path: statusPath(line),
      status: line.slice(0, 2).trim() || 'M',
    }));

    const conflicts = statusLines
      .filter((line) => ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(line.slice(0, 2)))
      .map((line) => ({ path: statusPath(line), status: line.slice(0, 2) }));

    const aheadBehind = await this.gitLocked(
      projectId,
      ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
      workspaceId,
    ).catch(() => '0\t0');

    const [behind, ahead] = aheadBehind.split(/\s+/).map((value) => Number(value) || 0);

    return { branch, detached, changedFiles, fileStatuses, conflicts, ahead, behind };
  }

  async commit(input: {
    projectId: string;
    workspaceId?: string;
    message: string;
    files: ProjectFile[];
    selectedFiles?: string[];
    authorName?: string;
    authorEmail?: string;
  }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      await this.ensureRepository(input.projectId, input.workspaceId);

      /*
       * The whole point of the `files` parameter: put the caller's current files
       * in the working tree BEFORE staging. Without this, `git add` staged an
       * unchanged tree and every commit died with GIT_NOTHING_TO_COMMIT.
       */
      await this.materializeWorkingTree(input.projectId, input.files, input.workspaceId);

      const selectedFiles = input.selectedFiles?.map((filePath) => filePath.replace(/^\/+/, '')).filter(Boolean) ?? [];
      const addArgs = selectedFiles.length ? ['add', '--', ...selectedFiles] : ['add', '--all'];

      await this.gitLocked(input.projectId, addArgs, input.workspaceId);

      /*
       * Nothing staged → `git commit` exits non-zero with "nothing to commit",
       * which would surface as a raw 500. Detect it and raise a friendly,
       * typed error the UI can render as "No changes to commit".
       */
      const staged = await this.gitLocked(input.projectId, ['diff', '--cached', '--name-only'], input.workspaceId);

      if (!staged.trim()) {
        throw Object.assign(new Error(appPublicEnglish('GIT_NOTHING_TO_COMMIT')), {
          statusCode: 400,
          code: 'GIT_NOTHING_TO_COMMIT',
        });
      }

      /*
       * When the user staged a subset, commit with an explicit pathspec so only
       * those files land. A plain `git commit` commits the *entire* index, which
       * (the index being shared/persistent across calls) would sweep in any file
       * left staged by a prior operation — violating the "commit only these"
       * contract.
       */
      /*
       * Optional commit-author override (Replit-parity "commit as" selector).
       * `--author="Name <email>"` is one argv entry (no shell), so even a value
       * starting with "-" is part of the flag value, not a separate git option.
       */
      const authorArgs =
        input.authorName && input.authorEmail ? [`--author=${input.authorName} <${input.authorEmail}>`] : [];

      const commitArgs = selectedFiles.length
        ? ['commit', '-m', input.message, ...authorArgs, '--', ...selectedFiles]
        : ['commit', '-m', input.message, ...authorArgs];

      await this.gitLocked(input.projectId, commitArgs, input.workspaceId);

      const sha = await this.gitLocked(input.projectId, ['rev-parse', 'HEAD'], input.workspaceId);

      return { sha, message: input.message };
    });
  }

  async push(input: { projectId: string; workspaceId?: string; branch: string }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      await this.gitLocked(input.projectId, ['push', 'origin', input.branch], input.workspaceId);

      return { pushed: true, branch: input.branch };
    });
  }

  async pull(input: { projectId: string; workspaceId?: string; branch: string }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      try {
        await this.gitLocked(input.projectId, ['pull', 'origin', input.branch], input.workspaceId);
      } catch (error) {
        /*
         * A conflicting pull exits non-zero, which would otherwise surface as a
         * raw 500 with the repo left mid-merge and no conflict info. Detect the
         * unmerged paths and return a typed 409 so the UI can route the user into
         * conflict resolution instead of showing a generic failure.
         */
        const conflictsOut = await this.gitLocked(
          input.projectId,
          ['diff', '--name-only', '--diff-filter=U'],
          input.workspaceId,
        ).catch(() => '');
        const conflicts = conflictsOut
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        if (conflicts.length > 0) {
          throw Object.assign(new Error(appPublicEnglish('GIT_MERGE_CONFLICT')), {
            statusCode: 409,
            code: 'GIT_MERGE_CONFLICT',
            conflicts,
          });
        }

        throw error;
      }

      const status = await this.statusLocked(input.projectId, input.workspaceId);

      return { pulled: true, branch: input.branch, changedFiles: status.changedFiles };
    });
  }

  async configureRemote(input: { projectId: string; workspaceId?: string; remoteUrl: string }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      const remotes = await this.gitLocked(input.projectId, ['remote'], input.workspaceId).catch(() => '');

      const args = remotes.split('\n').includes('origin')
        ? ['remote', 'set-url', 'origin', input.remoteUrl]
        : ['remote', 'add', 'origin', input.remoteUrl];

      await this.gitLocked(input.projectId, args, input.workspaceId);

      return { remote: 'origin', remoteUrl: input.remoteUrl };
    });
  }

  async removeRemote(input: { projectId: string; workspaceId?: string }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      const remotes = await this.gitLocked(input.projectId, ['remote'], input.workspaceId).catch(() => '');

      if (remotes.split('\n').includes('origin')) {
        // Tolerate an already-absent origin (idempotent disconnect).
        await this.gitLocked(input.projectId, ['remote', 'remove', 'origin'], input.workspaceId).catch(() => undefined);
      }

      return { removed: true };
    });
  }

  async listBranches(projectId: string, workspaceId?: string) {
    const output = await this.git(projectId, ['branch', '--all', '--format=%(refname:short)'], workspaceId);

    return [
      ...new Set(
        output
          .split('\n')
          .map((branch) => branch.replace(/^remotes\/origin\//, ''))
          /*
           * Drop the symbolic `origin/HEAD` pointer (→ `HEAD` after stripping):
           * it isn't a real branch and checking it out detaches HEAD.
           */
          .filter((branch) => Boolean(branch) && branch !== 'HEAD' && !branch.endsWith('/HEAD')),
      ),
    ];
  }

  async checkoutBranch(input: {
    projectId: string;
    workspaceId?: string;
    branch: string;
    create?: boolean;
    startPoint?: string;
  }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      if (input.create) {
        await this.gitLocked(
          input.projectId,
          ['checkout', '-b', input.branch, input.startPoint ?? 'HEAD'],
          input.workspaceId,
        );
      } else {
        await this.gitLocked(input.projectId, ['checkout', input.branch], input.workspaceId);
      }

      return { branch: input.branch };
    });
  }

  async stashPush(input: { projectId: string; workspaceId?: string; message?: string }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      const args = ['stash', 'push', '--include-untracked'];

      if (input.message) {
        args.push('-m', input.message);
      }

      const output = await this.gitLocked(input.projectId, args, input.workspaceId);

      return { stashed: !/No local changes/i.test(output), output };
    });
  }

  async stashList(projectId: string, workspaceId?: string) {
    const output = await this.git(projectId, ['stash', 'list', '--format=%gd%x09%gs'], workspaceId);

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, message = ''] = line.split('\t');
        const branch = message.match(/WIP on ([^:]+):/)?.[1];

        return { id, branch, message };
      });
  }

  async stashApply(input: { projectId: string; workspaceId?: string; stashRef: string; drop?: boolean }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      const output = await this.gitLocked(
        input.projectId,
        ['stash', input.drop ? 'pop' : 'apply', input.stashRef],
        input.workspaceId,
      );

      return { applied: true, output };
    });
  }

  async cherryPick(input: { projectId: string; workspaceId?: string; sha: string }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      const output = await this.gitLocked(input.projectId, ['cherry-pick', input.sha], input.workspaceId);

      return { picked: true, output };
    });
  }

  async resolveConflict(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    strategy: 'ours' | 'theirs';
  }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      const filePath = input.filePath.replace(/^\/+/, '');

      await this.gitLocked(input.projectId, ['checkout', `--${input.strategy}`, '--', filePath], input.workspaceId);
      await this.gitLocked(input.projectId, ['add', '--', filePath], input.workspaceId);

      return { resolved: true, filePath, strategy: input.strategy };
    });
  }

  async commitDetail(projectId: string, sha: string, workspaceId?: string) {
    // Strip to a safe revision token (hex sha / short sha) — never interpolate raw.
    const rev = sha.replace(/[^a-zA-Z0-9]/g, '');

    if (!rev) {
      return { sha: '', files: [] as Array<{ status: string; path: string }>, diff: '' };
    }

    const namesOut = await this.git(
      projectId,
      ['diff-tree', '--no-commit-id', '--name-status', '-r', '-M', rev],
      workspaceId,
    ).catch(() => '');

    const files = namesOut
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split('\t');

        return { status: (status ?? 'M').trim(), path: rest.join('\t') };
      })
      .filter((entry) => entry.path);

    const diff = await this.git(projectId, ['show', '--format=', rev], workspaceId).catch(() => '');

    return { sha: rev, files, diff };
  }

  async restoreCommit(projectId: string, sha: string, workspaceId?: string) {
    const rev = sha.replace(/[^a-zA-Z0-9]/g, '');

    if (!rev) {
      throw Object.assign(new Error(appPublicEnglish('GIT_BAD_REVISION')), {
        statusCode: 400,
        code: 'GIT_BAD_REVISION',
      });
    }

    return this.withMutationLock(projectId, workspaceId, async () => {
      /*
       * Restore every tracked file to its state at <sha> (Replit's "Restore All").
       * `git checkout <sha> -- .` overwrites the working tree + index with that
       * commit's content WITHOUT moving HEAD, so the user can review and commit.
       */
      await this.gitLocked(projectId, ['checkout', rev, '--', '.'], workspaceId);

      return { restored: true, sha: rev };
    });
  }

  async conflictFile(projectId: string, filePath: string, workspaceId?: string) {
    const clean = filePath.replace(/^\/+/, '');
    const target = safeWorkspacePath(projectId, workspaceId, clean);
    // The working-tree file carries the <<<<<<< / ======= / >>>>>>> conflict
    // markers during an unresolved merge; surface it verbatim for the editor.
    const content = await readFile(target, 'utf8').catch(() => '');

    return { filePath: clean, content };
  }

  async markResolved(input: { projectId: string; workspaceId?: string; filePath: string; content: string }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      const clean = input.filePath.replace(/^\/+/, '');
      const target = safeWorkspacePath(input.projectId, input.workspaceId, clean);

      // Write the user's merged content (markers removed) then stage it so the
      // merge can be completed by a normal commit.
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, input.content, 'utf8');
      await this.gitLocked(input.projectId, ['add', '--', clean], input.workspaceId);

      return { resolved: true, filePath: clean };
    });
  }

  async discard(input: { projectId: string; workspaceId?: string; filePaths?: string[] }) {
    return this.withMutationLock(input.projectId, input.workspaceId, async () => {
      const paths = (input.filePaths ?? []).map((path) => path.replace(/^\/+/, '')).filter(Boolean);

      /*
       * Revert tracked working-tree changes to HEAD. `git checkout -- <pathspec>`
       * is broadly compatible; no pathspec discards every tracked change. Untracked
       * files are intentionally NOT removed here (deleting them would be a more
       * destructive operation than the user's "discard changes" intent implies).
       */
      /*
       * Key the discard-all fallback on whether filePaths was SUPPLIED, not on the
       * post-sanitization count: a caller that passes e.g. ['/'] (which sanitizes to
       * empty) means "these paths", not "everything". Treat a provided-but-empty list
       * as a no-op so a targeted discard can never revert the whole working tree.
       */
      if (input.filePaths !== undefined && paths.length === 0) {
        return { discarded: true, filePaths: [] };
      }

      const pathspec = paths.length ? paths : ['.'];
      await this.gitLocked(input.projectId, ['checkout', '--', ...pathspec], input.workspaceId);

      return { discarded: true, filePaths: paths };
    });
  }

  async logGraph(projectId: string, limit = 30, workspaceId?: string) {
    const output = await this.git(
      projectId,
      [
        'log',
        `--max-count=${Math.max(1, Math.min(limit, 100))}`,
        '--date=iso-strict',
        '--pretty=format:%H%x09%h%x09%P%x09%an%x09%ad%x09%D%x09%s',
      ],
      workspaceId,
    ).catch((error: any) => {
      const message = String(error?.stderr ?? error?.message ?? '');

      if (/does not have any commits yet|bad revision|unknown revision|ambiguous argument/i.test(message)) {
        return '';
      }

      throw error;
    });

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, parents = '', author = '', date = '', refs = '', message = ''] = line.split('\t');

        return {
          sha,
          shortSha,
          parents: parents ? parents.split(' ').filter(Boolean) : [],
          author,
          date,
          refs,
          message,
        };
      });
  }

  async diff(projectId: string, filePath?: string, workspaceId?: string) {
    return this.git(projectId, ['diff', '--', ...(filePath ? [filePath] : [])], workspaceId).catch((error: any) => {
      const message = String(error?.stderr ?? error?.message ?? '');

      if (/bad revision|unknown revision|ambiguous argument/i.test(message)) {
        return '';
      }

      throw error;
    });
  }

  async blame(input: {
    projectId: string;
    workspaceId?: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
  }) {
    const range =
      input.startLine && input.endLine
        ? [`-L`, `${Math.max(1, input.startLine)},${Math.max(input.startLine, input.endLine)}`]
        : [];
    const output = await this.git(
      input.projectId,
      ['blame', '--line-porcelain', ...range, '--', input.filePath.replace(/^\/+/, '')],
      input.workspaceId,
    );

    const lines: GitBlameLine[] = [];

    let current: Partial<GitBlameLine> = {};

    for (const line of output.split('\n')) {
      if (/^[0-9a-f]{40}\s/.test(line)) {
        const [sha, , finalLine] = line.split(' ');
        current = { sha, line: Number(finalLine) };
      } else if (line.startsWith('author ')) {
        current.author = line.slice('author '.length);
      } else if (line.startsWith('author-time ')) {
        current.date = new Date(Number(line.slice('author-time '.length)) * 1000).toISOString();
      } else if (line.startsWith('\t')) {
        lines.push({
          line: current.line ?? lines.length + 1,
          sha: current.sha ?? '',
          author: current.author ?? 'Unknown',
          date: current.date ?? '',
          content: line.slice(1),
        });
      }
    }

    return lines;
  }

  async createPullRequest(_input: {
    projectId: string;
    workspaceId?: string;
    title: string;
    body?: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<{ url: string; number: number }> {
    void _input;

    /*
     * We back projects with a local git checkout, not the GitHub API, so there
     * is no remote to open a PR against. Surface this as a 501 with actionable
     * guidance rather than a 500 — the operation isn't broken, it's simply not
     * supported by the local-git provider.
     */
    throw Object.assign(new Error(appPublicEnglish('GIT_PR_REQUIRES_GITHUB')), {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    });
  }
}
