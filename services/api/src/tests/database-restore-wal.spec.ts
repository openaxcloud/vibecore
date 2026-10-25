import { describe, expect, it } from 'vitest';
import { requiredWalSegments } from '../database-restore-wal.js';
const base = { timeline: 1, segmentBytes: 16 * 1024 * 1024, startLsn: '0/1000000', endLsn: '0/2000000' };
describe('same-timeline WAL interval planning, not timestamp coverage', () => {
  it('uses a half-open end and includes the partial first segment', () => {
    expect(requiredWalSegments(base)).toEqual(['000000010000000000000001']);
    expect(requiredWalSegments({ ...base, startLsn: '0/1FFFFFF', endLsn: '0/2000001' })).toEqual([
      '000000010000000000000001',
      '000000010000000000000002',
    ]);
  });
  it('rolls log number at 4 GiB and preserves the requested timeline', () => {
    expect(requiredWalSegments({ ...base, timeline: 2, startLsn: '0/FFFFFFFF', endLsn: '1/1' })).toEqual([
      '0000000200000000000000FF',
      '000000020000000100000000',
    ]);
  });
  it('supports non-default PostgreSQL segment size', () => {
    expect(requiredWalSegments({ ...base, segmentBytes: 1024 * 1024 * 1024 })).toEqual(['000000010000000000000000']);
  });
  it.each([0, 3 * 1024 * 1024, 2 ** 31])('rejects invalid segment geometry %s', (segmentBytes) => {
    expect(() => requiredWalSegments({ ...base, segmentBytes })).toThrow('RESTORE_WAL_GEOMETRY_INVALID');
  });
  it('rejects reversed intervals and bounded-work overflow', () => {
    expect(() => requiredWalSegments({ ...base, endLsn: base.startLsn })).toThrow('RESTORE_WAL_RANGE_INVALID');
    expect(() => requiredWalSegments({ ...base, endLsn: 'FFFFFFFF/FFFFFFFF' })).toThrow('RESTORE_WAL_RANGE_TOO_LARGE');
  });
});

// Internal validation failures retain a machine-readable code for the coordinator.
it('returns a typed archive failure with the WAL code', () => {
  expect(() =>
    requiredWalSegments({ timeline: 0, startLsn: '0/0', endLsn: '0/1', segmentBytes: 16 * 1024 * 1024 }),
  ).toThrowError(expect.objectContaining({ code: 'RESTORE_WAL_GEOMETRY_INVALID' }));
});
