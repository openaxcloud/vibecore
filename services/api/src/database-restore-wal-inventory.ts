import { RestoreArchiveVerificationError } from './database-restore-archive.js';
import { createHash } from 'node:crypto';
import { requiredWalSegments } from './database-restore-wal.js';

type ObjectReceipt = { key: string; generation: string; size: number; sha256: string };
type Interval = Parameters<typeof requiredWalSegments>[0];

/**
 * Verify every object of an exact same-timeline LSN interval. The mapping from
 * segment to immutable object MUST come from a trusted, scoped archive inventory;
 * a bucket listing or application-provided mapping is not that authority.
 * readObject must be the operation's project/server-scoped reader. This checks
 * stored bytes (possibly compressed), NOT WAL records, replay or a PITR target.
 * No staging, consumer fencing, cutover or cloud capability is enabled here.
 */
export async function verifyWalObjectInventory(
  interval: Interval,
  inventory: readonly { segment: string; object: ObjectReceipt }[],
  readObject: (expected: ObjectReceipt) => Promise<Uint8Array>,
) {
  const required = requiredWalSegments(interval);
  if (inventory.length !== required.length) throw new RestoreArchiveVerificationError('RESTORE_WAL_INVENTORY_INVALID');
  // Copy before the first await: caller mutation cannot change an admitted plan.
  const entries = inventory.map(({ segment, object }) => ({
    segment,
    object: { key: object.key, generation: object.generation, size: object.size, sha256: object.sha256 },
  }));
  const bySegment = new Map(entries.map((entry) => [entry.segment, entry]));
  const keys = new Set(entries.map((entry) => entry.object.key));
  if (
    entries.length !== required.length ||
    bySegment.size !== entries.length ||
    keys.size !== entries.length ||
    required.some((segment) => !bySegment.has(segment)) ||
    entries.some(
      ({ object }) =>
        !object.key ||
        !/^[1-9][0-9]*$/.test(object.generation) ||
        !Number.isSafeInteger(Number(object.generation)) ||
        !Number.isSafeInteger(object.size) ||
        object.size < 1 ||
        object.size > 64 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(object.sha256),
    )
  )
    throw new RestoreArchiveVerificationError('RESTORE_WAL_INVENTORY_INVALID');

  const verified = [];
  for (const segment of required) {
    const expected = bySegment.get(segment)!.object;
    let bytes: Uint8Array;
    try {
      bytes = await readObject({ ...expected });
    } catch {
      throw new RestoreArchiveVerificationError('RESTORE_WAL_OBJECT_READ_FAILED');
    }
    if (bytes.byteLength !== expected.size || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) {
      throw new RestoreArchiveVerificationError('RESTORE_WAL_OBJECT_MISMATCH');
    }
    verified.push({ segment, ...expected });
  }
  return {
    objects: verified,
    storedBytesVerified: true as const,
    walRecordsVerified: false as const,
    targetReached: false as const,
  };
}
