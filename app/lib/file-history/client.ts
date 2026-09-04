import type {
  FileHistoryDetailResponse,
  FileHistoryErrorCode,
  FileHistoryErrorPayload,
  FileHistoryListOptions,
  FileHistoryListResponse,
  FileHistoryRestoreRequest,
  FileHistoryRestoreResponse,
  FileHistoryTarget,
  FileHistoryVersion,
} from './types';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 100;

export class FileHistoryApiError extends Error {
  readonly status: number;
  readonly code: FileHistoryErrorCode;
  readonly latestVersionId?: string;

  constructor(
    message: string,
    options: { status: number; code: FileHistoryErrorCode; latestVersionId?: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = 'FileHistoryApiError';
    this.status = options.status;
    this.code = options.code;
    this.latestVersionId = options.latestVersionId;
  }
}

export interface FileHistoryClient {
  listVersions(options: FileHistoryListOptions, signal?: AbortSignal): Promise<FileHistoryListResponse>;
  getVersion(target: FileHistoryTarget, versionId: string, signal?: AbortSignal): Promise<FileHistoryDetailResponse>;
  restoreVersion(
    target: FileHistoryTarget,
    versionId: string,
    request: FileHistoryRestoreRequest,
    signal?: AbortSignal,
  ): Promise<FileHistoryRestoreResponse>;
}

export interface CreateFileHistoryClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createFileHistoryClient(options: CreateFileHistoryClientOptions = {}): FileHistoryClient {
  const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async listVersions(listOptions, signal) {
      const path = normalizeFileHistoryPath(listOptions.filePath);

      const search = new URLSearchParams({
        workspaceId: listOptions.workspaceId,
        path,
        limit: String(listOptions.limit ?? DEFAULT_PAGE_SIZE),
      });

      if (listOptions.cursor) {
        search.set('cursor', listOptions.cursor);
      }

      const payload = await requestJson(
        fetchImpl,
        `/api/projects/${encodeURIComponent(listOptions.projectId)}/file-history?${search.toString()}`,
        { method: 'GET' },
        signal,
        timeoutMs,
      );

      return parseListResponse(payload);
    },

    async getVersion(target, versionId, signal) {
      const search = new URLSearchParams({ workspaceId: target.workspaceId });

      const payload = await requestJson(
        fetchImpl,
        `/api/projects/${encodeURIComponent(target.projectId)}/file-history/${encodeURIComponent(
          versionId,
        )}?${search.toString()}`,
        { method: 'GET' },
        signal,
        timeoutMs,
      );

      return parseDetailResponse(payload);
    },

    async restoreVersion(target, versionId, request, signal) {
      const payload = await requestJson(
        fetchImpl,
        `/api/projects/${encodeURIComponent(target.projectId)}/file-history/${encodeURIComponent(versionId)}/restore`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        },
        signal,
        timeoutMs,
      );

      const record = requireRecord(payload, 'restore response');

      if (record.restored !== true) {
        throw invalidResponse('The restore response did not confirm the new version.');
      }

      return { version: parseVersion(record.version), restored: true };
    },
  };
}

export function normalizeFileHistoryPath(filePath: string): string {
  const normalized = filePath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/home\/project(?:\/|$)/, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');

  if (!normalized || normalized.split('/').some((segment) => segment === '..')) {
    throw new FileHistoryApiError('Choose a valid project file before opening history.', {
      status: 400,
      code: 'FILE_HISTORY_PATH_INVALID',
    });
  }

  return normalized;
}

export function createFileHistoryOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `file-history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function requestJson(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();

  let timedOut = false;

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const response = await fetchImpl(input, {
      ...init,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...init.headers,
      },
      signal: controller.signal,
    });

    const payload = await readJsonSafely(response);

    if (!response.ok) {
      const errorPayload = isRecord(payload) ? (payload as FileHistoryErrorPayload) : undefined;

      throw new FileHistoryApiError(
        errorPayload?.error ?? errorPayload?.message ?? `File History request failed (${response.status}).`,
        {
          status: response.status,
          code: errorPayload?.code ?? 'FILE_HISTORY_UNAVAILABLE',
          latestVersionId: errorPayload?.latestVersionId,
        },
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof FileHistoryApiError) {
      throw error;
    }

    if (timedOut) {
      throw new FileHistoryApiError('File History took too long to respond. Try again.', {
        status: 408,
        code: 'FILE_HISTORY_TIMEOUT',
        cause: error,
      });
    }

    if (callerSignal?.aborted) {
      throw new FileHistoryApiError('File History request was cancelled.', {
        status: 0,
        code: 'FILE_HISTORY_ABORTED',
        cause: error,
      });
    }

    throw new FileHistoryApiError(error instanceof Error ? error.message : 'File History is unavailable.', {
      status: 503,
      code: 'FILE_HISTORY_UNAVAILABLE',
      cause: error,
    });
  } finally {
    globalThis.clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw invalidResponse('File History returned malformed JSON.', error);
  }
}

function parseListResponse(payload: unknown): FileHistoryListResponse {
  const record = requireRecord(payload, 'history response');

  if (!Array.isArray(record.versions)) {
    throw invalidResponse('File History returned an invalid versions list.');
  }

  const total = requireNumber(record.total, 'total');

  return {
    versions: record.versions.map((version) => parseVersion(version)),
    latestVersionId: optionalString(record.latestVersionId, 'latestVersionId'),
    nextCursor: optionalString(record.nextCursor, 'nextCursor'),
    total,
    continuity: parseContinuity(record.continuity),
  };
}

function parseContinuity(payload: unknown): FileHistoryListResponse['continuity'] {
  const record = requireRecord(payload, 'history continuity');

  if (!Array.isArray(record.reasons) || record.reasons.some((reason) => typeof reason !== 'string')) {
    throw invalidResponse('File History returned invalid continuity reasons.');
  }

  return {
    complete: requireBoolean(record.complete, 'continuity.complete'),
    reasons: record.reasons as string[],
    droppedEvents: requireNumber(record.droppedEvents, 'continuity.droppedEvents'),
    snapshotTruncated: optionalBoolean(record.snapshotTruncated, 'continuity.snapshotTruncated'),
    connectionTruncated: optionalBoolean(record.connectionTruncated, 'continuity.connectionTruncated'),
    reconciledAt: optionalString(record.reconciledAt, 'continuity.reconciledAt'),
  };
}

function parseDetailResponse(payload: unknown): FileHistoryDetailResponse {
  const record = requireRecord(payload, 'version response');

  return {
    version: parseVersion(record.version),
    content: requireString(record.content, 'content'),
  };
}

function parseVersion(payload: unknown): FileHistoryVersion {
  const record = requireRecord(payload, 'file history version');
  const operation = requireString(record.operation, 'operation');
  const source = requireString(record.source, 'source');
  const encoding = requireString(record.encoding, 'encoding');

  if (!['write', 'create', 'delete', 'rename', 'restore'].includes(operation)) {
    throw invalidResponse(`Unknown File History operation: ${operation}.`);
  }

  if (!['editor', 'agent', 'terminal', 'import', 'external', 'system'].includes(source)) {
    throw invalidResponse(`Unknown File History source: ${source}.`);
  }

  if (encoding !== 'utf8' && encoding !== 'base64') {
    throw invalidResponse(`Unknown File History encoding: ${encoding}.`);
  }

  const actorRecord = record.actor === undefined ? undefined : requireRecord(record.actor, 'actor');

  return {
    id: requireString(record.id, 'id'),
    workspaceId: requireString(record.workspaceId, 'workspaceId'),
    path: requireString(record.path, 'path'),
    sequence: requireSequence(record.sequence),
    operation: operation as FileHistoryVersion['operation'],
    source: source as FileHistoryVersion['source'],
    actor: actorRecord
      ? {
          id: requireString(actorRecord.id, 'actor.id'),
          name: optionalString(actorRecord.name, 'actor.name'),
        }
      : undefined,
    encoding,
    sizeBytes: requireNumber(record.sizeBytes, 'sizeBytes'),
    contentHash: requireString(record.contentHash, 'contentHash'),
    restoredFromVersionId: optionalString(record.restoredFromVersionId, 'restoredFromVersionId'),
    renamedFromPath: optionalString(record.renamedFromPath, 'renamedFromPath'),
    tombstone: requireBoolean(record.tombstone, 'tombstone'),
    createdAt: requireString(record.createdAt, 'createdAt'),
  };
}

function requireSequence(value: unknown): string {
  const sequence = requireString(value, 'sequence');

  if (!/^\d+$/.test(sequence) || BigInt(sequence) < 1n) {
    throw invalidResponse('File History returned an invalid sequence.');
  }

  return sequence;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidResponse(`File History returned an invalid ${label}.`);
  }

  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw invalidResponse(`File History response is missing ${label}.`);
  }

  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw invalidResponse(`File History response is missing ${label}.`);
  }

  return value;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  return value === undefined ? undefined : requireBoolean(value, label);
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requireString(value, label);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw invalidResponse(`File History response has an invalid ${label}.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalidResponse(message: string, cause?: unknown): FileHistoryApiError {
  return new FileHistoryApiError(message, {
    status: 502,
    code: 'FILE_HISTORY_INVALID_RESPONSE',
    cause,
  });
}
