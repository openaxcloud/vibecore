import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyWalObjectInventory } from '../database-restore-wal-inventory.js';

const interval = { timeline: 1, startLsn: '0/FFFFFF', endLsn: '0/1000001', segmentBytes: 16 * 1024 * 1024 };
const names = ['000000010000000000000000', '000000010000000000000001'];
const bytes = names.map((name) => Buffer.from(`synthetic object ${name}, not a PostgreSQL WAL record`));
const entries = () =>
  names.map((segment, i) => ({
    segment,
    object: {
      key: `db/synthetic/server/${segment}`,
      generation: '1',
      size: bytes[i].length,
      sha256: createHash('sha256').update(bytes[i]).digest('hex'),
    },
  }));

describe('WAL inventory — local synthetic bytes, no cloud or replay', () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'restore-wal-inventory-'));
    await Promise.all(names.map((name, i) => writeFile(join(directory, name), bytes[i])));
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const read = async (object: { key: string }) => {
    const segment = object.key.split('/').at(-1)!;
    if (!names.includes(segment)) throw new Error('unexpected fixture path');
    return readFile(join(directory, segment));
  };
  it('reads both real fixture files in LSN order without claiming WAL validity or a reached target', async () => {
    const result = await verifyWalObjectInventory(interval, entries().reverse(), read);
    expect(result.objects.map((object) => object.segment)).toEqual(names);
    expect(result.storedBytesVerified).toBe(true);
    expect(result.walRecordsVerified).toBe(false);
    expect(result.targetReached).toBe(false);
  });
  it.each(['missing', 'extra', 'duplicate', 'wrong timeline', 'same object', 'unsafe generation', 'size', 'hash'])(
    'rejects %s before reading any object',
    async (kind) => {
      const inventory = entries();
      if (kind === 'missing') inventory.pop();
      if (kind === 'extra') inventory.push(entries()[0]);
      if (kind === 'duplicate') inventory[1].segment = names[0];
      if (kind === 'wrong timeline') inventory[1].segment = '000000020000000000000001';
      if (kind === 'same object') inventory[1].object.key = inventory[0].object.key;
      if (kind === 'unsafe generation') inventory[1].object.generation = '9007199254740993';
      if (kind === 'size') inventory[1].object.size = 64 * 1024 * 1024 + 1;
      if (kind === 'hash') inventory[1].object.sha256 = 'invalid';
      const reader = vi.fn(read);
      await expect(verifyWalObjectInventory(interval, inventory, reader)).rejects.toThrow(
        'RESTORE_WAL_INVENTORY_INVALID',
      );
      expect(reader).not.toHaveBeenCalled();
    },
  );
  it.each(['corrupt', 'truncated'])('does not return a partial receipt after a %s second object', async (kind) => {
    let calls = 0;
    await expect(
      verifyWalObjectInventory(interval, entries(), async (object) => {
        calls++;
        const content = await read(object);
        if (calls === 1) return content;
        return kind === 'truncated' ? content.subarray(1) : Buffer.alloc(content.length);
      }),
    ).rejects.toThrow('RESTORE_WAL_OBJECT_MISMATCH');
    expect(calls).toBe(2);
  });
  it('does not disclose provider errors or claim success when the next segment is unavailable', async () => {
    let calls = 0;
    await expect(
      verifyWalObjectInventory(interval, entries(), async (object) => {
        if (++calls === 2) throw new Error('private provider diagnostic');
        return read(object);
      }),
    ).rejects.toThrow(/^RESTORE_WAL_OBJECT_READ_FAILED$/);
  });
  it('keeps the admitted immutable-object plan despite caller mutation during a read', async () => {
    const inventory = entries();
    let calls = 0;
    const result = await verifyWalObjectInventory(interval, inventory, async (object) => {
      if (++calls === 1) {
        inventory[1].object.key = 'different';
        inventory[1].object.sha256 = '0'.repeat(64);
        inventory[1].segment = 'different';
      }
      return read(object);
    });
    expect(result.objects).toEqual(entries().map(({ segment, object }) => ({ segment, ...object })));
  });
  it('bounds the requested range before any storage operation', async () => {
    const reader = vi.fn(read);
    await expect(verifyWalObjectInventory({ ...interval, endLsn: 'FFFFFFFF/FFFFFFFF' }, [], reader)).rejects.toThrow(
      'RESTORE_WAL_RANGE_TOO_LARGE',
    );
    expect(reader).not.toHaveBeenCalled();
  });
  it('does not copy unknown JSON fields into a verified receipt or replace its segment', async () => {
    const inventory = entries();
    Object.assign(inventory[0].object, { segment: 'unverified-segment', providerNote: 'synthetic private note' });
    const result = await verifyWalObjectInventory(interval, inventory, read);
    expect(result.objects).toEqual(entries().map(({ segment, object }) => ({ segment, ...object })));
    expect(JSON.stringify(result)).not.toContain('providerNote');
  });
});
