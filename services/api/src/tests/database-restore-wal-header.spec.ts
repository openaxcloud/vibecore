import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { CRC32C } from '@google-cloud/storage';
import { describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import { verifyPostgres16WalHeader, withVerifiedPostgres16WalBytes } from '../database-restore-wal-header.js';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import { planRestoreWalInventory, type WalInventoryInput } from '../database-restore-wal-inventory.js';

const plan: WalInventoryInput = {
  bucket: 'synthetic-backups',
  projectId: 'synthetic',
  environment: 'production',
  sourceName: 'db-synthetic-prod',
  sourceUid: 'uid',
  provenanceId: 'intent',
  firstSegment: '000000030000000100000002',
  lastSegment: '000000030000000100000002',
  walSegmentSizeBytes: 1024 * 1024,
};

const identity = { systemIdentifier: '18446744073709551614', walBlockSizeBytes: 8192 as const };
const name = planRestoreWalInventory(plan).objects[0];

function header(big = false) {
  const value = Buffer.alloc(40);
  const u16 = (n: number, offset: number) => (big ? value.writeUInt16BE(n, offset) : value.writeUInt16LE(n, offset));
  const u32 = (n: number, offset: number) => (big ? value.writeUInt32BE(n, offset) : value.writeUInt32LE(n, offset));

  const u64 = (n: bigint, offset: number) =>
    big ? value.writeBigUInt64BE(n, offset) : value.writeBigUInt64LE(n, offset);
  u16(0xd113, 0);
  u16(2, 2);
  u32(3, 4);
  u64(0x100200000n, 8);
  u64(BigInt(identity.systemIdentifier), 24);
  u32(plan.walSegmentSizeBytes, 32);
  u32(8192, 36);

  return value;
}

function fixture(h = header()) {
  const bytes = Buffer.alloc(plan.walSegmentSizeBytes);
  h.copy(bytes);

  const compressed = gzipSync(bytes);
  const crc = new CRC32C();
  crc.update(compressed);

  return {
    reader: { open: vi.fn(() => Readable.from([compressed])) },
    object: { name, generation: '12', size: String(compressed.length), crc32c: crc.toString() },
  };
}

describe('PG16 WAL header identity, not record validation or recovery proof', () => {
  it.each([false, true])('verifies exact 64-bit source and segment address (big endian %s)', (big) => {
    expect(verifyPostgres16WalHeader(header(big), plan, name, identity)).toEqual({
      postgresMajorVersion: 16,
      byteOrder: big ? 'big-endian' : 'little-endian',
      systemIdentifier: identity.systemIdentifier,
      segment: plan.firstSegment,
      headerIdentityVerified: true,
      walRecordsVerified: false,
      archiveVerified: false,
      walContinuityVerified: false,
    });
  });
  it.each([0, 2, 4, 8, 24, 32, 36])('rejects altered field at byte %s', (offset) => {
    const h = header();
    h[offset] ^= 1;

    // Other known flags are allowed, but a missing long header is not.
    if (offset === 2) {
      h.writeUInt16LE(0, 2);
    }

    expect(() => verifyPostgres16WalHeader(h, plan, name, identity)).toThrow();
  });
  it('rejects unknown flags, short headers and other PG versions', () => {
    const h = header();
    h.writeUInt16LE(0x12, 2);
    expect(() => verifyPostgres16WalHeader(h, plan, name, identity)).toThrow();
    expect(() => verifyPostgres16WalHeader(header().subarray(0, 39), plan, name, identity)).toThrow();
    h.writeUInt16LE(0xd116, 0);
    expect(() => verifyPostgres16WalHeader(h, plan, name, identity)).toThrow('VERSION_UNSUPPORTED');
  });
  it.each(['0', '01', '-1', '18446744073709551616', '1e10', ''])(
    'rejects invalid expected system identifier %s',
    (systemIdentifier) => {
      expect(() => verifyPostgres16WalHeader(header(), plan, name, { ...identity, systemIdentifier })).toThrow();
    },
  );
  it('rejects unsupported expected block size and verifies final 64-bit segment address', () => {
    expect(() =>
      verifyPostgres16WalHeader(header(), plan, name, { ...identity, walBlockSizeBytes: 4096 as 8192 }),
    ).toThrow();

    const segment = '00000003FFFFFFFF00000FFF';
    const boundary = { ...plan, firstSegment: segment, lastSegment: segment };
    const h = header();
    h.writeBigUInt64LE(0xfffffffffff00000n, 8);
    expect(verifyPostgres16WalHeader(h, boundary, planRestoreWalInventory(boundary).objects[0], identity).segment).toBe(
      segment,
    );
  });
  it('rejects foreign object names even with matching headers', () => {
    expect(() => verifyPostgres16WalHeader(header(), plan, name.replace('synthetic', 'other'), identity)).toThrow();
  });
  it('checks generation-pinned bytes before trusted inspector and cleans the copy', async () => {
    const f = fixture();

    let path = '';

    const result = await withVerifiedPostgres16WalBytes(f.reader, plan, f.object, identity, async (p) => {
      path = p;
      expect((await stat(p)).mode & 0o777).toBe(0o600);

      return 'inspected';
    });
    expect(f.reader.open).toHaveBeenCalledWith(plan.bucket, name, '12');
    expect(result.result.headerEvidence.headerIdentityVerified).toBe(true);
    expect(result.result.inspection).toBe('inspected');
    expect(result.evidence.archiveVerified).toBe(false);
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('refuses checksum-valid bytes from another cluster before inspection', async () => {
    const h = header();
    h.writeBigUInt64LE(42n, 24);

    const f = fixture(h);
    const inspect = vi.fn();
    await expect(withVerifiedPostgres16WalBytes(f.reader, plan, f.object, identity, inspect)).rejects.toThrow(
      'IDENTITY_MISMATCH',
    );
    expect(inspect).not.toHaveBeenCalled();
  });
  it('retains cancellation and cleanup semantics', async () => {
    const f = fixture();
    const cancellation = new AbortController();

    let path = '';
    await expect(
      withVerifiedPostgres16WalBytes(
        f.reader,
        plan,
        f.object,
        identity,
        async (p) => {
          path = p;
          cancellation.abort();

          return true;
        },
        cancellation.signal,
      ),
    ).rejects.toThrow('CANCELLED');
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
