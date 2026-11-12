import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { CRC32C } from '@google-cloud/storage';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import { gcsWalByteReader, withVerifiedWalBytes } from '../database-restore-wal-bytes.js';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import { planRestoreWalInventory, type WalInventoryInput } from '../database-restore-wal-inventory.js';

const plan: WalInventoryInput = {
  bucket: 'synthetic-backups',
  projectId: 'synthetic',
  environment: 'production',
  sourceName: 'db-synthetic-prod',
  sourceUid: 'uid',
  provenanceId: 'intent',
  firstSegment: '000000010000000000000000',
  lastSegment: '000000010000000000000000',
  walSegmentSizeBytes: 1024 * 1024,
};

function fixture(bytes = Buffer.alloc(plan.walSegmentSizeBytes, 42)) {
  const compressed = gzipSync(bytes);
  const crc = new CRC32C();
  crc.update(compressed);

  const object = {
    name: planRestoreWalInventory(plan).objects[0],
    generation: '9007199254740991',
    size: String(compressed.length),
    crc32c: crc.toString(),
  };

  const reads: string[][] = [];

  const reader = {
    open: (bucket: string, name: string, generation: string) => {
      reads.push([bucket, name, generation]);
      return Readable.from([compressed.subarray(0, 7), compressed.subarray(7)]);
    },
  };

  return { bytes, compressed, object, reader, reads };
}
describe('isolated generation-pinned gzip bytes validation, NOT WAL record verification', () => {
  it('checks CRC/size, materializes exact bytes privately, returns digests and removes the copy', async () => {
    const f = fixture();

    let path = '';

    const verified = await withVerifiedWalBytes(f.reader, plan, f.object, async (p) => {
      path = p;
      expect(await readFile(p)).toEqual(f.bytes);
      expect((await stat(p)).mode & 0o777).toBe(0o600);

      return 'inspected';
    });
    expect(f.reads).toEqual([[plan.bucket, f.object.name, f.object.generation]]);
    expect(verified.evidence).toMatchObject({
      expandedBytes: plan.walSegmentSizeBytes,
      transportIntegrityVerified: true,
      archiveVerified: false,
      walContinuityVerified: false,
      expandedSha256: createHash('sha256').update(f.bytes).digest('hex'),
    });
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('cleans the owned copy when the isolated inspector fails', async () => {
    const f = fixture();

    let path = '';
    await expect(
      withVerifiedWalBytes(f.reader, plan, f.object, async (p) => {
        path = p;
        throw new Error('synthetic inspector failure');
      }),
    ).rejects.toThrow('synthetic inspector failure');
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it.each(['checksum', 'short-compressed', 'long-compressed', 'truncated-gzip', 'short-expanded', 'gzip-bomb'])(
    'rejects %s before the inspector runs',
    async (kind) => {
      const f = fixture(
        Buffer.alloc(plan.walSegmentSizeBytes + (kind === 'gzip-bomb' ? 1 : kind === 'short-expanded' ? -1 : 0)),
      );

      let inspected = false;

      if (kind === 'checksum') {
        f.object.crc32c = 'AAAAAA==';
      }

      if (kind === 'short-compressed') {
        f.object.size = String(f.compressed.length + 1);
      }

      if (kind === 'long-compressed') {
        f.object.size = String(f.compressed.length - 1);
      }

      const reader =
        kind === 'truncated-gzip' ? { open: () => Readable.from([f.compressed.subarray(0, -8)]) } : f.reader;
      await expect(
        withVerifiedWalBytes(reader, plan, f.object, async () => {
          inspected = true;
        }),
      ).rejects.toThrow();
      expect(inspected).toBe(false);
    },
  );
  it.each([
    { name: '../other' },
    { generation: '0' },
    { generation: '9007199254740992' },
    { crc32c: 'AAAAAB==' },
    { size: '9999999999' },
  ])('rejects malformed inventory identity before opening storage: %j', async (change) => {
    const f = fixture();
    await expect(
      withVerifiedWalBytes(f.reader, plan, { ...f.object, ...change }, async () => undefined),
    ).rejects.toThrow('RESTORE_WAL_BYTES_IDENTITY_INVALID');
    expect(f.reads).toEqual([]);
  });
  it('redacts provider details, does not retry a changed/missing generation', async () => {
    const f = fixture();

    let calls = 0;
    await expect(
      withVerifiedWalBytes(
        {
          open: () => {
            calls++;
            throw new Error('private provider credentials');
          },
        },
        plan,
        f.object,
        async () => undefined,
      ),
    ).rejects.toThrow('RESTORE_WAL_BYTES_UNAVAILABLE');
    expect(calls).toBe(1);
  });
  it('aborts a stalled stream and never invokes the inspector', async () => {
    const f = fixture();
    const controller = new AbortController();

    const stream = new Readable({
      read() {
        /* Deliberately stalled synthetic source. */
      },
    });

    const pending = withVerifiedWalBytes(
      {
        open: () => {
          controller.abort();
          return stream;
        },
      },
      plan,
      f.object,
      async () => {
        throw new Error('must not inspect');
      },
      controller.signal,
    );
    await expect(pending).rejects.toThrow('RESTORE_WAL_BYTES_UNAVAILABLE');
    expect(stream.destroyed).toBe(true);
  });
});

it('GCS adapter pins exact generation and raw gzip representation with checksum validation', () => {
  const calls: unknown[] = [];
  const stream = Readable.from([]);

  const client = {
    bucket: (bucket: string) => {
      calls.push(bucket);
      return {
        file: (name: string, options: unknown) => {
          calls.push(name, options);
          return {
            createReadStream: (readOptions: unknown) => {
              calls.push(readOptions);
              return stream;
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof gcsWalByteReader>[0];
  expect(gcsWalByteReader(client).open('synthetic', 'object', '9007199254740991')).toBe(stream);
  expect(calls).toEqual([
    'synthetic',
    'object',
    { generation: '9007199254740991' },
    { validation: 'crc32c', decompress: false },
  ]);
});

it('refuses generations the installed SDK cannot represent exactly before calling it', () => {
  const client = {
    bucket: () => {
      throw new Error('must not access provider');
    },
  } as unknown as Parameters<typeof gcsWalByteReader>[0];
  expect(() => gcsWalByteReader(client).open('synthetic', 'object', '9007199254740992')).toThrow(
    'RESTORE_WAL_BYTES_IDENTITY_INVALID',
  );
});

it('refuses a late successful inspector result after cancellation and then cleans the copy', async () => {
  const f = fixture();
  const controller = new AbortController();

  let path = '';
  await expect(
    withVerifiedWalBytes(
      f.reader,
      plan,
      f.object,
      async (p, signal) => {
        path = p;
        controller.abort();
        expect(signal.aborted).toBe(true);

        return 'late result';
      },
      controller.signal,
    ),
  ).rejects.toThrow('RESTORE_WAL_BYTES_CANCELLED');
  await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('waits for a cooperating inspector to stop before cleanup after its cancellation rejection', async () => {
  const f = fixture();
  const controller = new AbortController();

  let path = '';
  await expect(
    withVerifiedWalBytes(
      f.reader,
      plan,
      f.object,
      async (p, signal) => {
        path = p;
        controller.abort();
        expect((await stat(p)).isFile()).toBe(true);
        signal.throwIfAborted();
      },
      controller.signal,
    ),
  ).rejects.toThrow();
  await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});
