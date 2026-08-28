import { execFile as execFileCallback } from 'node:child_process';
import { constants as fsConstants, type Dirent } from 'node:fs';
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { appPublicEnglish } from './app-public-copy.js';
import {
  objectStorageStaticArtifactSummary,
  type ObjectStorageStaticArtifactDisposition,
  type ObjectStorageStaticArtifactPlanEntry,
  type ObjectStorageStaticArtifactSummary,
  type ObjectStorageStaticErasurePlan,
} from './object-storage-operation.js';
import { withStaticDeploymentStorageLock } from './static-deployment-storage-lock.js';
import type { ProjectPhysicalMutationScope } from './store.js';

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
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,

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
    expectedOrganizationId: string;
    workspaceId?: string;
    message: string;
    files: ProjectFile[];
    selectedFiles?: string[];
    authorName?: string;
    authorEmail?: string;
  }): Promise<{ sha: string; message: string }>;
  push(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    branch: string;
  }): Promise<{ pushed: boolean; branch: string }>;
  pull(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    branch: string;
  }): Promise<{ pulled: boolean; branch: string; changedFiles: string[] }>;
  configureRemote?(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    remoteUrl: string;
  }): Promise<{ remote: string; remoteUrl: string }>;
  removeRemote?(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
  }): Promise<{ removed: boolean }>;
  listBranches(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>): Promise<string[]>;
  checkoutBranch(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    branch: string;
    create?: boolean;
    startPoint?: string;
  }): Promise<{ branch: string }>;
  stashPush(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    message?: string;
  }): Promise<{ stashed: boolean; output: string }>;
  stashList(
    projectId: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
  ): Promise<Array<{ id: string; branch?: string; message: string }>>;
  stashApply(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    stashRef: string;
    drop?: boolean;
  }): Promise<{ applied: boolean; output: string }>;
  cherryPick(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    sha: string;
  }): Promise<{ picked: boolean; output: string }>;
  resolveConflict(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    filePath: string;
    strategy: 'ours' | 'theirs';
  }): Promise<{ resolved: boolean; filePath: string; strategy: 'ours' | 'theirs' }>;
  discard(input: {
    projectId: string;
    expectedOrganizationId: string;
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
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
  ): Promise<{ sha: string; files: Array<{ status: string; path: string }>; diff: string }>;
  restoreCommit?(
    projectId: string,
    sha: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
  ): Promise<{ restored: boolean; sha: string }>;
  conflictFile?(
    projectId: string,
    filePath: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
  ): Promise<{ filePath: string; content: string }>;
  markResolved?(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    filePath: string;
    content: string;
  }): Promise<{ resolved: boolean; filePath: string }>;
  logGraph(
    projectId: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    limit?: number,
  ): Promise<GitCommitNode[]>;
  diff(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>, filePath?: string): Promise<string>;
  blame(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
  }): Promise<GitBlameLine[]>;
  createPullRequest(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    title: string;
    body?: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<{ url: string; number: number }>;
}

export interface ProjectPhysicalAbsenceProof {
  treeAbsent: boolean;
  exportsAbsent: boolean;
  snapshotsAbsent: boolean;
  staticSnapshotsAbsent?: boolean;
  staticAliasesAbsent?: boolean;
  staticArtifactSummary?: ObjectStorageStaticArtifactSummary;
}

export interface ProjectStorage {
  writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string; encoding?: FileEncoding }>,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    guard?: () => Promise<void>,
  ): Promise<ProjectFile[]>;
  listFiles(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>): Promise<ProjectFile[]>;
  /** Caller already owns the project's physical/NFS barrier. Never expose directly to a route. */
  listFilesWithinPhysicalAccess(projectId: string, workspaceId?: string): Promise<ProjectFile[]>;
  exportZip(
    projectId: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
  ): Promise<StoredArchive & { base64: string }>;
  importZip(
    projectId: string,
    base64: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    options?: { replaceExisting?: boolean },
  ): Promise<ProjectFile[]>;
  createSnapshot(input: {
    projectId: string;
    expectedOrganizationId: string;
    label?: string;
    files: ProjectFile[];
    /** Server-chosen deterministic key for crash-safe, idempotent snapshots. */
    storageKey?: string;
    /** Revalidate durable remix ownership immediately before every file-system mutation. */
    guard?: () => Promise<void>;
  }): Promise<StoredArchive>;
  getSnapshotFiles(
    projectId: string,
    storageKey: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
  ): Promise<ProjectFile[]>;
  /** Caller already owns the project's physical/NFS barrier. */
  getSnapshotFilesWithinPhysicalAccess(projectId: string, storageKey: string): Promise<ProjectFile[]>;
  restoreSnapshot(
    input: { projectId: string; expectedOrganizationId: string; workspaceId?: string; files: ProjectFile[] },
    guard?: () => Promise<void>,
  ): Promise<ProjectFile[]>;
  /**
   * Remove the complete physical tree of a partially-created project. This is
   * deliberately separate from `restoreSnapshot([])`, which preserves `.git`
   * and secondary workspaces and therefore cannot certify rollback cleanup.
   */
  deleteProjectFiles(
    projectId: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    guard?: () => Promise<void>,
  ): Promise<void>;
  /**
   * Permanent-delete primitive. The caller already owns the physical + NFS
   * barriers and has durably frozen the Project row; never expose to a route
   * without that store-owned fence.
   */
  eraseProjectDataWithinPhysicalAccess(projectId: string): Promise<void>;
  /** Validate the complete DB authority before marking any irreversible provider effect started. */
  prepareProjectStaticErasureWithinPhysicalAccess?(projectId: string): Promise<ObjectStorageStaticErasurePlan>;
  /** 0100 static-release implementation: erase aliases and only unshared content-addressed artifacts. */
  eraseProjectStaticDataWithinPhysicalAccess?(projectId: string): Promise<void>;
  /** Explicit capability bit: method presence alone is insufficient when no DB authority was injected. */
  supportsProjectStaticErasure?(): boolean;
  /** Live absence proof under the same already-owned physical + NFS barrier. */
  verifyProjectDataAbsentWithinPhysicalAccess?(projectId: string): Promise<ProjectPhysicalAbsenceProof>;
}

export interface ProjectStaticArtifactAuthority {
  /** Exact immutable ReleaseManifest reference owned by this project. */
  artifactRef: string;
  /** Must remain positive while the project's permanent-delete fence is held. */
  projectReferenceCount: number;
  /** Live ReleaseManifest rows for every other project. */
  otherReferenceCount: number;
}

export interface ProjectStaticErasureInventory {
  /** Binds an injected result to the requested tenant boundary. */
  projectId: string;
  /** Union of static Deployment ids and append-only ReleaseManifest deployment ids. */
  deploymentIds: readonly string[];
  /** One entry per unique content-addressed static artifact. */
  artifacts: readonly ProjectStaticArtifactAuthority[];
}

/**
 * Database authority for filesystem-only static erasure. The complete inventory
 * is resolved before any mutation. Artifact retention is then refreshed while
 * the corresponding digest lock is held, which closes manifest-append vs GC.
 */
export interface ProjectStaticErasureAuthority {
  resolveInventory(projectId: string): Promise<ProjectStaticErasureInventory>;
  resolveArtifact(projectId: string, artifactRef: string): Promise<ProjectStaticArtifactAuthority | undefined>;
}

/** Owns PostgreSQL + NFS serialization and revalidates tenant authority before mutation. */
export type ProjectMutationCoordinator = <T>(
  scope: ProjectPhysicalMutationScope,
  effect: () => Promise<T>,
) => Promise<T>;

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

const SAFE_STATIC_STORAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const STATIC_ARTIFACT_REF = /^static-artifacts\/sha256\/([a-f0-9]{64})$/u;
const STATIC_RECOVERY_MARKER = '.tmp-';

function staticErasureError(code: string, statusCode = 503): Error {
  return Object.assign(new Error(appPublicEnglish('GENERIC_REQUEST_FAILED')), { code, statusCode });
}

function assertSafeStaticStorageId(value: string, kind: 'project' | 'deployment'): void {
  if (!SAFE_STATIC_STORAGE_ID.test(value)) {
    throw staticErasureError(`PROJECT_STATIC_ERASURE_INVALID_${kind.toUpperCase()}_ID`, 400);
  }
}

function staticStorageRoot(): string {
  return resolve(process.env.STATIC_DEPLOY_STORAGE_DIR ?? join(process.cwd(), '.vibecore-static-deployments'));
}

function staticChildPath(root: string, ...segments: string[]): string {
  const target = resolve(root, ...segments);
  const rel = relative(root, target);

  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw staticErasureError('PROJECT_STATIC_ERASURE_PATH_OUTSIDE_ROOT');
  }

  return target;
}

async function staticPathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function readStaticNamespace(target: string): Promise<Dirent<string>[]> {
  let metadata;

  try {
    metadata = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw staticErasureError('PROJECT_STATIC_ERASURE_UNSAFE_NAMESPACE');
  }

  return readdir(target, { withFileTypes: true });
}

async function eraseStaticPath(target: string): Promise<void> {
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  if (await staticPathExists(target)) {
    throw staticErasureError('PROJECT_STATIC_ERASURE_INCOMPLETE');
  }
}

function staticRecoveryOwner(entryName: string, owners: ReadonlySet<string>): string | undefined {
  if (owners.has(entryName)) return entryName;
  const marker = entryName.indexOf(STATIC_RECOVERY_MARKER);
  if (marker < 1) return undefined;
  const owner = entryName.slice(0, marker);
  return owners.has(owner) ? owner : undefined;
}

function artifactDigest(artifactRef: string): string {
  const digest = STATIC_ARTIFACT_REF.exec(artifactRef)?.[1];
  if (!digest) throw staticErasureError('PROJECT_STATIC_ERASURE_ARTIFACT_REF_INVALID', 400);
  return digest;
}

function validateStaticArtifactAuthority(
  artifact: ProjectStaticArtifactAuthority,
  expectedArtifactRef?: string,
): ProjectStaticArtifactAuthority {
  const digest = artifactDigest(artifact.artifactRef);

  if (
    (expectedArtifactRef !== undefined && artifact.artifactRef !== expectedArtifactRef) ||
    !Number.isSafeInteger(artifact.projectReferenceCount) ||
    artifact.projectReferenceCount < 1 ||
    !Number.isSafeInteger(artifact.otherReferenceCount) ||
    artifact.otherReferenceCount < 0
  ) {
    throw staticErasureError('PROJECT_STATIC_ERASURE_AUTHORITY_INVALID');
  }

  return {
    artifactRef: `static-artifacts/sha256/${digest}`,
    projectReferenceCount: artifact.projectReferenceCount,
    otherReferenceCount: artifact.otherReferenceCount,
  };
}

function validateStaticErasureInventory(
  projectId: string,
  inventory: ProjectStaticErasureInventory,
): ProjectStaticErasureInventory {
  assertSafeStaticStorageId(projectId, 'project');

  if (
    inventory.projectId !== projectId ||
    !Array.isArray(inventory.deploymentIds) ||
    !Array.isArray(inventory.artifacts)
  ) {
    throw staticErasureError('PROJECT_STATIC_ERASURE_AUTHORITY_INVALID');
  }

  const deploymentIds = inventory.deploymentIds.map((deploymentId) => {
    assertSafeStaticStorageId(deploymentId, 'deployment');
    return deploymentId;
  });
  const artifacts = inventory.artifacts.map((artifact) => validateStaticArtifactAuthority(artifact));

  if (
    new Set(deploymentIds).size !== deploymentIds.length ||
    new Set(artifacts.map((artifact) => artifact.artifactRef)).size !== artifacts.length
  ) {
    throw staticErasureError('PROJECT_STATIC_ERASURE_AUTHORITY_INVALID');
  }

  return {
    projectId,
    deploymentIds: deploymentIds.sort((left, right) => left.localeCompare(right)),
    artifacts: artifacts.sort((left, right) => left.artifactRef.localeCompare(right.artifactRef)),
  };
}

async function ownedStaticEntries(
  root: string,
  owners: ReadonlySet<string>,
): Promise<Array<{ owner: string; name: string; target: string }>> {
  const entries = await readStaticNamespace(root);
  return entries
    .map((entry) => {
      const owner = staticRecoveryOwner(entry.name, owners);
      return owner ? { owner, name: entry.name, target: staticChildPath(root, entry.name) } : undefined;
    })
    .filter((entry): entry is { owner: string; name: string; target: string } => entry !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readAliasTargetNoFollow(target: string): Promise<string | undefined> {
  let metadata;

  try {
    metadata = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }

  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 512) return undefined;

  let handle;
  try {
    handle = await open(target, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ELOOP') return undefined;
    throw error;
  }

  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > 512) return undefined;
    const targetId = (await handle.readFile('utf8')).trim();
    return SAFE_STATIC_STORAGE_ID.test(targetId) ? targetId : undefined;
  } finally {
    await handle.close();
  }
}

type RelevantStaticAlias = { entryName: string; sourceDeploymentId: string; lockId: string; target: string };

async function staticAliasEntryIsRelevant(
  aliasRoot: string,
  entryName: string,
  deploymentIds: ReadonlySet<string>,
): Promise<boolean> {
  const ownedSource = staticRecoveryOwner(entryName, deploymentIds);
  if (ownedSource) return staticPathExists(staticChildPath(aliasRoot, entryName));
  if (!SAFE_STATIC_STORAGE_ID.test(entryName)) return false;
  const targetDeploymentId = await readAliasTargetNoFollow(staticChildPath(aliasRoot, entryName));
  return targetDeploymentId !== undefined && deploymentIds.has(targetDeploymentId);
}

async function relevantStaticAliases(root: string, deploymentIds: ReadonlySet<string>): Promise<RelevantStaticAlias[]> {
  const aliasRoot = staticChildPath(root, '.aliases');
  const entries = await readStaticNamespace(aliasRoot);
  const relevant: RelevantStaticAlias[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const ownedSource = staticRecoveryOwner(entry.name, deploymentIds);
    const sourceDeploymentId = ownedSource ?? entry.name;
    const target = staticChildPath(aliasRoot, entry.name);

    if (ownedSource) {
      relevant.push({ entryName: entry.name, sourceDeploymentId, lockId: ownedSource, target });
      continue;
    }

    if (!SAFE_STATIC_STORAGE_ID.test(entry.name)) continue;
    const targetDeploymentId = await readAliasTargetNoFollow(target);
    if (targetDeploymentId && deploymentIds.has(targetDeploymentId)) {
      relevant.push({ entryName: entry.name, sourceDeploymentId, lockId: entry.name, target });
    }
  }

  return relevant;
}

async function eraseRelevantStaticAliases(root: string, deploymentIds: ReadonlySet<string>): Promise<void> {
  for (let pass = 0; pass < 8; pass += 1) {
    const aliases = await relevantStaticAliases(root, deploymentIds);
    if (aliases.length === 0) return;
    const aliasRoot = staticChildPath(root, '.aliases');

    for (const alias of aliases) {
      await withStaticDeploymentStorageLock(alias.lockId, async () => {
        if (await staticAliasEntryIsRelevant(aliasRoot, alias.entryName, deploymentIds)) {
          await eraseStaticPath(alias.target);
        }
      });
    }
  }

  if ((await relevantStaticAliases(root, deploymentIds)).length > 0) {
    throw staticErasureError('PROJECT_STATIC_ALIAS_ERASURE_INCOMPLETE');
  }
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
 * Tenant-visible reads (status, log, listFiles, snapshot objects, …) share the
 * same lock through their access coordinator. This is stronger than ordinary
 * read consistency: transfer must not let an A-authorized request observe bytes
 * written later under B. `*WithinPhysicalAccess` helpers are the explicit,
 * non-reentrant boundary for callers that already own that lock.
 */
const PROJECT_MUTATION_QUEUE = new Map<string, Promise<unknown>>();
const PROJECT_LOCK_OWNER = `${hostname()}-${process.pid}`;

/*
 * Crash-recovery window, not an effect duration limit. A live owner renews the
 * inode mtime below; a dead pod stops heartbeating and becomes reclaimable.
 */
const PROJECT_LOCK_STALE_MS = 180_000;
const PROJECT_LOCK_ACQUIRE_TIMEOUT_MS = 60_000;
const PROJECT_LOCK_RETRY_BASE_MS = 25;
const PROJECT_LOCK_RETRY_MAX_MS = 500;

function locksRoot() {
  return join(storageRoot(), '_locks');
}

const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export interface ProjectFileLockOptions {
  staleMs?: number;
  acquireTimeoutMs?: number;
  heartbeatMs?: number;
  /** Deterministic test seam; production and ordinary callers use the env gate. */
  forceFileLock?: boolean;
  /** Test two logical replicas in one process without the local promise queue. */
  bypassProcessQueue?: boolean;
}

async function acquireFileLock(projectId: string, options: ProjectFileLockOptions = {}): Promise<() => Promise<void>> {
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
  const staleMs = Math.max(30, options.staleMs ?? PROJECT_LOCK_STALE_MS);
  const acquireTimeoutMs = Math.max(30, options.acquireTimeoutMs ?? PROJECT_LOCK_ACQUIRE_TIMEOUT_MS);
  const heartbeatMs = Math.max(10, Math.min(options.heartbeatMs ?? Math.floor(staleMs / 3), Math.floor(staleMs / 2)));

  while (true) {
    try {
      await link(sentinelPath, lockPath);
      const lockHandle = await open(lockPath, 'r+').catch(async (error) => {
        const current = await readFile(lockPath, 'utf8').catch(() => '');
        if (current.startsWith(lockToken)) await unlink(lockPath).catch(() => undefined);
        throw error;
      });
      await unlink(sentinelPath).catch(() => undefined);

      let heartbeatLost = false;
      let heartbeatInFlight = Promise.resolve();
      const heartbeat = setInterval(() => {
        heartbeatInFlight = heartbeatInFlight
          .then(async () => {
            const current = await readFile(lockPath, 'utf8').catch(() => '');

            if (!current.startsWith(lockToken)) {
              heartbeatLost = true;
              clearInterval(heartbeat);
              return;
            }

            const timestamp = new Date();
            await lockHandle.utimes(timestamp, timestamp);
          })
          .catch(() => {
            heartbeatLost = true;
            clearInterval(heartbeat);
          });
      }, heartbeatMs);
      heartbeat.unref?.();

      return async () => {
        clearInterval(heartbeat);
        await heartbeatInFlight;
        await lockHandle.close().catch(() => undefined);

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

        if (heartbeatLost) {
          throw Object.assign(new Error(appPublicEnglish('PROJECT_LOCK_TIMEOUT', { projectId })), {
            code: 'PROJECT_LOCK_LEASE_LOST',
            statusCode: 503,
          });
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code !== 'EEXIST') {
        await unlink(sentinelPath).catch(() => undefined);
        throw error;
      }

      const stats = await stat(lockPath).catch(() => undefined);

      if (stats && Date.now() - stats.mtimeMs > staleMs) {
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
          /*
           * A heartbeat can race the stale stat above. Because the owner keeps
           * an fd to the inode, its utimes also updates the atomically-renamed
           * path. Re-check before destroying it and restore the hardlink when
           * the lease refreshed during reclamation.
           */
          const afterRename = await stat(stolenPath).catch(() => undefined);
          const refreshed =
            Boolean(afterRename) &&
            (afterRename!.mtimeMs > stats.mtimeMs || Date.now() - afterRename!.mtimeMs <= staleMs);

          if (refreshed) {
            await link(stolenPath, lockPath).catch(() => undefined);
          }

          await unlink(stolenPath).catch(() => undefined);
        }

        continue;
      }

      if (Date.now() - startedAt > acquireTimeoutMs) {
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

export async function withProjectLock<T>(
  projectId: string,
  fn: () => Promise<T>,
  options: ProjectFileLockOptions = {},
): Promise<T> {
  /*
   * Disable cross-replica file locking in unit tests, which run many parallel
   * workers against tmp dirs. The in-memory queue still serializes per-process.
   */
  const enableFileLock =
    options.forceFileLock === true ||
    (process.env.VIBECORE_PROJECT_LOCK !== 'disabled' && process.env.NODE_ENV !== 'test');
  const execute = async () => {
    const release = enableFileLock ? await acquireFileLock(projectId, options) : async () => undefined;

    try {
      return await fn();
    } finally {
      await release();
    }
  };

  if (options.bypassProcessQueue) {
    return execute();
  }

  const previous = PROJECT_MUTATION_QUEUE.get(projectId) ?? Promise.resolve();

  const next = previous.catch(() => undefined).then(execute);

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
    private readonly mutationCoordinator?: ProjectMutationCoordinator,
    /** `_objects` writes bypass checkpoint barriers but never tenant/purge fencing. */
    private readonly objectMutationCoordinator?: ProjectMutationCoordinator,
    /** Reads share transfer's physical barrier and revalidate the captured tenant. */
    private readonly accessCoordinator?: ProjectMutationCoordinator,
    /** Exact DB inventory/retention authority; filesystem paths alone carry no project id. */
    private readonly staticErasureAuthority?: ProjectStaticErasureAuthority,
  ) {}

  supportsProjectStaticErasure(): boolean {
    return this.staticErasureAuthority !== undefined;
  }

  async prepareProjectStaticErasureWithinPhysicalAccess(projectId: string): Promise<ObjectStorageStaticErasurePlan> {
    const inventory = await this.resolveStaticErasureInventory(projectId);
    const root = staticStorageRoot();
    const deploymentIds = new Set(inventory.deploymentIds);
    const dispositions: ObjectStorageStaticArtifactDisposition[] = [];
    const artifacts: ObjectStorageStaticArtifactPlanEntry[] = [];

    /*
     * This runs while the permanent-delete caller owns the project physical and
     * NFS barriers, but before EFFECT_STARTED. Validate every namespace that the
     * destructive phase will traverse without following symlinks. A malformed
     * mount/symlink therefore restores the Project deletion fence and leaves the
     * tree, snapshots and provider bucket untouched.
     */
    await readStaticNamespace(root);
    await ownedStaticEntries(root, deploymentIds);
    await relevantStaticAliases(root, deploymentIds);

    const artifactsRoot = staticChildPath(root, '.artifacts');
    await readStaticNamespace(artifactsRoot);
    const digestRoot = staticChildPath(artifactsRoot, 'sha256');
    await readStaticNamespace(digestRoot);

    for (const inventoryArtifact of inventory.artifacts) {
      const digest = artifactDigest(inventoryArtifact.artifactRef);
      await withStaticDeploymentStorageLock(digest, async () => {
        const live = await this.resolveLiveStaticArtifact(projectId, inventoryArtifact.artifactRef);
        artifacts.push({
          artifactRef: live.artifactRef,
          digest,
          projectReferenceCount: live.projectReferenceCount,
          otherReferenceCount: live.otherReferenceCount,
        });
        await ownedStaticEntries(digestRoot, new Set([digest]));
        if (live.otherReferenceCount === 0) {
          dispositions.push({ digest, outcome: 'DELETED_UNREFERENCED', otherReferenceCount: 0 });
          return;
        }

        const canonical = staticChildPath(digestRoot, digest);
        let metadata;
        try {
          metadata = await lstat(canonical);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
          throw staticErasureError('PROJECT_STATIC_SHARED_ARTIFACT_MISSING');
        }
        dispositions.push({
          digest,
          outcome: 'RETAINED_BY_OTHER_MANIFEST',
          otherReferenceCount: live.otherReferenceCount,
        });
      });
    }

    return { summary: objectStorageStaticArtifactSummary(dispositions), artifacts };
  }

  private async resolveStaticErasureInventory(projectId: string): Promise<ProjectStaticErasureInventory> {
    if (!this.staticErasureAuthority) {
      throw staticErasureError('PROJECT_STATIC_ERASURE_AUTHORITY_UNAVAILABLE');
    }

    return validateStaticErasureInventory(projectId, await this.staticErasureAuthority.resolveInventory(projectId));
  }

  private async resolveLiveStaticArtifact(
    projectId: string,
    artifactRef: string,
  ): Promise<ProjectStaticArtifactAuthority> {
    const artifact = await this.staticErasureAuthority?.resolveArtifact(projectId, artifactRef);
    if (!artifact) throw staticErasureError('PROJECT_STATIC_ERASURE_AUTHORITY_CHANGED');
    return validateStaticArtifactAuthority(artifact, artifactRef);
  }

  private async verifyProjectStaticDataAbsentWithinPhysicalAccess(projectId: string): Promise<{
    staticSnapshotsAbsent: true;
    staticAliasesAbsent: true;
    staticArtifactSummary: ObjectStorageStaticArtifactSummary;
  }> {
    const inventory = await this.resolveStaticErasureInventory(projectId);
    const root = staticStorageRoot();
    const deploymentIds = new Set(inventory.deploymentIds);

    if ((await ownedStaticEntries(root, deploymentIds)).length > 0) {
      throw staticErasureError('PROJECT_STATIC_SNAPSHOT_ERASURE_INCOMPLETE');
    }

    if ((await relevantStaticAliases(root, deploymentIds)).length > 0) {
      throw staticErasureError('PROJECT_STATIC_ALIAS_ERASURE_INCOMPLETE');
    }

    const artifactsRoot = staticChildPath(root, '.artifacts');
    await readStaticNamespace(artifactsRoot);
    const digestRoot = staticChildPath(artifactsRoot, 'sha256');
    await readStaticNamespace(digestRoot);
    const dispositions: ObjectStorageStaticArtifactDisposition[] = [];

    for (const inventoryArtifact of inventory.artifacts) {
      const digest = artifactDigest(inventoryArtifact.artifactRef);
      const disposition = await withStaticDeploymentStorageLock(digest, async () => {
        const live = await this.resolveLiveStaticArtifact(projectId, inventoryArtifact.artifactRef);
        const entries = await ownedStaticEntries(digestRoot, new Set([digest]));
        const canonical = staticChildPath(digestRoot, digest);
        const canonicalExists = entries.some((entry) => entry.name === digest);
        const recoveryExists = entries.some((entry) => entry.name !== digest);

        if (recoveryExists) {
          throw staticErasureError('PROJECT_STATIC_ARTIFACT_RECOVERY_ERASURE_INCOMPLETE');
        }

        if (live.otherReferenceCount === 0) {
          if (canonicalExists) throw staticErasureError('PROJECT_STATIC_ARTIFACT_ERASURE_INCOMPLETE');
          return {
            digest,
            outcome: 'DELETED_UNREFERENCED' as const,
            otherReferenceCount: 0,
          };
        }

        let metadata;
        try {
          metadata = await lstat(canonical);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }

        if (!canonicalExists || !metadata?.isDirectory() || metadata.isSymbolicLink()) {
          throw staticErasureError('PROJECT_STATIC_SHARED_ARTIFACT_MISSING');
        }

        return {
          digest,
          outcome: 'RETAINED_BY_OTHER_MANIFEST' as const,
          otherReferenceCount: live.otherReferenceCount,
        };
      });

      dispositions.push(disposition);
    }

    return {
      staticSnapshotsAbsent: true,
      staticAliasesAbsent: true,
      staticArtifactSummary: objectStorageStaticArtifactSummary(dispositions),
    };
  }

  private withTreeMutation<T>(
    projectId: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    mutate: () => Promise<T>,
  ): Promise<T> {
    const authority = { projectId, ...scope };

    return this.mutationCoordinator ? this.mutationCoordinator(authority, mutate) : withProjectLock(projectId, mutate);
  }

  async writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string; encoding?: FileEncoding }>,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    guard?: () => Promise<void>,
  ) {
    return this.withTreeMutation(projectId, scope, async () => {
      for (const file of files) {
        const target = safeWorkspacePath(projectId, scope.workspaceId, file.path);
        await guard?.();
        await mkdir(dirname(target), { recursive: true });
        await guard?.();
        await writeFile(target, decodeFileContent(file.content, file.encoding));
      }

      return walkFiles(safeWorkspacePath(projectId, scope.workspaceId));
    });
  }

  async listFiles(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>) {
    const read = () => this.listFilesWithinPhysicalAccess(projectId, scope.workspaceId);
    return this.accessCoordinator
      ? this.accessCoordinator({ projectId, ...scope }, read)
      : withProjectLock(projectId, read);
  }

  async listFilesWithinPhysicalAccess(projectId: string, workspaceId?: string) {
    return walkFiles(safeWorkspacePath(projectId, workspaceId));
  }

  async exportZip(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>) {
    const mutate = async () => {
      const content = await archiveFiles(await walkFiles(safeProjectPath(projectId)));
      const storageKey = archiveKey('exports', projectId);
      const target = safeProjectPath('_objects', storageKey);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);

      return { storageKey, byteLength: content.byteLength, base64: content.toString('base64'), createdAt: now() };
    };

    return this.objectMutationCoordinator
      ? this.objectMutationCoordinator({ projectId, ...scope }, mutate)
      : withProjectLock(projectId, mutate);
  }

  async importZip(
    projectId: string,
    base64: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    options: { replaceExisting?: boolean } = {},
  ) {
    return this.withTreeMutation(projectId, scope, async () => {
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
    expectedOrganizationId: string;
    label?: string;
    files: ProjectFile[];
    storageKey?: string;
    guard?: () => Promise<void>;
  }) {
    const mutate = async () => {
      const content = await archiveFiles(input.files);
      const storageKey = normalize(input.storageKey ?? archiveKey('snapshots', input.projectId)).replaceAll('\\', '/');
      if (!storageKey.startsWith(`snapshots/${input.projectId}/`)) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
          code: 'SNAPSHOT_STORAGE_PROJECT_MISMATCH',
          statusCode: 409,
        });
      }
      const target = safeProjectPath('_objects', storageKey);
      await input.guard?.();
      await mkdir(dirname(target), { recursive: true });
      await input.guard?.();
      await writeFile(target, content);

      return { storageKey, byteLength: content.byteLength, base64: content.toString('base64'), createdAt: now() };
    };

    const scope = { projectId: input.projectId, expectedOrganizationId: input.expectedOrganizationId };

    return this.objectMutationCoordinator
      ? this.objectMutationCoordinator(scope, mutate)
      : withProjectLock(input.projectId, mutate);
  }

  async getSnapshotFiles(
    projectId: string,
    storageKey: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
  ) {
    const read = () => this.getSnapshotFilesWithinPhysicalAccess(projectId, storageKey);
    return this.accessCoordinator
      ? this.accessCoordinator({ projectId, ...scope }, read)
      : withProjectLock(projectId, read);
  }

  async getSnapshotFilesWithinPhysicalAccess(projectId: string, storageKey: string) {
    const normalizedKey = normalize(storageKey).replaceAll('\\', '/');
    if (!normalizedKey.startsWith(`snapshots/${projectId}/`)) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
        code: 'SNAPSHOT_STORAGE_PROJECT_MISMATCH',
        statusCode: 409,
      });
    }

    const files = await filesFromZipBase64(
      (await readFile(safeProjectPath('_objects', normalizedKey))).toString('base64'),
    );

    const updatedAt = now();

    return files.map((file) => ({ ...file, updatedAt }));
  }

  async restoreSnapshot(
    input: { projectId: string; expectedOrganizationId: string; workspaceId?: string; files: ProjectFile[] },
    guard?: () => Promise<void>,
  ) {
    return this.withTreeMutation(input.projectId, input, async () => {
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

  async deleteProjectFiles(
    projectId: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    guard?: () => Promise<void>,
  ): Promise<void> {
    await this.withTreeMutation(projectId, scope, async () => {
      await guard?.();
      await resilientRm(safeProjectPath(projectId));
    });
  }

  async eraseProjectDataWithinPhysicalAccess(projectId: string): Promise<void> {
    const targets = [
      safeProjectPath(projectId),
      safeProjectPath('_objects', `exports/${projectId}`),
      safeProjectPath('_objects', `snapshots/${projectId}`),
    ];

    for (const target of targets) {
      await resilientRm(target);
    }

    const remaining = (await Promise.all(targets.map((target) => pathExists(target)))).filter(Boolean).length;

    if (remaining > 0) {
      throw Object.assign(new Error(appPublicEnglish('GENERIC_REQUEST_FAILED')), {
        code: 'PROJECT_PHYSICAL_ERASURE_INCOMPLETE',
        statusCode: 503,
      });
    }
  }

  async eraseProjectStaticDataWithinPhysicalAccess(projectId: string): Promise<void> {
    const inventory = await this.resolveStaticErasureInventory(projectId);
    const root = staticStorageRoot();
    const deploymentIds = new Set(inventory.deploymentIds);
    const snapshotEntries = await ownedStaticEntries(root, deploymentIds);

    for (const entry of snapshotEntries) {
      await withStaticDeploymentStorageLock(entry.owner, () => eraseStaticPath(entry.target));
    }

    await eraseRelevantStaticAliases(root, deploymentIds);

    const artifactsRoot = staticChildPath(root, '.artifacts');
    await readStaticNamespace(artifactsRoot);
    const digestRoot = staticChildPath(artifactsRoot, 'sha256');
    await readStaticNamespace(digestRoot);

    for (const inventoryArtifact of inventory.artifacts) {
      const digest = artifactDigest(inventoryArtifact.artifactRef);

      await withStaticDeploymentStorageLock(digest, async () => {
        const live = await this.resolveLiveStaticArtifact(projectId, inventoryArtifact.artifactRef);
        const entries = await ownedStaticEntries(digestRoot, new Set([digest]));

        for (const entry of entries) {
          if (entry.name !== digest) await eraseStaticPath(entry.target);
        }

        const canonical = staticChildPath(digestRoot, digest);
        if (live.otherReferenceCount === 0) {
          await eraseStaticPath(canonical);
          return;
        }

        let metadata;
        try {
          metadata = await lstat(canonical);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }

        if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
          throw staticErasureError('PROJECT_STATIC_SHARED_ARTIFACT_MISSING');
        }
      });
    }

    await this.verifyProjectStaticDataAbsentWithinPhysicalAccess(projectId);
  }

  async verifyProjectDataAbsentWithinPhysicalAccess(projectId: string): Promise<ProjectPhysicalAbsenceProof> {
    const [treeExists, exportsExist, snapshotsExist] = await Promise.all([
      pathExists(safeProjectPath(projectId)),
      pathExists(safeProjectPath('_objects', `exports/${projectId}`)),
      pathExists(safeProjectPath('_objects', `snapshots/${projectId}`)),
    ]);
    /*
     * Keep the local-only primitive composable for specialised providers. The
     * permanent-delete route requires every static field to be present and true,
     * so absence of the injected authority still fails closed in production.
     */
    const staticProof = this.staticErasureAuthority
      ? await this.verifyProjectStaticDataAbsentWithinPhysicalAccess(projectId)
      : {};

    return {
      treeAbsent: !treeExists,
      exportsAbsent: !exportsExist,
      snapshotsAbsent: !snapshotsExist,
      ...staticProof,
    };
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
  constructor(private readonly mutationCoordinator?: ProjectMutationCoordinator) {}

  private withMutationLock<T>(
    projectId: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    mutate: () => Promise<T>,
  ): Promise<T> {
    return this.mutationCoordinator
      ? this.mutationCoordinator({ projectId, ...scope }, mutate)
      : withProjectLock(projectId, mutate);
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
  private git(
    projectId: string,
    scope: Omit<ProjectPhysicalMutationScope, 'projectId'>,
    args: string[],
    raw = false,
  ): Promise<string> {
    return this.withMutationLock(projectId, scope, () => this.gitLocked(projectId, args, scope.workspaceId, raw));
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

  async status(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>, files?: ProjectFile[]) {
    return this.withMutationLock(projectId, scope, () => this.statusLocked(projectId, scope.workspaceId, files));
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
    expectedOrganizationId: string;
    workspaceId?: string;
    message: string;
    files: ProjectFile[];
    selectedFiles?: string[];
    authorName?: string;
    authorEmail?: string;
  }) {
    return this.withMutationLock(input.projectId, input, async () => {
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

  async push(input: { projectId: string; expectedOrganizationId: string; workspaceId?: string; branch: string }) {
    return this.withMutationLock(input.projectId, input, async () => {
      await this.gitLocked(input.projectId, ['push', 'origin', input.branch], input.workspaceId);

      return { pushed: true, branch: input.branch };
    });
  }

  async pull(input: { projectId: string; expectedOrganizationId: string; workspaceId?: string; branch: string }) {
    return this.withMutationLock(input.projectId, input, async () => {
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

  async configureRemote(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    remoteUrl: string;
  }) {
    return this.withMutationLock(input.projectId, input, async () => {
      const remotes = await this.gitLocked(input.projectId, ['remote'], input.workspaceId).catch(() => '');

      const args = remotes.split('\n').includes('origin')
        ? ['remote', 'set-url', 'origin', input.remoteUrl]
        : ['remote', 'add', 'origin', input.remoteUrl];

      await this.gitLocked(input.projectId, args, input.workspaceId);

      return { remote: 'origin', remoteUrl: input.remoteUrl };
    });
  }

  async removeRemote(input: { projectId: string; expectedOrganizationId: string; workspaceId?: string }) {
    return this.withMutationLock(input.projectId, input, async () => {
      const remotes = await this.gitLocked(input.projectId, ['remote'], input.workspaceId).catch(() => '');

      if (remotes.split('\n').includes('origin')) {
        // Tolerate an already-absent origin (idempotent disconnect).
        await this.gitLocked(input.projectId, ['remote', 'remove', 'origin'], input.workspaceId).catch(() => undefined);
      }

      return { removed: true };
    });
  }

  async listBranches(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>) {
    const output = await this.git(projectId, scope, ['branch', '--all', '--format=%(refname:short)']);

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
    expectedOrganizationId: string;
    workspaceId?: string;
    branch: string;
    create?: boolean;
    startPoint?: string;
  }) {
    return this.withMutationLock(input.projectId, input, async () => {
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

  async stashPush(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    message?: string;
  }) {
    return this.withMutationLock(input.projectId, input, async () => {
      const args = ['stash', 'push', '--include-untracked'];

      if (input.message) {
        args.push('-m', input.message);
      }

      const output = await this.gitLocked(input.projectId, args, input.workspaceId);

      return { stashed: !/No local changes/i.test(output), output };
    });
  }

  async stashList(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>) {
    const output = await this.git(projectId, scope, ['stash', 'list', '--format=%gd%x09%gs']);

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, message = ''] = line.split('\t');
        const branch = message.match(/WIP on ([^:]+):/)?.[1];

        return { id, branch, message };
      });
  }

  async stashApply(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    stashRef: string;
    drop?: boolean;
  }) {
    return this.withMutationLock(input.projectId, input, async () => {
      const output = await this.gitLocked(
        input.projectId,
        ['stash', input.drop ? 'pop' : 'apply', input.stashRef],
        input.workspaceId,
      );

      return { applied: true, output };
    });
  }

  async cherryPick(input: { projectId: string; expectedOrganizationId: string; workspaceId?: string; sha: string }) {
    return this.withMutationLock(input.projectId, input, async () => {
      const output = await this.gitLocked(input.projectId, ['cherry-pick', input.sha], input.workspaceId);

      return { picked: true, output };
    });
  }

  async resolveConflict(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    filePath: string;
    strategy: 'ours' | 'theirs';
  }) {
    return this.withMutationLock(input.projectId, input, async () => {
      const filePath = input.filePath.replace(/^\/+/, '');

      await this.gitLocked(input.projectId, ['checkout', `--${input.strategy}`, '--', filePath], input.workspaceId);
      await this.gitLocked(input.projectId, ['add', '--', filePath], input.workspaceId);

      return { resolved: true, filePath, strategy: input.strategy };
    });
  }

  async commitDetail(projectId: string, sha: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>) {
    // Strip to a safe revision token (hex sha / short sha) — never interpolate raw.
    const rev = sha.replace(/[^a-zA-Z0-9]/g, '');

    if (!rev) {
      return { sha: '', files: [] as Array<{ status: string; path: string }>, diff: '' };
    }

    const namesOut = await this.git(projectId, scope, [
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '-r',
      '-M',
      rev,
    ]).catch(() => '');

    const files = namesOut
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split('\t');

        return { status: (status ?? 'M').trim(), path: rest.join('\t') };
      })
      .filter((entry) => entry.path);

    const diff = await this.git(projectId, scope, ['show', '--format=', rev]).catch(() => '');

    return { sha: rev, files, diff };
  }

  async restoreCommit(projectId: string, sha: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>) {
    const rev = sha.replace(/[^a-zA-Z0-9]/g, '');

    if (!rev) {
      throw Object.assign(new Error(appPublicEnglish('GIT_BAD_REVISION')), {
        statusCode: 400,
        code: 'GIT_BAD_REVISION',
      });
    }

    return this.withMutationLock(projectId, scope, async () => {
      /*
       * Restore every tracked file to its state at <sha> (Replit's "Restore All").
       * `git checkout <sha> -- .` overwrites the working tree + index with that
       * commit's content WITHOUT moving HEAD, so the user can review and commit.
       */
      await this.gitLocked(projectId, ['checkout', rev, '--', '.'], scope.workspaceId);

      return { restored: true, sha: rev };
    });
  }

  async conflictFile(projectId: string, filePath: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>) {
    return this.withMutationLock(projectId, scope, async () => {
      const clean = filePath.replace(/^\/+/, '');
      const target = safeWorkspacePath(projectId, scope.workspaceId, clean);
      // The working-tree file carries the <<<<<<< / ======= / >>>>>>> conflict
      // markers during an unresolved merge; surface it verbatim for the editor.
      const content = await readFile(target, 'utf8').catch(() => '');

      return { filePath: clean, content };
    });
  }

  async markResolved(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    filePath: string;
    content: string;
  }) {
    return this.withMutationLock(input.projectId, input, async () => {
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

  async discard(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    filePaths?: string[];
  }) {
    return this.withMutationLock(input.projectId, input, async () => {
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

  async logGraph(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>, limit = 30) {
    const output = await this.git(projectId, scope, [
      'log',
      `--max-count=${Math.max(1, Math.min(limit, 100))}`,
      '--date=iso-strict',
      '--pretty=format:%H%x09%h%x09%P%x09%an%x09%ad%x09%D%x09%s',
    ]).catch((error: any) => {
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

  async diff(projectId: string, scope: Omit<ProjectPhysicalMutationScope, 'projectId'>, filePath?: string) {
    return this.git(projectId, scope, ['diff', '--', ...(filePath ? [filePath] : [])]).catch((error: any) => {
      const message = String(error?.stderr ?? error?.message ?? '');

      if (/bad revision|unknown revision|ambiguous argument/i.test(message)) {
        return '';
      }

      throw error;
    });
  }

  async blame(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
  }) {
    const range =
      input.startLine && input.endLine
        ? [`-L`, `${Math.max(1, input.startLine)},${Math.max(input.startLine, input.endLine)}`]
        : [];
    const output = await this.git(input.projectId, input, [
      'blame',
      '--line-porcelain',
      ...range,
      '--',
      input.filePath.replace(/^\/+/, ''),
    ]);

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
    expectedOrganizationId: string;
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
