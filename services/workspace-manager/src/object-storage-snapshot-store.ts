import { Readable } from 'node:stream';
import { assertSafeWorkspaceId, type WorkspaceSnapshotStore } from './snapshot-store.js';

/**
 * Minimal object-storage port the snapshot store needs. Both GCS and S3 satisfy
 * it with a thin adapter, so the store stays backend-agnostic and unit-testable
 * against an in-memory fake (no cloud creds in CI). This is the "keep the Repl's
 * filesystem in object storage" half of the Replit-style decoupling.
 *
 * GCS adapter sketch (when @google-cloud/storage is available):
 *   const bucket = new Storage().bucket(name);
 *   const client: ObjectStorageClient = {
 *     put: (key, body) => pipeline(body, bucket.file(key).createWriteStream()),
 *     get: async (key) => (await bucket.file(key).exists())[0] ? bucket.file(key).createReadStream() : undefined,
 *     exists: async (key) => (await bucket.file(key).exists())[0],
 *     copy: (src, dst) => bucket.file(src).copy(bucket.file(dst)).then(() => undefined),
 *     delete: (key) => bucket.file(key).delete({ ignoreNotFound: true }).then(() => undefined),
 *   };
 */
export interface ObjectStorageClient {
  put(key: string, body: Readable): Promise<void>;
  get(key: string): Promise<Readable | undefined>;
  exists(key: string): Promise<boolean>;
  copy(sourceKey: string, targetKey: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Snapshot store backed by an object-storage bucket. Each workspace's archive is
 * a single object at `<prefix>/<workspaceId>.tar.gz`. Streams throughout, so a
 * node_modules-sized workspace never lands on the heap, and `fork` is a cheap
 * server-side object copy.
 */
export class ObjectStorageSnapshotStore implements WorkspaceSnapshotStore {
  constructor(
    private readonly client: ObjectStorageClient,
    private readonly keyPrefix = 'workspace-snapshots',
  ) {}

  private keyFor(workspaceId: string): string {
    assertSafeWorkspaceId(workspaceId);

    return `${this.keyPrefix.replace(/\/+$/, '')}/${workspaceId}.tar.gz`;
  }

  async saveStream(workspaceId: string, archive: Readable): Promise<void> {
    await this.client.put(this.keyFor(workspaceId), archive);
  }

  async restoreStream(workspaceId: string): Promise<Readable | undefined> {
    return this.client.get(this.keyFor(workspaceId));
  }

  async has(workspaceId: string): Promise<boolean> {
    return this.client.exists(this.keyFor(workspaceId));
  }

  async fork(sourceWorkspaceId: string, targetWorkspaceId: string): Promise<void> {
    if (!(await this.has(sourceWorkspaceId))) {
      throw new Error(`Cannot fork: no snapshot for source workspace ${sourceWorkspaceId}`);
    }

    await this.client.copy(this.keyFor(sourceWorkspaceId), this.keyFor(targetWorkspaceId));
  }

  async remove(workspaceId: string): Promise<void> {
    await this.client.delete(this.keyFor(workspaceId));
  }
}
