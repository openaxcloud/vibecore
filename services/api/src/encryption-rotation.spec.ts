import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { encryptJson, decryptJson, ciphertextKeyId } from '@vibecore/security';

import {
  ENCRYPTED_COLUMNS,
  assertCorpusMatchesSchema,
  encryptionCorpusStatus,
  rotateEncryptedCorpus,
  scanSchemaForEncryptedColumns,
} from './encryption-rotation.js';

const ENV_KEYS = ['CONFIG_ENCRYPTION_KEY', 'CONFIG_ENCRYPTION_KEYS', 'CONFIG_ENCRYPTION_PRIMARY_KEY_ID'];
const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    ORIGINAL[key] = process.env[key];
    delete (process.env as Record<string, string | undefined>)[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL[key] === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      process.env[key] = ORIGINAL[key];
    }
  }
});

/** In-memory stand-in for the Prisma delegates the sweep touches. */
function fakePrisma(
  seed: Record<string, Array<Record<string, unknown>>>,
  beforeWrite?: (model: string, rows: Array<Record<string, unknown>>) => void,
) {
  const tables: Record<string, Array<Record<string, unknown>>> = {};

  for (const entry of ENCRYPTED_COLUMNS) {
    tables[entry.model] ??= [];
  }

  for (const [model, rows] of Object.entries(seed)) {
    tables[model] = rows.map((row) => ({ ...row }));
  }

  const client: Record<string, unknown> = {};

  for (const [model, rows] of Object.entries(tables)) {
    client[model] = {
      async findMany(args: any) {
        const column = Object.keys(args.where ?? {})[0];
        let matching = column ? rows.filter((row) => row[column] !== null && row[column] !== undefined) : rows;

        const idField = Object.keys(args.orderBy ?? { id: 'asc' })[0];

        if (args.orderBy && matching.some((row) => !Object.hasOwn(row, idField))) {
          throw new Error(`Unknown primary key ${model}.${idField}`);
        }

        matching = [...matching].sort((a, b) => String(a[idField]).localeCompare(String(b[idField])));

        if (args.cursor) {
          const cursorValue = String(Object.values(args.cursor)[0]);
          const index = matching.findIndex((row) => String(row[idField]) === cursorValue);
          matching = index >= 0 ? matching.slice(index + (args.skip ?? 0)) : matching;
        }

        return typeof args.take === 'number' ? matching.slice(0, args.take) : matching;
      },
      async update(args: any) {
        beforeWrite?.(model, rows);
        const idField = Object.keys(args.where)[0];
        const row = rows.find((candidate) => candidate[idField] === args.where[idField]);

        if (!row) {
          throw new Error('row not found');
        }

        Object.assign(row, args.data);

        return row;
      },
      async updateMany(args: any) {
        beforeWrite?.(model, rows);
        const matching = rows.filter((row) =>
          Object.entries(args.where).every(([field, expected]) => row[field] === expected),
        );

        for (const row of matching) {
          Object.assign(row, args.data);
        }

        return { count: matching.length };
      },
    };
  }

  return { client: client as any, tables };
}

describe('AUDX-010 rotation corpus map', () => {
  /*
   * Discriminating in both directions: adding an encrypted column to the schema
   * without adding it here fails, and removing one from the schema while it is
   * still listed here fails too. Both are silent-partial-rotation bugs.
   */
  it('covers every encrypted column the Prisma schema declares', () => {
    expect(() => assertCorpusMatchesSchema()).not.toThrow();
  });

  it('fails when the schema grows an encrypted column the map does not cover', () => {
    const schema = 'model Widget {\n  id String @id\n  apiKeyEnc String?\n}\n';

    expect(scanSchemaForEncryptedColumns(schema)).toEqual([{ model: 'widget', column: 'apiKeyEnc' }]);
    expect(() => assertCorpusMatchesSchema(schema)).toThrowError(/widget\.apiKeyEnc/);
  });

  it('fails when the map names a column the schema no longer has', () => {
    // A schema holding only ONE of the mapped columns: the others are stale.
    const schema = 'model ProviderConfig {\n  id String @id\n  apiKeyEnc String?\n}\n';

    expect(() => assertCorpusMatchesSchema(schema)).toThrowError(/No longer in the schema/);
  });
});

describe('AUDX-010 rotateEncryptedCorpus', () => {
  it('preserves a secret changed after the rotation read and reports the conflict without counting a rotation', async () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ old: 'rotation-conflict-old-key' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'old';
    const original = encryptJson({ value: 'synthetic-before-cutover' });

    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({
      old: 'rotation-conflict-old-key',
      current: 'rotation-conflict-current-key',
    });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'current';
    const concurrent = encryptJson({ value: 'synthetic-after-cutover' });
    let concurrentWrite = false;
    const { client, tables } = fakePrisma(
      { projectSecret: [{ id: 'project-secret', valueEncrypted: original }] },
      (model, rows) => {
        if (model === 'projectSecret' && !concurrentWrite) {
          concurrentWrite = true;
          rows[0].valueEncrypted = concurrent;
        }
      },
    );

    const result = await rotateEncryptedCorpus(client);

    expect(concurrentWrite).toBe(true);
    expect(tables.projectSecret[0].valueEncrypted).toBe(concurrent);
    expect(decryptJson(tables.projectSecret[0].valueEncrypted as string)).toEqual({
      value: 'synthetic-after-cutover',
    });
    expect(result).toMatchObject({ rotated: 0, unreadable: 0, conflicts: 1 });
    expect(result.columns.find((column) => column.model === 'projectSecret')).toMatchObject({
      scanned: 1,
      rotated: 0,
      unreadable: 0,
      conflicts: 1,
    });
  });

  it('rotates both restore journal secrets by restoreId and preserves their plaintext after the old key is removed', async () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ old: 'restore-test-old-key' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'old';

    const originalBeforeTarget = { value: 'synthetic-original-before-target' };
    const originalAfterTarget = { value: 'synthetic-original-after-target' };
    const targetConnection = { value: 'synthetic-restored-target' };
    const { client, tables } = fakePrisma({
      databaseRestoreExecution: [
        {
          restoreId: 'restore-1',
          phase: 'PENDING',
          expectedBindingVersion: 0,
          originalSecretEncrypted: encryptJson(originalBeforeTarget),
          targetConnectionEncrypted: null,
        },
        {
          restoreId: 'restore-2',
          phase: 'TARGET_READY',
          expectedBindingVersion: 3,
          originalSecretEncrypted: encryptJson(originalAfterTarget),
          targetConnectionEncrypted: encryptJson(targetConnection),
        },
      ],
    });

    expect(await encryptionCorpusStatus(client)).toEqual({ old: 3 });
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({
      old: 'restore-test-old-key',
      current: 'restore-test-current-key',
    });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'current';

    const result = await rotateEncryptedCorpus(client, { batchSize: 1 });

    expect(result).toMatchObject({ rotated: 3, unreadable: 0 });
    expect(result.columns.filter((column) => column.model === 'databaseRestoreExecution')).toEqual([
      {
        model: 'databaseRestoreExecution',
        column: 'originalSecretEncrypted',
        scanned: 2,
        rotated: 2,
        unreadable: 0,
        conflicts: 0,
      },
      {
        model: 'databaseRestoreExecution',
        column: 'targetConnectionEncrypted',
        scanned: 1,
        rotated: 1,
        unreadable: 0,
        conflicts: 0,
      },
    ]);
    expect(await encryptionCorpusStatus(client)).toEqual({ current: 3 });

    // Exercise real decryption after retiring the old synthetic key. Neither
    // journal ownership/state nor an absent target connection may be changed.
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ current: 'restore-test-current-key' });
    const [beforeTarget, afterTarget] = tables.databaseRestoreExecution;

    expect(decryptJson(beforeTarget.originalSecretEncrypted as string)).toEqual(originalBeforeTarget);
    expect(decryptJson(afterTarget.originalSecretEncrypted as string)).toEqual(originalAfterTarget);
    expect(decryptJson(afterTarget.targetConnectionEncrypted as string)).toEqual(targetConnection);
    expect(beforeTarget).toMatchObject({
      restoreId: 'restore-1',
      phase: 'PENDING',
      expectedBindingVersion: 0,
      targetConnectionEncrypted: null,
    });
    expect(afterTarget).toMatchObject({ restoreId: 'restore-2', phase: 'TARGET_READY', expectedBindingVersion: 3 });
  });

  it('advances across null-only pages without skipping later restore target secrets', async () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ old: 'nullable-pages-old-key' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'old';
    const { client, tables } = fakePrisma({
      databaseRestoreExecution: Array.from({ length: 5 }, (_, index) => ({
        restoreId: `restore-${index}`,
        originalSecretEncrypted: encryptJson({ value: `original-${index}` }),
        targetConnectionEncrypted: index % 2 ? encryptJson({ value: `target-${index}` }) : null,
      })),
    });
    const target = client.databaseRestoreExecution;
    const findMany = target.findMany.bind(target);
    let pages = 0;

    target.findMany = async (args: any) => {
      if (args.take !== undefined && ++pages > 12) {
        throw new Error('Rotation failed to advance its cursor across null pages');
      }

      return findMany(args);
    };
    expect(await encryptionCorpusStatus(client)).toEqual({ old: 7 });
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({
      old: 'nullable-pages-old-key',
      current: 'nullable-pages-current-key',
    });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'current';

    const result = await rotateEncryptedCorpus(client, { batchSize: 1 });

    expect(result).toMatchObject({ rotated: 7, unreadable: 0, conflicts: 0 });
    expect(result.columns.find((column) => column.column === 'targetConnectionEncrypted')).toMatchObject({
      scanned: 2,
      rotated: 2,
      unreadable: 0,
      conflicts: 0,
    });
    expect(await encryptionCorpusStatus(client)).toEqual({ current: 7 });
    expect(
      tables.databaseRestoreExecution
        .filter((_, index) => index % 2 === 0)
        .every((row) => row.targetConnectionEncrypted === null),
    ).toBe(true);
    expect(
      tables.databaseRestoreExecution
        .filter((_, index) => index % 2 === 1)
        .map((row) => decryptJson(row.targetConnectionEncrypted as string)),
    ).toEqual([{ value: 'target-1' }, { value: 'target-3' }]);
  });

  it('moves a retired-key corpus onto the primary key and reports it done', async () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k1';

    const { client, tables } = fakePrisma({
      providerConfig: [
        { id: 'p1', apiKeyEnc: encryptJson({ value: 'anthropic-key' }) },
        { id: 'p2', apiKeyEnc: encryptJson({ value: 'openai-key' }) },
      ],
      userConnection: [
        { id: 'u1', accessTokenEncrypted: encryptJson({ value: 'gh-pat' }), refreshTokenEncrypted: null },
      ],
    });

    // Before rotation the whole corpus names k1.
    expect(await encryptionCorpusStatus(client)).toEqual({ k1: 3 });

    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one', k2: 'secret-two' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k2';

    const result = await rotateEncryptedCorpus(client, { batchSize: 2 });

    expect(result.unreadable).toBe(0);
    expect(result.rotated).toBe(3);
    expect(await encryptionCorpusStatus(client)).toEqual({ k2: 3 });

    // The plaintext survived the move — the point of the exercise.
    expect(tables.providerConfig.map((row) => ciphertextKeyId(row.apiKeyEnc as string))).toEqual(['k2', 'k2']);
  });

  it('carries the legacy v1 corpus forward onto a named key', async () => {
    process.env.CONFIG_ENCRYPTION_KEY = 'legacy-secret';

    const { client } = fakePrisma({ siemWebhook: [{ id: 's1', secretCiphertext: encryptJson({ secret: 'whsec' }) }] });

    expect(await encryptionCorpusStatus(client)).toEqual({ 'v1-unkeyed': 1 });

    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'brand-new' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k1';

    const result = await rotateEncryptedCorpus(client);

    expect(result.rotated).toBe(1);
    expect(await encryptionCorpusStatus(client)).toEqual({ k1: 1 });
  });

  it('counts an unreadable row instead of overwriting the secret it cannot open', async () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ gone: 'dropped-too-early' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'gone';

    const orphan = encryptJson({ value: 'unrecoverable' });
    const { client, tables } = fakePrisma({ providerConfig: [{ id: 'p1', apiKeyEnc: orphan }] });

    // The sealing key is dropped from the keyring: the row can no longer be read.
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k2: 'secret-two' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k2';

    const result = await rotateEncryptedCorpus(client);

    expect(result.unreadable).toBe(1);
    expect(result.rotated).toBe(0);
    // Untouched: overwriting would have destroyed a secret with no plaintext to restore.
    expect(tables.providerConfig[0].apiKeyEnc).toBe(orphan);
  });

  it('does not write in dry-run mode but still reports what it would move', async () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k1';

    const sealed = encryptJson({ value: 'x' });
    const { client, tables } = fakePrisma({ providerConfig: [{ id: 'p1', apiKeyEnc: sealed }] });

    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one', k2: 'secret-two' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k2';

    const result = await rotateEncryptedCorpus(client, { dryRun: true });

    expect(result.rotated).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(result.columns.every((column) => column.conflicts === 0)).toBe(true);
    expect(tables.providerConfig[0].apiKeyEnc).toBe(sealed);
  });
});
