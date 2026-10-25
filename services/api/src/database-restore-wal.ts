import { RestoreArchiveVerificationError } from './database-restore-archive.js';
/** PostgreSQL WAL filenames required by a known, same-timeline, half-open LSN
 * interval. This does not map a wall-clock target to an LSN or prove replay.
 * Timeline changes require history validation and are deliberately not inferred.
 */
export function requiredWalSegments(input: {
  timeline: number;
  startLsn: string;
  endLsn: string;
  segmentBytes: number;
}) {
  const parse = (value: string) => {
    if (!/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/i.test(value))
      throw new RestoreArchiveVerificationError('RESTORE_WAL_LSN_INVALID');
    const [high, low] = value.split('/');
    return (BigInt(`0x${high}`) << 32n) + BigInt(`0x${low}`);
  };
  if (
    !Number.isSafeInteger(input.timeline) ||
    input.timeline < 1 ||
    input.timeline > 0xffffffff ||
    !Number.isSafeInteger(input.segmentBytes) ||
    input.segmentBytes < 1024 * 1024 ||
    input.segmentBytes > 1024 * 1024 * 1024 ||
    (input.segmentBytes & (input.segmentBytes - 1)) !== 0
  ) {
    throw new RestoreArchiveVerificationError('RESTORE_WAL_GEOMETRY_INVALID');
  }
  const start = parse(input.startLsn);
  const end = parse(input.endLsn);
  if (end <= start) throw new RestoreArchiveVerificationError('RESTORE_WAL_RANGE_INVALID');
  const size = BigInt(input.segmentBytes);
  const first = start / size;
  const last = (end - 1n) / size;
  if (last - first + 1n > 4096n) throw new RestoreArchiveVerificationError('RESTORE_WAL_RANGE_TOO_LARGE');
  const perLog = 0x100000000n / size;
  const hex = (n: bigint) => n.toString(16).toUpperCase().padStart(8, '0');
  const names: string[] = [];
  for (let segment = first; segment <= last; segment++) {
    names.push(hex(BigInt(input.timeline)) + hex(segment / perLog) + hex(segment % perLog));
  }
  return names;
}
