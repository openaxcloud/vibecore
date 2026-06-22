import { pipeline } from 'node:stream/promises';
import type { Readable, Writable } from 'node:stream';
import type { ObjectStorageClient } from './object-storage-snapshot-store.js';

/**
 * Concrete GCS adapter for the snapshot store's ObjectStorageClient port.
 *
 * Deliberately typed STRUCTURALLY against the slice of @google-cloud/storage we
 * use (Bucket.file(name) → { createWriteStream, createReadStream, exists, copy,
 * delete }) rather than importing the SDK. That keeps workspace-manager free of a
 * build-time dependency on the (large, native-ish) storage client while still
 * being a real, correct adapter: a live `new Storage().bucket(name)` satisfies
 * GcsBucketLike, and tests satisfy it with an in-memory fake — no cloud creds in
 * CI. server.ts dynamic-imports @google-cloud/storage at boot only when a bucket
 * is configured.
 */
export interface GcsFileLike {
  createWriteStream(): Writable;
  createReadStream(): Readable;
  exists(): Promise<[boolean]>;
  copy(destination: GcsFileLike): Promise<unknown>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
}

export interface GcsBucketLike {
  file(name: string): GcsFileLike;
}

export function createGcsObjectStorageClient(bucket: GcsBucketLike): ObjectStorageClient {
  return {
    async put(key: string, body: Readable): Promise<void> {
      await pipeline(body, bucket.file(key).createWriteStream());
    },

    async get(key: string): Promise<Readable | undefined> {
      const file = bucket.file(key);
      const [exists] = await file.exists();

      return exists ? file.createReadStream() : undefined;
    },

    async exists(key: string): Promise<boolean> {
      const [exists] = await bucket.file(key).exists();

      return exists;
    },

    async copy(sourceKey: string, targetKey: string): Promise<void> {
      await bucket.file(sourceKey).copy(bucket.file(targetKey));
    },

    async delete(key: string): Promise<void> {
      // ignoreNotFound so delete is idempotent (matches the store contract).
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
  };
}
