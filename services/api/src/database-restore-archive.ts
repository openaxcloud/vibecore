import { createHash } from 'node:crypto';

/** Implemented by a trusted worker, never by an application-supplied command. */
export interface PostgresArchiveTools {
  readManifest(): Promise<Uint8Array>;
  /** pg_verifybackup with WAL parsing enabled; reject on any nonzero exit. */
  verifyBackup(): Promise<void>;
  /** pg_controldata under LC_ALL=C, against the SAME staged backup. */
  readControlData(): Promise<string>;
}

export class RestoreArchiveVerificationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const lsn = (value: unknown): bigint | undefined => {
  if (typeof value !== 'string' || !/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/i.test(value)) return undefined;
  const [high, low] = value.split('/');
  return (BigInt(`0x${high}`) << 32n) + BigInt(`0x${low}`);
};

/**
 * Verifies a staged physical base backup plus the WAL needed to make that backup
 * consistent. This does NOT attest WAL coverage to an arbitrary PITR timestamp,
 * cloud provenance, application rows, target identity, or distributed fencing.
 * The worker must own an immutable staging directory until target preparation;
 * re-reading the manifest detects drift, not arbitrary post-verification writes.
 */
export async function verifyPostgresBaseBackup(
  tools: PostgresArchiveTools,
  expected: {
    manifestSha256: string;
    systemIdentifier: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(expected.manifestSha256) || !/^\d+$/.test(expected.systemIdentifier)) {
    throw new RestoreArchiveVerificationError('RESTORE_ARCHIVE_EXPECTATION_INVALID');
  }
  try {
    const before = await tools.readManifest();
    if (digest(before) !== expected.manifestSha256)
      throw new RestoreArchiveVerificationError('RESTORE_ARCHIVE_MANIFEST_MISMATCH');
    const manifest = object(JSON.parse(new TextDecoder().decode(before)));
    const version = manifest['PostgreSQL-Backup-Manifest-Version'];
    if (version !== 1) throw new RestoreArchiveVerificationError('RESTORE_ARCHIVE_MANIFEST_UNSUPPORTED');
    const ranges = manifest['WAL-Ranges'];
    if (!Array.isArray(ranges) || ranges.length === 0)
      throw new RestoreArchiveVerificationError('RESTORE_ARCHIVE_WAL_RANGE_INVALID');
    const walRanges = ranges.map((value) => {
      const range = object(value);
      const start = lsn(range['Start-LSN']);
      const end = lsn(range['End-LSN']);
      if (
        !Number.isSafeInteger(range.Timeline) ||
        (range.Timeline as number) <= 0 ||
        (range.Timeline as number) > 0xffffffff ||
        start === undefined ||
        end === undefined ||
        end <= start
      ) {
        throw new RestoreArchiveVerificationError('RESTORE_ARCHIVE_WAL_RANGE_INVALID');
      }
      return {
        timeline: range.Timeline as number,
        startLsn: range['Start-LSN'] as string,
        endLsn: range['End-LSN'] as string,
      };
    });
    await tools.verifyBackup();
    const control = await tools.readControlData();
    const identity = /^Database system identifier:\s+(\d+)\s*$/m.exec(control)?.[1];
    if (identity !== expected.systemIdentifier) {
      throw new RestoreArchiveVerificationError('RESTORE_ARCHIVE_SYSTEM_MISMATCH');
    }
    if (digest(await tools.readManifest()) !== expected.manifestSha256)
      throw new RestoreArchiveVerificationError('RESTORE_ARCHIVE_MANIFEST_CHANGED');
    return {
      manifestSha256: expected.manifestSha256,
      systemIdentifier: identity,
      manifestVersion: version,
      walRanges,
      baseBackupVerified: true as const,
      pitrCoverageVerified: false as const,
    };
  } catch (error) {
    // Never propagate a command, URI, archive contents or provider diagnostic.
    throw error instanceof RestoreArchiveVerificationError
      ? error
      : new RestoreArchiveVerificationError('RESTORE_ARCHIVE_VERIFICATION_FAILED');
  }
}
