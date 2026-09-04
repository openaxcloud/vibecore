export type FileHistoryOperation = 'write' | 'create' | 'delete' | 'rename' | 'restore';

export type FileHistorySource = 'editor' | 'agent' | 'terminal' | 'import' | 'external' | 'system';

export type FileHistoryEncoding = 'utf8' | 'base64';

export interface FileHistoryActor {
  id: string;
  name?: string;
}

/**
 * Immutable metadata for one durable file revision.
 *
 * This deliberately does not reuse `types/actions.ts::FileHistory`: that older
 * type describes the transient diff-review buffer, while these revisions are
 * append-only records returned by the File History API.
 */
export interface FileHistoryVersion {
  id: string;
  workspaceId: string;
  path: string;

  /** Canonical database order. Timestamps are display metadata, never ordering keys. */
  sequence: string;
  operation: FileHistoryOperation;
  source: FileHistorySource;
  actor?: FileHistoryActor;
  encoding: FileHistoryEncoding;
  sizeBytes: number;
  contentHash: string;
  restoredFromVersionId?: string;
  renamedFromPath?: string;
  tombstone: boolean;
  createdAt: string;
}

export interface FileHistoryContinuity {
  complete: boolean;
  reasons: string[];
  droppedEvents: number;
  snapshotTruncated?: boolean;
  connectionTruncated?: boolean;
  reconciledAt?: string;
}

export interface FileHistoryListResponse {
  versions: FileHistoryVersion[];
  latestVersionId?: string;
  nextCursor?: string;
  total: number;
  continuity: FileHistoryContinuity;
}

export interface FileHistoryDetailResponse {
  version: FileHistoryVersion;
  content: string;
}

export interface FileHistoryRestoreRequest {
  workspaceId: string;
  expectedLatestVersionId: string;
  operationId: string;
}

export interface FileHistoryRestoreResponse {
  version: FileHistoryVersion;
  restored: true;
}

export type FileHistoryErrorCode =
  | 'AUTH_REQUIRED'
  | 'FILE_HISTORY_ABORTED'
  | 'FILE_HISTORY_CONFLICT'
  | 'FILE_HISTORY_INVALID_RESPONSE'
  | 'FILE_HISTORY_PATH_INVALID'
  | 'FILE_HISTORY_TIMEOUT'
  | 'FILE_HISTORY_TOO_LARGE'
  | 'FILE_HISTORY_UNAVAILABLE'
  | 'FILE_HISTORY_UNSUPPORTED'
  | 'FILE_HISTORY_VERSION_NOT_FOUND'
  | 'PROJECT_ROLE_READ_ONLY'
  | 'RBAC_FORBIDDEN'
  | (string & {});

export interface FileHistoryErrorPayload {
  error?: string;
  message?: string;
  code?: FileHistoryErrorCode;
  latestVersionId?: string;
}

export interface FileHistoryTarget {
  projectId: string;
  workspaceId: string;
  filePath: string;
}

export interface FileHistoryListOptions extends FileHistoryTarget {
  cursor?: string;
  limit?: number;
}
