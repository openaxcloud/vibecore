import { open } from 'node:fs/promises';
import { withVerifiedWalBytes, type WalByteReader, type WalObjectIdentity } from './database-restore-wal-bytes.js';
import { planRestoreWalInventory, type WalInventoryInput } from './database-restore-wal-inventory.js';

export class RestoreWalHeaderError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Expected identity comes from verified backup/control data, never from this WAL. */
export interface Postgres16WalIdentity {
  systemIdentifier: string;
  walBlockSizeBytes: 8192;
}

/**
 * PostgreSQL 16 XLogLongPageHeaderData (access/xlog_internal.h), 40 bytes.
 * Header identity is necessary but NOT sufficient: it does not authenticate a
 * record, verify page/record CRCs, timeline history, or prove recovery to a time.
 */
export function verifyPostgres16WalHeader(
  header: Buffer,
  plan: WalInventoryInput,
  objectName: string,
  identity: Postgres16WalIdentity,
) {
  const inventory = planRestoreWalInventory(plan);

  if (
    !inventory.objects.includes(objectName) ||
    !/^[1-9][0-9]{0,19}$/.test(identity.systemIdentifier) ||
    BigInt(identity.systemIdentifier) > 0xffffffffffffffffn ||
    identity.walBlockSizeBytes !== 8192
  ) {
    throw new RestoreWalHeaderError('RESTORE_WAL_EXPECTED_IDENTITY_INVALID');
  }

  if (header.length !== 40) {
    throw new RestoreWalHeaderError('RESTORE_WAL_HEADER_INVALID');
  }

  // Different major versions have different magic; do not reinterpret them.
  const littleEndian = header.readUInt16LE(0) === 0xd113;

  if (!littleEndian && header.readUInt16BE(0) !== 0xd113) {
    throw new RestoreWalHeaderError('RESTORE_WAL_HEADER_VERSION_UNSUPPORTED');
  }

  const u16 = (offset: number) => (littleEndian ? header.readUInt16LE(offset) : header.readUInt16BE(offset));
  const u32 = (offset: number) => (littleEndian ? header.readUInt32LE(offset) : header.readUInt32BE(offset));
  const u64 = (offset: number) => (littleEndian ? header.readBigUInt64LE(offset) : header.readBigUInt64BE(offset));
  const segment = objectName.slice(-27, -3);

  const address =
    BigInt(`0x${segment.slice(8, 16)}`) * 0x100000000n +
    BigInt(`0x${segment.slice(16)}`) * BigInt(plan.walSegmentSizeBytes);

  if (
    (u16(2) & 0x0002) === 0 || // XLP_LONG_HEADER
    (u16(2) & ~0x000f) !== 0 || // Reject flags unknown to PostgreSQL 16.
    u32(4) !== Number.parseInt(segment.slice(0, 8), 16) ||
    u64(8) !== address ||
    u64(24).toString() !== identity.systemIdentifier ||
    u32(32) !== plan.walSegmentSizeBytes ||
    u32(36) !== identity.walBlockSizeBytes
  ) {
    throw new RestoreWalHeaderError('RESTORE_WAL_HEADER_IDENTITY_MISMATCH');
  }

  return {
    postgresMajorVersion: 16 as const,
    byteOrder: littleEndian ? ('little-endian' as const) : ('big-endian' as const),
    systemIdentifier: identity.systemIdentifier,
    segment,
    headerIdentityVerified: true as const,
    walRecordsVerified: false as const,
    archiveVerified: false as const,
    walContinuityVerified: false as const,
  };
}

/** Generation-pinned transport + native header identity, still not an ArchiveReceipt. */
export async function withVerifiedPostgres16WalBytes<T>(
  reader: WalByteReader,
  planInput: WalInventoryInput,
  objectInput: WalObjectIdentity,
  identityInput: Postgres16WalIdentity,
  inspect: (path: string, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
) {
  const plan = { ...planInput };
  const object = { ...objectInput };
  const identity = { ...identityInput };

  return withVerifiedWalBytes(
    reader,
    plan,
    object,
    async (path, cancellation) => {
      const handle = await open(path, 'r');
      const header = Buffer.alloc(40);

      try {
        const { bytesRead } = await handle.read(header, 0, 40, 0);

        if (bytesRead !== 40) {
          throw new RestoreWalHeaderError('RESTORE_WAL_HEADER_INVALID');
        }
      } finally {
        await handle.close();
      }

      const headerEvidence = verifyPostgres16WalHeader(header, plan, object.name, identity);
      cancellation.throwIfAborted();

      return { headerEvidence, inspection: await inspect(path, cancellation) };
    },
    signal,
  );
}
