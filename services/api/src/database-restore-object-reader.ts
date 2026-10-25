import { createHash } from 'node:crypto';
import type { Storage } from '@google-cloud/storage';

export class RestoreObjectReadError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Read-only adapter over the existing GCS SDK. Never creates buckets or credentials.
 * Configuration and expected receipts must come from a trusted archive inventory.
 * This bounded reader is suitable for metadata/WAL objects, not unbounded base tarballs.
 */
export function createRestoreObjectReader(
  storage: Pick<Storage, 'bucket'>,
  scope: { bucket: string; projectId: string; serverName: string },
) {
  if (
    !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(scope.bucket) ||
    !/^[a-zA-Z0-9_-]+$/.test(scope.projectId) ||
    !/^[a-zA-Z0-9_-]+$/.test(scope.serverName)
  ) {
    throw new RestoreObjectReadError('RESTORE_OBJECT_SCOPE_INVALID');
  }
  const prefix = `db/${scope.projectId}/${scope.serverName}/`;
  return async (expected: { key: string; generation: string; size: number; sha256: string }): Promise<Buffer> => {
    if (
      !expected.key.startsWith(prefix) ||
      expected.key.length > 1024 ||
      expected.key.slice(prefix.length).length === 0 ||
      expected.key.split('/').some((part) => !part || part === '.' || part === '..') ||
      expected.key.includes('\\') ||
      /[\x00-\x1f\x7f]/.test(expected.key) ||
      !/^[1-9][0-9]*$/.test(expected.generation) ||
      !Number.isSafeInteger(Number(expected.generation)) ||
      !/^[a-f0-9]{64}$/.test(expected.sha256) ||
      !Number.isSafeInteger(expected.size) ||
      expected.size < 1 ||
      expected.size > 64 * 1024 * 1024
    ) {
      throw new RestoreObjectReadError('RESTORE_OBJECT_EXPECTATION_INVALID');
    }
    try {
      // The installed SDK coerces generation to Number; unsafe integers are rejected above.
      const file = storage.bucket(scope.bucket).file(expected.key, { generation: expected.generation });
      const stream = file.createReadStream({ validation: 'crc32c', decompress: false });
      const chunks: Buffer[] = [];
      let size = 0;
      const hash = createHash('sha256');
      try {
        for await (const chunk of stream) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          if (size > expected.size) throw new RestoreObjectReadError('RESTORE_OBJECT_SIZE_MISMATCH');
          hash.update(bytes);
          chunks.push(bytes);
        }
      } finally {
        stream.destroy();
      }
      if (size !== expected.size) throw new RestoreObjectReadError('RESTORE_OBJECT_SIZE_MISMATCH');
      if (hash.digest('hex') !== expected.sha256) throw new RestoreObjectReadError('RESTORE_OBJECT_DIGEST_MISMATCH');
      return Buffer.concat(chunks, size);
    } catch (error) {
      throw error instanceof RestoreObjectReadError ? error : new RestoreObjectReadError('RESTORE_OBJECT_READ_FAILED');
    }
  };
}
