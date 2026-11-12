import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import {
  gcsWalMetadataReader,
  inventoryRestoreWal,
  planRestoreWalInventory,
  type WalInventoryInput,
} from '../database-restore-wal-inventory.js';

const input: WalInventoryInput = {
  bucket: 'synthetic-backups',
  projectId: 'synthetic',
  environment: 'production',
  sourceName: 'db-synthetic-prod',
  sourceUid: 'source-uid',
  provenanceId: 'intent-id',
  firstSegment: '0000000100000000000000FF',
  lastSegment: '000000010000000100000001',
  walSegmentSizeBytes: 16 * 1024 * 1024,
};

function fixture() {
  const reads: string[] = [];
  return {
    reads,
    reader: {
      metadata: async (bucket: string, name: string) => {
        reads.push(name);
        return { bucket, name, generation: '12345678901234567890', size: '1234', crc32c: 'AAAAAA==' };
      },
    },
  };
}
describe('read-only exact WAL metadata inventory', () => {
  it('handles log rollover and inventories only expected gzip objects, without physical claims', async () => {
    const f = fixture();
    const result = await inventoryRestoreWal(f.reader, input);
    expect(f.reads).toEqual([
      'db/synthetic/db-synthetic-prod/wals/0000000100000000/0000000100000000000000FF.gz',
      'db/synthetic/db-synthetic-prod/wals/0000000100000001/000000010000000100000000.gz',
      'db/synthetic/db-synthetic-prod/wals/0000000100000001/000000010000000100000001.gz',
    ]);
    expect(result.objects).toHaveLength(3);
    expect(result.objects[0].generation).toBe('12345678901234567890');
    expect(result).toMatchObject({
      sourceUid: 'source-uid',
      provenanceId: 'intent-id',
      archiveVerified: false,
      walContinuityVerified: false,
    });
  });
  it.each([
    { projectId: '../other' },
    { bucket: 'https://elsewhere' },
    { sourceName: 'other' },
    { sourceUid: '' },
    { provenanceId: '' },
    { walSegmentSizeBytes: 3 * 1024 * 1024 },
    { firstSegment: '000000010000000000000100' },
    { firstSegment: '000000000000000000000000' },
    { lastSegment: '000000020000000100000001' },
    { lastSegment: '000000010000000000000000' },
    { lastSegment: '000000010000000200000000' },
  ])('rejects an unsafe or unsupported plan before any lookup: %j', async (change) => {
    const f = fixture();
    await expect(inventoryRestoreWal(f.reader, { ...input, ...change })).rejects.toThrow();
    expect(f.reads).toEqual([]);
  });
  it('honors nondefault 1GiB segment size when computing log rollover', () => {
    const plan = planRestoreWalInventory({
      ...input,
      walSegmentSizeBytes: 1024 ** 3,
      firstSegment: '000000010000000000000003',
      lastSegment: '000000010000000100000000',
    });
    expect(plan.objects).toHaveLength(2);
    expect(plan.objects[1]).toContain('000000010000000100000000.gz');
  });
  it.each([
    { name: 'other' },
    { bucket: 'other' },
    { generation: '0' },
    { generation: 123 },
    { size: '0' },
    { size: '33554433' },
    { crc32c: 'invalid' },
    { timeDeleted: 'today' },
    { softDeleteTime: 'today' },
  ])('rejects malformed/mismatched/deleted metadata: %j', async (change) => {
    const f = fixture();

    const metadata = async (bucket: string, name: string) => ({
      ...(await f.reader.metadata(bucket, name)),
      ...change,
    });
    await expect(inventoryRestoreWal({ metadata }, input)).rejects.toThrow('RESTORE_WAL_METADATA_INVALID');
    expect(f.reads).toHaveLength(1);
  });
  it('fails on a gap without leaking provider details or inventing subsequent evidence', async () => {
    const f = fixture();

    const metadata = async (bucket: string, name: string) => {
      if (f.reads.length === 1) {
        throw new Error('secret provider details');
      }

      return f.reader.metadata(bucket, name);
    };
    await expect(inventoryRestoreWal({ metadata }, input)).rejects.toThrow('RESTORE_WAL_METADATA_UNAVAILABLE');
    expect(f.reads).toHaveLength(1);
  });
});

it('GCS adapter only reads exact object metadata through the supplied client', async () => {
  const calls: string[] = [];
  const object = { generation: '1' };

  const client = {
    bucket: (bucket: string) => {
      calls.push(bucket);
      return {
        file: (name: string) => {
          calls.push(name);
          return {
            getMetadata: async () => {
              calls.push('getMetadata');
              return [object];
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof gcsWalMetadataReader>[0];
  expect(await gcsWalMetadataReader(client).metadata('synthetic-bucket', 'synthetic-object')).toBe(object);
  expect(calls).toEqual(['synthetic-bucket', 'synthetic-object', 'getMetadata']);
});
