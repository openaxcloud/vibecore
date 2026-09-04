import { createHash, randomUUID } from 'node:crypto';
import type {
  ApiStore,
  FileVersionContentRecord,
  FileVersionOperation,
  FileVersionRecord,
  FileVersionSource,
} from './store.js';

export const FILE_HISTORY_MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const FILE_HISTORY_MAX_PAGE_SIZE = 100;

const MAX_PATH_LENGTH = 4096;
const MAX_OPERATION_ID_LENGTH = 180;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const INTERNAL_PATH_SEGMENTS = new Set(['.git', '.history', '.vibecore-workspaces', 'node_modules']);

export interface FileHistoryPublicVersion {
  id: string;
  workspaceId: string;
  path: string;
  sequence: string;
  operation: Exclude<FileVersionOperation, 'baseline'>;
  source: FileVersionSource;
  actor?: { id: string };
  encoding: 'utf8';
  sizeBytes: number;
  contentHash: string;
  restoredFromVersionId?: string;
  renamedFromPath?: string;
  tombstone: boolean;
  createdAt: string;
}

export class FileHistoryError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: { statusCode: number; code: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'FileHistoryError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

export function toPublicFileVersion(version: FileVersionRecord): FileHistoryPublicVersion {
  return {
    id: version.id,
    workspaceId: version.workspaceKey,
    path: version.path,
    sequence: version.sequence,
    // The initial pre-autosave snapshot is the file's creation point from the
    // user's perspective. Keep `baseline` internal and expose the stable public
    // operation vocabulary consumed by the IDE.
    operation: version.operation === 'baseline' ? 'create' : version.operation,
    source: version.source,
    actor: version.actorUserId ? { id: version.actorUserId } : undefined,
    encoding: version.encoding,
    sizeBytes: version.byteLength,
    contentHash: version.contentHash,
    restoredFromVersionId: version.restoredFromVersionId,
    renamedFromPath: version.renamedFromPath,
    tombstone: version.tombstone,
    createdAt: version.createdAt,
  };
}

export function normalizeFileHistoryPath(rawPath: string): string {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.length > MAX_PATH_LENGTH) {
    throw new FileHistoryError('A valid file path is required', {
      statusCode: 400,
      code: 'FILE_HISTORY_PATH_INVALID',
    });
  }

  const segments = rawPath
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');

  if (segments.length === 0 || segments.some((segment) => segment === '..' || CONTROL_CHARACTERS.test(segment))) {
    throw new FileHistoryError('File path is invalid or escapes the workspace', {
      statusCode: 400,
      code: 'FILE_HISTORY_PATH_INVALID',
    });
  }

  if (segments.some((segment) => INTERNAL_PATH_SEGMENTS.has(segment))) {
    throw new FileHistoryError('File History does not record internal or dependency files', {
      statusCode: 422,
      code: 'FILE_HISTORY_UNSUPPORTED',
    });
  }

  const normalized = segments.join('/');

  if (normalized.length > MAX_PATH_LENGTH) {
    throw new FileHistoryError('File path is too long', {
      statusCode: 400,
      code: 'FILE_HISTORY_PATH_INVALID',
    });
  }

  return normalized;
}

function validateScope(projectId: string, workspaceKey: string) {
  if (
    !projectId ||
    !workspaceKey ||
    projectId.length > 256 ||
    workspaceKey.length > 256 ||
    CONTROL_CHARACTERS.test(projectId) ||
    CONTROL_CHARACTERS.test(workspaceKey)
  ) {
    throw new FileHistoryError('File History workspace scope is invalid', {
      statusCode: 400,
      code: 'FILE_HISTORY_SCOPE_INVALID',
    });
  }
}

function validateOperationId(operationId: string) {
  if (
    typeof operationId !== 'string' ||
    operationId.length < 1 ||
    operationId.length > MAX_OPERATION_ID_LENGTH ||
    CONTROL_CHARACTERS.test(operationId)
  ) {
    throw new FileHistoryError('A valid operationId is required', {
      statusCode: 400,
      code: 'FILE_HISTORY_OPERATION_ID_INVALID',
    });
  }
}

interface PreparedTextContent {
  content: string;
  contentBase64: string;
  contentHash: string;
  byteLength: number;
  encoding: 'utf8';
}

function prepareTextContent(content: string, encoding: 'utf8' | 'base64' = 'utf8'): PreparedTextContent {
  if (encoding !== 'utf8' || content.includes('\0')) {
    throw new FileHistoryError('File History currently supports text files only', {
      statusCode: 422,
      code: 'FILE_HISTORY_UNSUPPORTED',
    });
  }

  const bytes = Buffer.from(content, 'utf8');

  if (bytes.byteLength > FILE_HISTORY_MAX_TEXT_BYTES) {
    throw new FileHistoryError('File exceeds the 2 MiB File History limit', {
      statusCode: 413,
      code: 'FILE_HISTORY_TOO_LARGE',
    });
  }

  return {
    content,
    contentBase64: bytes.toString('base64'),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
    encoding: 'utf8',
  };
}

function decodeStoredText(version: FileVersionContentRecord): string {
  if (version.encoding !== 'utf8') {
    throw new FileHistoryError('This version is not a supported text file', {
      statusCode: 422,
      code: 'FILE_HISTORY_UNSUPPORTED',
    });
  }

  const bytes = Buffer.from(version.contentBase64, 'base64');
  const checksum = createHash('sha256').update(bytes).digest('hex');

  if (checksum !== version.contentHash || bytes.byteLength !== version.byteLength) {
    throw new FileHistoryError('Stored File History content failed checksum verification', {
      statusCode: 409,
      code: 'FILE_HISTORY_CHECKSUM_MISMATCH',
    });
  }

  return bytes.toString('utf8');
}

function lockKey(projectId: string, workspaceKey: string, path: string) {
  const digest = createHash('sha256').update(`${projectId}\0${workspaceKey}\0${path}`).digest('hex');
  return `file-history:${digest}`;
}

function idempotencyConflict(existing: FileVersionRecord): never {
  throw new FileHistoryError('operationId was already used for a different File History mutation', {
    statusCode: 409,
    code: 'FILE_HISTORY_IDEMPOTENCY_CONFLICT',
    details: { versionId: existing.id },
  });
}

function assertIdempotentReplay(
  existing: FileVersionRecord,
  expected: {
    path: string;
    operation: FileVersionOperation;
    source: FileVersionSource;
    contentHash: string;
    restoredFromVersionId?: string;
    renamedFromPath?: string;
    tombstone?: boolean;
    lineageId?: string;
  },
) {
  if (
    existing.path !== expected.path ||
    existing.operation !== expected.operation ||
    existing.source !== expected.source ||
    existing.contentHash !== expected.contentHash ||
    existing.restoredFromVersionId !== expected.restoredFromVersionId ||
    existing.renamedFromPath !== expected.renamedFromPath ||
    existing.tombstone !== (expected.tombstone ?? false) ||
    (expected.lineageId !== undefined && existing.lineageId !== expected.lineageId)
  ) {
    idempotencyConflict(existing);
  }
}

function assertExpectedLatest(latest: FileVersionRecord | undefined, expectedLatestVersionId: string | undefined) {
  if (expectedLatestVersionId === undefined) {
    return;
  }

  if (latest?.id !== expectedLatestVersionId) {
    throw new FileHistoryError('The file changed after this history view was loaded', {
      statusCode: 409,
      code: 'FILE_HISTORY_CONFLICT',
      details: { latestVersionId: latest?.id },
    });
  }
}

async function appendPreparedVersion(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    workspaceId?: string;
    path: string;
    lineageId: string;
    operation: FileVersionOperation;
    source: FileVersionSource;
    actorUserId?: string;
    operationId: string;
    restoredFromVersionId?: string;
    renamedFromPath?: string;
    tombstone?: boolean;
    latest?: FileVersionRecord;
    prepared: PreparedTextContent;
  },
) {
  const appended = await store.appendFileVersion({
    projectId: input.projectId,
    workspaceKey: input.workspaceKey,
    workspaceId: input.workspaceId,
    path: input.path,
    lineageId: input.lineageId,
    operation: input.operation,
    source: input.source,
    actorUserId: input.actorUserId,
    operationId: input.operationId,
    previousVersionId: input.latest?.id,
    restoredFromVersionId: input.restoredFromVersionId,
    renamedFromPath: input.renamedFromPath,
    tombstone: input.tombstone,
    contentHash: input.prepared.contentHash,
    contentBase64: input.prepared.contentBase64,
    encoding: input.prepared.encoding,
    byteLength: input.prepared.byteLength,
  });

  assertIdempotentReplay(appended.version, {
    path: input.path,
    operation: input.operation,
    source: input.source,
    contentHash: input.prepared.contentHash,
    restoredFromVersionId: input.restoredFromVersionId,
    renamedFromPath: input.renamedFromPath,
    tombstone: input.tombstone,
    lineageId: input.lineageId,
  });

  return appended;
}

export async function captureFileVersion(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    workspaceId?: string;
    path: string;
    content: string;
    encoding?: 'utf8' | 'base64';
    source: FileVersionSource;
    actorUserId?: string;
    operationId: string;
    operation?: Extract<FileVersionOperation, 'create' | 'write'>;
    expectedLatestVersionId?: string;
  },
): Promise<{ version: FileVersionRecord; created: boolean; deduplicated: boolean }> {
  validateScope(input.projectId, input.workspaceKey);
  validateOperationId(input.operationId);
  const path = normalizeFileHistoryPath(input.path);
  const prepared = prepareTextContent(input.content, input.encoding);
  const operation = input.operation ?? 'write';

  return store.withSerializedMutation(lockKey(input.projectId, input.workspaceKey, path), async () => {
    const existing = await store.findFileVersionByOperation(input.projectId, input.workspaceKey, input.operationId);

    if (existing) {
      assertIdempotentReplay(existing, {
        path,
        operation,
        source: input.source,
        contentHash: prepared.contentHash,
      });
      return { version: existing, created: false, deduplicated: true };
    }

    const latest = await store.getLatestFileVersion(input.projectId, input.workspaceKey, path);
    assertExpectedLatest(latest, input.expectedLatestVersionId);

    if (latest && !latest.tombstone && latest.contentHash === prepared.contentHash) {
      return { version: latest, created: false, deduplicated: true };
    }

    const lineageId = latest && !latest.tombstone ? latest.lineageId : randomUUID();

    const appended = await appendPreparedVersion(store, {
      ...input,
      path,
      lineageId,
      operation,
      latest,
      prepared,
    });

    return { version: appended.version, created: appended.created, deduplicated: !appended.created };
  });
}

function encodeCursor(cursor: { sequence: string }) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      sequence?: unknown;
    };
    const sequence = typeof parsed.sequence === 'string' ? parsed.sequence : '';

    if (!/^\d{1,30}$/.test(sequence) || BigInt(sequence) < 1n) {
      throw new Error('invalid cursor');
    }

    return { sequence };
  } catch {
    throw new FileHistoryError('File History cursor is invalid', {
      statusCode: 400,
      code: 'FILE_HISTORY_CURSOR_INVALID',
    });
  }
}

export async function listFileHistory(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    path: string;
    limit?: number;
    cursor?: string;
  },
) {
  validateScope(input.projectId, input.workspaceKey);
  const path = normalizeFileHistoryPath(input.path);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), FILE_HISTORY_MAX_PAGE_SIZE);
  const cursor = decodeCursor(input.cursor);
  /*
   * Resolve the current path to its stable lineage before paging. Renames append
   * a new path entry with the same lineage, so the new filename retains every
   * prior content revision without copying or rewriting immutable rows.
   */
  const latest = await store.getLatestFileVersion(input.projectId, input.workspaceKey, path);
  const continuityState = await store.getFileHistoryWatchState(input.projectId, input.workspaceKey);

  if (!latest) {
    return {
      versions: [],
      latestVersionId: undefined,
      nextCursor: undefined,
      total: 0,
      continuity: toPublicContinuity(continuityState),
    };
  }

  const [rows, total] = await Promise.all([
    store.listFileVersions({
      projectId: input.projectId,
      workspaceKey: input.workspaceKey,
      lineageId: latest.lineageId,
      take: limit + 1,
      cursor,
    }),
    store.countFileVersions(input.projectId, input.workspaceKey, latest.lineageId),
  ]);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  /*
   * First-page rows are newest-first, so their head is the only latest id from
   * the same coherent snapshot. A separate latest read could resolve before or
   * after a concurrent append and disagree in either direction. Cursor pages
   * keep the overall latest id for API compatibility; clients must not use an
   * older page to replace the latest id established by the first page.
   */
  const latestVersionId = cursor ? latest.id : page[0]?.id;

  return {
    versions: page.map(toPublicFileVersion),
    latestVersionId,
    nextCursor: hasMore && last ? encodeCursor({ sequence: last.sequence }) : undefined,
    total,
    continuity: toPublicContinuity(continuityState),
  };
}

function toPublicContinuity(state: Awaited<ReturnType<ApiStore['getFileHistoryWatchState']>>) {
  if (!state) {
    return { complete: true, reasons: [] as string[], droppedEvents: 0, reconciledAt: undefined };
  }

  return {
    complete: state.complete,
    reasons: state.reasons,
    droppedEvents: state.droppedEvents,
    snapshotTruncated: state.snapshotTruncated,
    connectionTruncated: state.connectionTruncated,
    reconciledAt: state.reconciledAt,
  };
}

export async function getFileHistoryVersion(
  store: ApiStore,
  input: { projectId: string; workspaceKey: string; versionId: string },
) {
  validateScope(input.projectId, input.workspaceKey);

  if (!input.versionId || input.versionId.length > 256 || CONTROL_CHARACTERS.test(input.versionId)) {
    throw new FileHistoryError('File History version was not found', {
      statusCode: 404,
      code: 'FILE_HISTORY_VERSION_NOT_FOUND',
    });
  }

  const version = await store.getFileVersion(input.projectId, input.workspaceKey, input.versionId);

  if (!version) {
    throw new FileHistoryError('File History version was not found', {
      statusCode: 404,
      code: 'FILE_HISTORY_VERSION_NOT_FOUND',
    });
  }

  return { version: toPublicFileVersion(version), content: decodeStoredText(version) };
}

export async function restoreFileVersion(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    workspaceId?: string;
    versionId: string;
    expectedLatestVersionId: string;
    operationId: string;
    actorUserId?: string;
    writeFile: (file: { path: string; content: string; encoding: 'utf8' }) => Promise<unknown>;
  },
): Promise<{ version: FileVersionRecord; created: boolean }> {
  validateScope(input.projectId, input.workspaceKey);
  validateOperationId(input.operationId);

  if (!input.expectedLatestVersionId) {
    throw new FileHistoryError('expectedLatestVersionId is required for a safe restore', {
      statusCode: 400,
      code: 'FILE_HISTORY_EXPECTED_LATEST_REQUIRED',
    });
  }

  const target = await store.getFileVersion(input.projectId, input.workspaceKey, input.versionId);

  if (!target) {
    throw new FileHistoryError('File History version was not found', {
      statusCode: 404,
      code: 'FILE_HISTORY_VERSION_NOT_FOUND',
    });
  }

  const lineageLatest = await store.getLatestFileVersionByLineage(
    input.projectId,
    input.workspaceKey,
    target.lineageId,
  );

  if (!lineageLatest) {
    throw new FileHistoryError('File History lineage was not found', {
      statusCode: 409,
      code: 'FILE_HISTORY_LINEAGE_NOT_FOUND',
    });
  }

  const path = normalizeFileHistoryPath(lineageLatest.path);
  const content = decodeStoredText(target);
  const prepared = prepareTextContent(content);

  return store.withSerializedMutation(lockKey(input.projectId, input.workspaceKey, path), async () => {
    const existing = await store.findFileVersionByOperation(input.projectId, input.workspaceKey, input.operationId);

    if (existing) {
      assertIdempotentReplay(existing, {
        path,
        operation: 'restore',
        source: 'editor',
        contentHash: prepared.contentHash,
        restoredFromVersionId: target.id,
        lineageId: target.lineageId,
      });
      return { version: existing, created: false };
    }

    const latest = await store.getLatestFileVersion(input.projectId, input.workspaceKey, path);
    assertExpectedLatest(latest, input.expectedLatestVersionId);

    await input.writeFile({ path, content, encoding: 'utf8' });

    const appended = await appendPreparedVersion(store, {
      projectId: input.projectId,
      workspaceKey: input.workspaceKey,
      workspaceId: input.workspaceId,
      path,
      lineageId: target.lineageId,
      operation: 'restore',
      source: 'editor',
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      restoredFromVersionId: target.id,
      latest,
      prepared,
    });

    return { version: appended.version, created: appended.created };
  });
}

/**
 * Central remote autosave mutation. It snapshots the actual pre-write body when
 * history has no matching latest version, performs the workspace write, then
 * appends the new version. A failed post-write DB append is safe to retry: when
 * the retry observes current === desired it skips a false baseline and appends
 * the intended write operation.
 */
export async function writeTextFileWithHistory(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    workspaceId?: string;
    path: string;
    content: string;
    encoding?: 'utf8' | 'base64';
    source: FileVersionSource;
    actorUserId?: string;
    operationId: string;
    operation?: Extract<FileVersionOperation, 'create' | 'write'>;
    readCurrent: () => Promise<{ content: string; encoding?: 'utf8' | 'base64' } | undefined>;
    writeCurrent: () => Promise<unknown>;
  },
): Promise<{ version?: FileVersionRecord; baselineCreated: boolean; historySkipped: boolean }> {
  // File History is deliberately text-only. Binary writes still proceed through
  // the real runtime; they simply do not create a misleading/corrupted version.
  if (input.encoding === 'base64') {
    await input.writeCurrent();
    return { baselineCreated: false, historySkipped: true };
  }

  validateScope(input.projectId, input.workspaceKey);
  validateOperationId(input.operationId);
  const operation = input.operation ?? 'write';

  let path: string;

  try {
    path = normalizeFileHistoryPath(input.path);
  } catch (error) {
    if (error instanceof FileHistoryError && error.code === 'FILE_HISTORY_UNSUPPORTED') {
      await input.writeCurrent();
      return { baselineCreated: false, historySkipped: true };
    }

    throw error;
  }

  let desired: PreparedTextContent;

  try {
    desired = prepareTextContent(input.content, input.encoding);
  } catch (error) {
    if (
      error instanceof FileHistoryError &&
      (error.code === 'FILE_HISTORY_TOO_LARGE' || error.code === 'FILE_HISTORY_UNSUPPORTED')
    ) {
      /*
       * History limits must never turn a valid runtime write into data loss.
       * Oversized or NUL-bearing text remains writable; it is simply outside
       * the append-only text ledger, exactly like an explicitly binary write.
       */
      await input.writeCurrent();
      return { baselineCreated: false, historySkipped: true };
    }

    throw error;
  }

  return store.withSerializedMutation(lockKey(input.projectId, input.workspaceKey, path), async () => {
    const replay = await store.findFileVersionByOperation(input.projectId, input.workspaceKey, input.operationId);

    if (replay) {
      assertIdempotentReplay(replay, {
        path,
        operation,
        source: input.source,
        contentHash: desired.contentHash,
      });
      return { version: replay, baselineCreated: false, historySkipped: false };
    }

    let latest = await store.getLatestFileVersion(input.projectId, input.workspaceKey, path);
    if (latest?.tombstone) {
      latest = undefined;
    }
    const lineageId = latest?.lineageId ?? randomUUID();
    let baselineCreated = false;
    const current = await input.readCurrent();

    if (current && current.encoding !== 'base64') {
      let baseline: PreparedTextContent | undefined;

      try {
        baseline = prepareTextContent(current.content, current.encoding);
      } catch (error) {
        if (!(error instanceof FileHistoryError)) {
          throw error;
        }
        // An oversized/NUL-bearing existing file should not block replacing it
        // with a supported text file; it simply cannot become a history body.
      }

      if (baseline && baseline.contentHash !== desired.contentHash && latest?.contentHash !== baseline.contentHash) {
        const appendedBaseline = await appendPreparedVersion(store, {
          projectId: input.projectId,
          workspaceKey: input.workspaceKey,
          workspaceId: input.workspaceId,
          path,
          lineageId,
          operation: 'baseline',
          source: 'system',
          actorUserId: input.actorUserId,
          operationId: `${input.operationId}:baseline`,
          latest,
          prepared: baseline,
        });
        latest = appendedBaseline.version;
        baselineCreated = appendedBaseline.created;
      }
    }

    await input.writeCurrent();

    if (latest && !latest.tombstone && latest.contentHash === desired.contentHash) {
      return { version: latest, baselineCreated, historySkipped: false };
    }

    const appended = await appendPreparedVersion(store, {
      projectId: input.projectId,
      workspaceKey: input.workspaceKey,
      workspaceId: input.workspaceId,
      path,
      lineageId,
      operation,
      source: input.source,
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      latest,
      prepared: desired,
    });

    return { version: appended.version, baselineCreated, historySkipped: false };
  });
}

async function withPathLocks<T>(
  store: ApiStore,
  projectId: string,
  workspaceKey: string,
  paths: readonly string[],
  mutation: () => Promise<T>,
): Promise<T> {
  const keys = [...new Set(paths.map((path) => lockKey(projectId, workspaceKey, path)))].sort();

  return store.withSerializedMutations(keys, mutation);
}

async function preparedCurrent(
  read: () => Promise<{ content: string; encoding?: 'utf8' | 'base64' } | undefined>,
): Promise<PreparedTextContent | undefined> {
  const current = await read();

  if (!current || current.encoding === 'base64') {
    return undefined;
  }

  try {
    return prepareTextContent(current.content, current.encoding);
  } catch (error) {
    if (error instanceof FileHistoryError) {
      return undefined;
    }

    throw error;
  }
}

async function preparedFromVersion(store: ApiStore, version: FileVersionRecord | undefined) {
  if (!version) {
    return undefined;
  }

  const detail = await store.getFileVersion(version.projectId, version.workspaceKey, version.id);

  return detail ? prepareTextContent(decodeStoredText(detail)) : undefined;
}

/** Delete the real file first-class while retaining its last readable body as an immutable tombstone. */
export async function deleteTextFileWithHistory(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    workspaceId?: string;
    path: string;
    source: FileVersionSource;
    actorUserId?: string;
    operationId: string;
    readCurrent: () => Promise<{ content: string; encoding?: 'utf8' | 'base64' } | undefined>;
    deleteCurrent: () => Promise<unknown>;
  },
): Promise<{ version?: FileVersionRecord; created: boolean; historySkipped: boolean }> {
  validateScope(input.projectId, input.workspaceKey);
  validateOperationId(input.operationId);
  let path: string;

  try {
    path = normalizeFileHistoryPath(input.path);
  } catch (error) {
    if (error instanceof FileHistoryError && error.code === 'FILE_HISTORY_UNSUPPORTED') {
      await input.deleteCurrent();
      return { created: false, historySkipped: true };
    }

    throw error;
  }

  return withPathLocks(store, input.projectId, input.workspaceKey, [path], async () => {
    const replay = await store.findFileVersionByOperation(input.projectId, input.workspaceKey, input.operationId);

    if (replay) {
      assertIdempotentReplay(replay, {
        path,
        operation: 'delete',
        source: input.source,
        contentHash: replay.contentHash,
        tombstone: true,
      });
      return { version: replay, created: false, historySkipped: false };
    }

    let latest = await store.getLatestFileVersion(input.projectId, input.workspaceKey, path);

    if (latest?.tombstone) {
      await input.deleteCurrent();
      return { version: latest, created: false, historySkipped: false };
    }

    const current = await input.readCurrent();
    const currentExists = current !== undefined;
    let prepared: PreparedTextContent | undefined;

    if (current && current.encoding !== 'base64') {
      try {
        prepared = prepareTextContent(current.content, current.encoding);
      } catch (error) {
        if (!(error instanceof FileHistoryError)) {
          throw error;
        }
      }
    }

    const lineageId = latest?.lineageId ?? randomUUID();

    if (prepared && latest?.contentHash !== prepared.contentHash) {
      const baseline = await appendPreparedVersion(store, {
        ...input,
        path,
        lineageId,
        operation: 'baseline',
        source: 'system',
        operationId: `${input.operationId}:baseline`,
        latest,
        prepared,
      });
      latest = baseline.version;
    }

    /*
     * A retry can arrive after the filesystem delete succeeded but before its
     * tombstone committed. If a prior lineage exists and the file is already
     * absent, do not turn that recoverable retry into an agent ENOENT failure.
     */
    if (currentExists || !latest) {
      await input.deleteCurrent();
    }

    prepared ??= await preparedFromVersion(store, latest);

    if (!prepared) {
      return { created: false, historySkipped: true };
    }

    const appended = await appendPreparedVersion(store, {
      ...input,
      path,
      lineageId,
      operation: 'delete',
      tombstone: true,
      latest,
      prepared,
    });

    return { version: appended.version, created: appended.created, historySkipped: false };
  });
}

/** Preserve a file's lineage across a real filesystem rename. */
export async function renameTextFileWithHistory(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    workspaceId?: string;
    fromPath: string;
    toPath: string;
    source: FileVersionSource;
    actorUserId?: string;
    operationId: string;
    readSource: () => Promise<{ content: string; encoding?: 'utf8' | 'base64' } | undefined>;
    readDestination: () => Promise<{ content: string; encoding?: 'utf8' | 'base64' } | undefined>;
    renameCurrent: () => Promise<unknown>;
  },
): Promise<{ version?: FileVersionRecord; created: boolean; historySkipped: boolean }> {
  validateScope(input.projectId, input.workspaceKey);
  validateOperationId(input.operationId);
  let fromPath: string;
  let toPath: string;

  try {
    fromPath = normalizeFileHistoryPath(input.fromPath);
    toPath = normalizeFileHistoryPath(input.toPath);
  } catch (error) {
    if (error instanceof FileHistoryError && error.code === 'FILE_HISTORY_UNSUPPORTED') {
      await input.renameCurrent();
      return { created: false, historySkipped: true };
    }

    throw error;
  }

  if (fromPath === toPath) {
    throw new FileHistoryError('Rename source and destination must differ', {
      statusCode: 400,
      code: 'FILE_HISTORY_RENAME_INVALID',
    });
  }

  return withPathLocks(store, input.projectId, input.workspaceKey, [fromPath, toPath], async () => {
    const replay = await store.findFileVersionByOperation(input.projectId, input.workspaceKey, input.operationId);

    if (replay) {
      assertIdempotentReplay(replay, {
        path: toPath,
        operation: 'rename',
        source: input.source,
        contentHash: replay.contentHash,
        renamedFromPath: fromPath,
      });
      return { version: replay, created: false, historySkipped: false };
    }

    let latest = await store.getLatestFileVersion(input.projectId, input.workspaceKey, fromPath);
    let prepared = await preparedCurrent(input.readSource);
    const hadReadableSource = Boolean(prepared);
    const destinationBeforeRename = prepared ? undefined : await preparedCurrent(input.readDestination);
    const lineageId = latest && !latest.tombstone ? latest.lineageId : randomUUID();

    if (prepared && latest?.contentHash !== prepared.contentHash) {
      const baseline = await appendPreparedVersion(store, {
        projectId: input.projectId,
        workspaceKey: input.workspaceKey,
        workspaceId: input.workspaceId,
        path: fromPath,
        lineageId,
        operation: 'baseline',
        source: 'system',
        actorUserId: input.actorUserId,
        operationId: `${input.operationId}:baseline`,
        latest,
        prepared,
      });
      latest = baseline.version;
    }

    const alreadyApplied =
      !hadReadableSource &&
      Boolean(destinationBeforeRename && latest && destinationBeforeRename.contentHash === latest.contentHash);

    if (!alreadyApplied) {
      await input.renameCurrent();
    }
    prepared ??= destinationBeforeRename ?? (await preparedCurrent(input.readDestination));
    prepared ??= await preparedFromVersion(store, latest);

    if (!prepared) {
      return { created: false, historySkipped: true };
    }

    const appended = await appendPreparedVersion(store, {
      projectId: input.projectId,
      workspaceKey: input.workspaceKey,
      workspaceId: input.workspaceId,
      path: toPath,
      lineageId,
      operation: 'rename',
      source: input.source,
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      renamedFromPath: fromPath,
      latest,
      prepared,
    });

    return { version: appended.version, created: appended.created, historySkipped: false };
  });
}

/** Convert a native watcher delete into an explicit tombstone when prior text is known. */
export async function captureFileDeletion(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    workspaceId?: string;
    path: string;
    source: FileVersionSource;
    operationId: string;
  },
): Promise<{ version?: FileVersionRecord; created: boolean }> {
  validateScope(input.projectId, input.workspaceKey);
  validateOperationId(input.operationId);
  const path = normalizeFileHistoryPath(input.path);

  return withPathLocks(store, input.projectId, input.workspaceKey, [path], async () => {
    const replay = await store.findFileVersionByOperation(input.projectId, input.workspaceKey, input.operationId);

    if (replay) {
      return { version: replay, created: false };
    }

    const latest = await store.getLatestFileVersion(input.projectId, input.workspaceKey, path);

    if (!latest || latest.tombstone) {
      return { created: false };
    }

    const lineageLatest = await store.getLatestFileVersionByLineage(
      input.projectId,
      input.workspaceKey,
      latest.lineageId,
    );

    /* Echo of a synchronously-recorded rename: the lineage already moved away. */
    if (lineageLatest && lineageLatest.path !== path && lineageLatest.renamedFromPath === path) {
      return { version: lineageLatest, created: false };
    }

    const prepared = await preparedFromVersion(store, latest);

    if (!prepared) {
      return { created: false };
    }

    const appended = await appendPreparedVersion(store, {
      ...input,
      path,
      lineageId: latest.lineageId,
      operation: 'delete',
      tombstone: true,
      latest,
      prepared,
    });

    return { version: appended.version, created: appended.created };
  });
}

export async function recordFileHistoryWatchContinuity(
  store: ApiStore,
  input: {
    projectId: string;
    workspaceKey: string;
    sessionId: string;
    droppedEvents?: number;
    snapshotTruncated?: boolean;
    connectionTruncated?: boolean;
    lastSequence?: number;
    reason?: 'relay_overflow' | 'capture_failure';
    reconciledAt?: string;
  },
) {
  validateScope(input.projectId, input.workspaceKey);

  if (!input.sessionId || input.sessionId.length > 180 || CONTROL_CHARACTERS.test(input.sessionId)) {
    throw new FileHistoryError('File watcher session is invalid', {
      statusCode: 400,
      code: 'FILE_HISTORY_WATCH_SESSION_INVALID',
    });
  }

  const key = `file-history-watch:${createHash('sha256')
    .update(`${input.projectId}\0${input.workspaceKey}`)
    .digest('hex')}`;

  return store.withSerializedMutation(key, async () => {
    const existing = await store.getFileHistoryWatchState(input.projectId, input.workspaceKey);
    const reasons = new Set(existing?.reasons ?? []);
    const droppedEvents = Math.max(existing?.droppedEvents ?? 0, Math.max(0, input.droppedEvents ?? 0));
    const snapshotTruncated = Boolean(existing?.snapshotTruncated || input.snapshotTruncated);
    const connectionTruncated = Boolean(existing?.connectionTruncated || input.connectionTruncated);

    if (existing && existing.sessionId !== input.sessionId) {
      reasons.add('watcher_restart');
    }
    if (droppedEvents > 0) {
      reasons.add('journal_truncated');
    }
    if (snapshotTruncated) {
      reasons.add('snapshot_truncated');
    }
    if (connectionTruncated) {
      reasons.add('connection_truncated');
    }
    if (input.reason) {
      reasons.add(input.reason);
    }

    return store.upsertFileHistoryWatchState({
      projectId: input.projectId,
      workspaceKey: input.workspaceKey,
      sessionId: input.sessionId,
      complete: reasons.size === 0,
      reasons: [...reasons].sort(),
      droppedEvents,
      snapshotTruncated,
      connectionTruncated,
      lastSequence: input.lastSequence === undefined ? existing?.lastSequence : String(input.lastSequence),
      reconciledAt: input.reconciledAt ?? new Date().toISOString(),
    });
  });
}
