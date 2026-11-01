import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDatabaseQuery } from './app.js';

const require = createRequire(import.meta.url);

// Exercise the installed driver's parsers; only its network transport is replaced.
const PG_RESULT = require('pg/lib/result.js');
interface WireResult {
  fields: { name: string; dataTypeID: number; format: string }[];
  values: (string | null)[][];
  count: number;
  command: string;
}

const transport = vi.hoisted(() => ({
  statements: [] as unknown[],
  results: [] as WireResult[],
  fail: false,
  ended: false,
}));
vi.mock('pg', () => ({
  Client: class {
    async connect() {
      return undefined;
    }
    async end() {
      transport.ended = true;
    }
    async query(input: string | { text: string; rowMode?: string }) {
      transport.statements.push(input);

      if (typeof input === 'string' && ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(input)) {
        return {};
      }

      if (transport.fail) {
        throw new Error('synthetic query failure');
      }

      const mode = typeof input === 'string' ? undefined : input.rowMode;

      const results = transport.results.map((item) => {
        const result = new PG_RESULT(mode);
        result.addFields(item.fields);
        result.rows = item.values.map((values: (string | null)[]) => result.parseRow(values));
        result.rowCount = item.count;
        result.command = item.command;

        return result;
      });

      return results.length === 1 ? results[0] : results;
    }
  },
}));

const connection = {
  kind: 'postgres' as const,
  key: 'DATABASE_URL',
  source: 'secret' as const,
  maskedUrl: 'synthetic',
  environment: 'development' as const,
  value: 'postgresql://synthetic.invalid/never-connected',
};

const field = (name: string, dataTypeID = 25) => ({ name, dataTypeID, format: 'text' });
const query = () => runDatabaseQuery(connection, 'synthetic SQL batch');

beforeEach(() => {
  transport.statements = [];
  transport.results = [];
  transport.fail = false;
  transport.ended = false;
});
describe('PostgreSQL special columns through the installed parser and API serialization', () => {
  it.each([
    { oid: 25, wire: 'own text', expected: 'own text' },
    { oid: 114, wire: '{"syntheticMarker":"own JSON"}', expected: { syntheticMarker: 'own JSON' } },
    { oid: 25, wire: null, expected: null },
  ])('preserves __proto__ as an own property: $wire', async ({ oid, wire, expected }) => {
    transport.results = [
      {
        fields: [field('__proto__', oid), field('constructor'), field('prototype')],
        values: [[wire, 'own ctor', 'own prototype']],
        count: 1,
        command: 'SELECT',
      },
    ];

    const output = await query();
    const row = (output.rows as Record<string, unknown>[])[0];
    expect(Object.hasOwn(row, '__proto__')).toBe(true);
    expect(row.__proto__).toEqual(expected);
    expect(row.constructor).toBe('own ctor');
    expect(row.prototype).toBe('own prototype');
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, 'syntheticMarker')).toBe(false);
    expect(output).toMatchObject({
      columns: ['__proto__', 'constructor', 'prototype'],
      rowCount: 1,
      command: 'SELECT',
    });
  });
  it('preserves precision, booleans, dates, arrays and JSON values', async () => {
    transport.results = [
      {
        fields: [field('amount', 1700), field('flag', 16), field('at', 1184), field('items', 1009), field('json', 114)],
        values: [
          ['900719925474099312345.000001', 'f', '2026-11-01 12:34:56+02', '{one,two}', '{"__proto__":{"nested":true}}'],
        ],
        count: 1,
        command: 'SELECT',
      },
    ];
    expect((await query()).rows).toEqual([
      {
        amount: '900719925474099312345.000001',
        flag: false,
        at: '2026-11-01T10:34:56.000Z',
        items: ['one', 'two'],
        json: JSON.parse('{"__proto__":{"nested":true}}'),
      },
    ]);
  });
  it('returns only the last SQL batch result and its affected count', async () => {
    transport.results = [
      { fields: [field('earlier')], values: [['discard']], count: 1, command: 'SELECT' },
      { fields: [], values: [], count: 7, command: 'UPDATE' },
    ];
    expect(await query()).toEqual({ columns: [], rows: [], rowCount: 7, command: 'UPDATE' });
    expect(transport.statements).toEqual(['BEGIN', { text: 'synthetic SQL batch', rowMode: 'array' }, 'COMMIT']);
    expect(transport.ended).toBe(true);
  });
  it.each(['INSERT', 'DELETE'])('preserves %s command and affected count without returned rows', async (command) => {
    transport.results = [{ fields: [], values: [], count: 3, command }];
    expect(await query()).toEqual({ columns: [], rows: [], rowCount: 3, command });
  });
  it('serializes date and int8 using the existing driver defaults', async () => {
    transport.results = [
      {
        fields: [field('day', 1082), field('large', 20)],
        values: [['2026-11-01', '9007199254740993']],
        count: 1,
        command: 'SELECT',
      },
    ];
    expect((await query()).rows).toEqual([{ day: new Date(2026, 10, 1).toISOString(), large: '9007199254740993' }]);
  });
  it('keeps empty batch result and zero count', async () => {
    expect(await query()).toEqual({ columns: [], rows: [], rowCount: 0, command: undefined });
  });
  it('rolls back errors and closes its client without replay', async () => {
    transport.fail = true;
    await expect(query()).rejects.toThrow('synthetic query failure');
    expect(transport.statements).toEqual(['BEGIN', { text: 'synthetic SQL batch', rowMode: 'array' }, 'ROLLBACK']);
    expect(transport.ended).toBe(true);
  });
});
