import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Storage } from '@google-cloud/storage';
import { describe, expect, it, vi } from 'vitest';
import { createRestoreObjectReader } from '../database-restore-object-reader.js';

function fixture(bytes = Buffer.from('isolated WAL fixture')) {
  const stream = Readable.from([bytes]);
  const createReadStream = vi.fn(() => stream);
  const file = vi.fn(() => ({ createReadStream }));
  const bucket = vi.fn(() => ({ file }));
  const read = createRestoreObjectReader({ bucket } as unknown as Pick<Storage, 'bucket'>, {
    bucket: 'synthetic-bucket',
    projectId: 'project-a',
    serverName: 'db-project-a',
  });
  const expected = {
    key: 'db/project-a/db-project-a/wals/segment.gz',
    generation: '1729850000000001',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  return { read, expected, bucket, file, createReadStream, stream, bytes };
}

describe('GCS restore reader contract — isolated SDK stream fixture, no cloud calls', () => {
  it('pins the exact generation and checks original compressed bytes before returning them', async () => {
    const f = fixture();
    expect(await f.read(f.expected)).toEqual(f.bytes);
    expect(f.file).toHaveBeenCalledWith(f.expected.key, { generation: f.expected.generation });
    expect(f.createReadStream).toHaveBeenCalledWith({ validation: 'crc32c', decompress: false });
    expect(f.stream.destroyed).toBe(true);
  });
  it.each([
    'db/project-b/db-project-a/wals/x',
    'db/project-a/db-project-b/wals/x',
    'db/project-a/db-project-a/../x',
    'db/project-a/db-project-a//x',
  ])('rejects scope/traversal before I/O: %s', async (key) => {
    const f = fixture();
    await expect(f.read({ ...f.expected, key })).rejects.toMatchObject({ code: 'RESTORE_OBJECT_EXPECTATION_INVALID' });
    expect(f.bucket).not.toHaveBeenCalled();
  });
  it.each([0, 64 * 1024 * 1024 + 1, 1.5])('rejects invalid resource bounds before I/O: %s', async (size) => {
    const f = fixture();
    await expect(f.read({ ...f.expected, size })).rejects.toMatchObject({ code: 'RESTORE_OBJECT_EXPECTATION_INVALID' });
    expect(f.bucket).not.toHaveBeenCalled();
  });
  it.each([-1, 1])('rejects short or oversized data: %s', async (offset) => {
    const f = fixture();
    await expect(f.read({ ...f.expected, size: f.expected.size + offset })).rejects.toMatchObject({
      code: 'RESTORE_OBJECT_SIZE_MISMATCH',
    });
    expect(f.stream.destroyed).toBe(true);
  });
  it('refuses SDK-unsafe uint64 generations before any I/O', async () => {
    const f = fixture();
    await expect(f.read({ ...f.expected, generation: '9007199254740993123' })).rejects.toMatchObject({
      code: 'RESTORE_OBJECT_EXPECTATION_INVALID',
    });
    expect(f.bucket).not.toHaveBeenCalled();
  });
  it('checks actual installed SDK generation coercion offline', () => {
    const storage = new Storage({ projectId: 'synthetic-project' });
    const bucket = storage.bucket('synthetic-bucket');
    const safe = '1729850000000001';
    expect(String(bucket.file('fixture', { generation: safe }).generation)).toBe(safe);
    const unsafe = '9007199254740993123';
    expect(String(bucket.file('fixture', { generation: unsafe }).generation)).not.toBe(unsafe);
  });
  it('rejects digest mismatch', async () => {
    const f = fixture();
    await expect(f.read({ ...f.expected, sha256: '0'.repeat(64) })).rejects.toMatchObject({
      code: 'RESTORE_OBJECT_DIGEST_MISMATCH',
    });
  });
  it('redacts provider errors and never retries latest generation', async () => {
    const f = fixture();
    f.createReadStream.mockImplementation(() => {
      throw new Error('private provider details');
    });
    await expect(f.read(f.expected)).rejects.toThrow('RESTORE_OBJECT_READ_FAILED');
    expect(f.file).toHaveBeenCalledTimes(1);
  });
});
