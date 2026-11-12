import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { CRC32C, type Storage } from '@google-cloud/storage';
import { planRestoreWalInventory, type WalInventoryInput } from './database-restore-wal-inventory.js';

export interface WalByteReader {
  open(bucket: string, name: string, generation: string): Readable;
}

/** Pin the object generation and disable transparent transport decompression. */
export function gcsWalByteReader(storage: Pick<Storage, 'bucket'>): WalByteReader {
  return {
    open(bucket, name, generation) {
      return storage
        .bucket(bucket)
        .file(name, { generation })
        .createReadStream({ validation: 'crc32c', decompress: false });
    },
  };
}

export class RestoreWalBytesError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface WalObjectIdentity {
  name: string;
  generation: string;
  size: string;
  crc32c: string;
}

/**
 * Materialize ONE bounded segment in an owned temporary directory, invoke an
 * isolated inspector, and always clean up. This verifies transfer/gzip integrity,
 * NOT PostgreSQL record CRCs, system identity, timeline history or PITR replay.
 * Nothing here can produce the coordinator's ArchiveReceipt or enable cutover.
 */
export async function withVerifiedWalBytes<T>(
  reader: WalByteReader,
  planInput: WalInventoryInput,
  objectInput: WalObjectIdentity,
  inspect: (path: string) => Promise<T>,
  signal?: AbortSignal,
) {
  const input = { ...planInput };
  const object = { ...objectInput };
  const plan = planRestoreWalInventory(input);

  if (
    input.walSegmentSizeBytes > 64 * 1024 * 1024 ||
    !plan.objects.includes(object.name) ||
    !/^[1-9][0-9]{0,19}$/.test(object.generation) ||
    !/^[1-9][0-9]{0,9}$/.test(object.size) ||
    Number(object.size) > input.walSegmentSizeBytes * 2 ||
    !/^[A-Za-z0-9+/]{6}==$/.test(object.crc32c) ||
    Buffer.from(object.crc32c, 'base64').toString('base64') !== object.crc32c
  ) {
    throw new RestoreWalBytesError('RESTORE_WAL_BYTES_IDENTITY_INVALID');
  }

  signal?.throwIfAborted();

  const directory = await mkdtemp(join(tmpdir(), 'vibecore-verified-wal-'));
  const path = join(directory, 'segment.wal');
  const checksum = new CRC32C();
  const compressedHash = createHash('sha256');
  const expandedHash = createHash('sha256');

  let compressedBytes = 0;
  let expandedBytes = 0;

  const compressed = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      compressedBytes += chunk.length;

      if (compressedBytes > Number(object.size)) {
        callback(new RestoreWalBytesError('RESTORE_WAL_COMPRESSED_SIZE_MISMATCH'));
        return;
      }

      checksum.update(chunk);
      compressedHash.update(chunk);
      callback(null, chunk);
    },
  });
  const expanded = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      expandedBytes += chunk.length;

      if (expandedBytes > input.walSegmentSizeBytes) {
        callback(new RestoreWalBytesError('RESTORE_WAL_EXPANDED_SIZE_MISMATCH'));
        return;
      }

      expandedHash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    try {
      const deadline = AbortSignal.timeout(120_000);
      await pipeline(
        reader.open(plan.bucket, object.name, object.generation),
        compressed,
        createGunzip(),
        expanded,
        createWriteStream(path, { flags: 'wx', mode: 0o600 }),
        { signal: signal ? AbortSignal.any([signal, deadline]) : deadline },
      );
    } catch (error) {
      if (error instanceof RestoreWalBytesError) {
        throw error;
      }

      throw new RestoreWalBytesError('RESTORE_WAL_BYTES_UNAVAILABLE');
    }

    if (
      compressedBytes !== Number(object.size) ||
      expandedBytes !== input.walSegmentSizeBytes ||
      checksum.toString() !== object.crc32c
    ) {
      throw new RestoreWalBytesError('RESTORE_WAL_BYTES_INTEGRITY_MISMATCH');
    }

    signal?.throwIfAborted();

    const result = await inspect(path);

    return {
      result,
      evidence: {
        sourceUid: input.sourceUid,
        provenanceId: input.provenanceId,
        bucket: plan.bucket,
        name: object.name,
        generation: object.generation,
        compressedBytes,
        expandedBytes,
        compressedSha256: compressedHash.digest('hex'),
        expandedSha256: expandedHash.digest('hex'),
        transportIntegrityVerified: true as const,
        archiveVerified: false as const,
        walContinuityVerified: false as const,
      },
    };
  } finally {
    // Only the freshly allocated owned directory is removed, never a caller path.
    await rm(directory, { recursive: true, force: true });
  }
}
