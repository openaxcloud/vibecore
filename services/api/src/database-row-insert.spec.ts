import type { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { databaseRowSchema, insertPostgresRow } from './database-row-insert.js';

const id = { column_name: 'id', is_nullable: 'NO', is_identity: 'YES', is_generated: 'NEVER', has_default: false };
const label = { ...id, column_name: 'label', is_identity: 'NO' };

function fixture(columns = [id, label], rowCount = 1) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT')) {
      return { rows: columns };
    }

    if (sql.startsWith('INSERT')) {
      return { command: 'INSERT', rowCount };
    }

    return { rows: [] };
  });
  return { query, client: { query } as unknown as Pick<Client, 'query'> };
}

const input = (values: unknown) =>
  databaseRowSchema.parse({
    key: 'DATABASE_URL',
    schema: 'public',
    table: 'contacts',
    values:
      values && typeof values === 'object' && !Array.isArray(values)
        ? Object.entries(values).map(([column, field]) => ({ column, ...(field as object) }))
        : values,
  });
describe('PostgreSQL row insertion', () => {
  it('omits identity and binds hostile text as a value, then commits', async () => {
    const { query, client } = fixture();
    const value = "'); DROP TABLE contacts; --";
    expect(await insertPostgresRow(client, input({ label: { mode: 'value', value } }))).toEqual({
      command: 'INSERT',
      rowCount: 1,
      columns: [],
      rows: [],
    });
    expect(query).toHaveBeenCalledWith('INSERT INTO "public"."contacts" ("label") VALUES ($1)', [value]);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it.each([
    { id: { mode: 'value', value: '1' }, label: { mode: 'value', value: 'ok' } },
    { id: { mode: 'default' }, label: { mode: 'value', value: 'ok' } },
    { missing: { mode: 'value', value: 'ok' } },
    { label: { mode: 'null' } },
    { label: { mode: 'default' } },
    {},
  ])('rejects invalid fields before insertion (%j)', async (values) => {
    const { query, client } = fixture();
    await expect(insertPostgresRow(client, input(values))).rejects.toMatchObject({
      code: 'DATABASE_ROW_INVALID',
      statusCode: 400,
    });
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('supports nullable NULL and quotes hostile identifiers', async () => {
    const { query, client } = fixture([{ ...label, column_name: 'a"b', is_nullable: 'YES' }]);
    await insertPostgresRow(client, { ...input({ 'a"b': { mode: 'null' } }), table: 'x"y' });
    expect(query).toHaveBeenCalledWith('INSERT INTO "public"."x""y" ("a""b") VALUES ($1)', [null]);
  });
  it('uses DEFAULT VALUES when all columns are generated or defaulted', async () => {
    const { query, client } = fixture([id, { ...label, has_default: true }]);
    await insertPostgresRow(client, input({ label: { mode: 'default' } }));
    expect(query).toHaveBeenCalledWith('INSERT INTO "public"."contacts" DEFAULT VALUES', []);
  });
  it('rejects explicit generated expressions and rolls back suppressed inserts', async () => {
    const generated = fixture([{ ...label, is_generated: 'ALWAYS' }]);
    await expect(
      insertPostgresRow(generated.client, input({ label: { mode: 'value', value: 'x' } })),
    ).rejects.toMatchObject({ code: 'DATABASE_ROW_INVALID' });

    const suppressed = fixture([id], 0);
    await expect(insertPostgresRow(suppressed.client, input({}))).rejects.toMatchObject({
      code: 'DATABASE_ROW_INVALID',
    });
    expect(suppressed.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it.each(['22P02', '23505', '23514'])('masks SQLSTATE %s only after rollback', async (code) => {
    const { query, client } = fixture();
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT')) {
        return { rows: [id, label] };
      }

      if (sql.startsWith('INSERT')) {
        throw Object.assign(new Error('private submitted value'), { code });
      }

      return { rows: [] };
    });
    await expect(
      insertPostgresRow(client, input({ label: { mode: 'value', value: 'private' } })),
    ).rejects.toMatchObject({ code: 'DATABASE_ROW_INVALID', statusCode: 400 });
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('preserves unknown SQLSTATE and rollback failures', async () => {
    const { query, client } = fixture();
    const unknown = Object.assign(new Error('internal failure'), { code: 'XX000' });
    const rollback = new Error('rollback failed');

    let failRollback = false;
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT')) {
        return { rows: [id, label] };
      }

      if (sql.startsWith('INSERT')) {
        throw unknown;
      }

      if (sql === 'ROLLBACK' && failRollback) {
        throw rollback;
      }

      return { rows: [] };
    });

    const body = input({ label: { mode: 'value', value: 'x' } });
    await expect(insertPostgresRow(client, body)).rejects.toBe(unknown);
    failRollback = true;
    await expect(insertPostgresRow(client, body)).rejects.toBe(rollback);
  });
  it('preserves own special column names through parsing and parameter binding', async () => {
    const names = ['__proto__', 'constructor', 'a"b'];

    const fields = JSON.parse(
      '{"__proto__":{"mode":"value","value":"first"},"constructor":{"mode":"value","value":"second"},"a\\"b":{"mode":"value","value":"third"}}',
    );

    const parsed = input(fields);
    expect(parsed.values.map((field) => field.column)).toEqual(names);
    expect(Object.getPrototypeOf(parsed.values[0])).toBe(Object.prototype);

    const { query, client } = fixture(names.map((columnName) => ({ ...label, column_name: columnName })));
    await insertPostgresRow(client, parsed);
    expect(query).toHaveBeenCalledWith(
      'INSERT INTO "public"."contacts" ("__proto__", "constructor", "a""b") VALUES ($1, $2, $3)',
      ['first', 'second', 'third'],
    );
  });
  it.each([null, 'text', 42])('rejects non-array row values %j', (values) => {
    expect(() => input(values)).toThrow();
  });
  it('still validates strict modes on special keys', () => {
    expect(() => input(JSON.parse('{"__proto__":{"mode":"sql","value":"NOW()"}}'))).toThrow();
    expect(() => input(JSON.parse('{"__proto__":{"mode":"null","value":"extra"}}'))).toThrow();
  });
  it('rejects duplicate columns and the obsolete record transport', () => {
    const body = { key: 'DATABASE_URL', schema: 'public', table: 'contacts' };
    expect(() =>
      databaseRowSchema.parse({
        ...body,
        values: [
          { column: '__proto__', mode: 'null' },
          { column: '__proto__', mode: 'null' },
        ],
      }),
    ).toThrow();
    expect(() => databaseRowSchema.parse({ ...body, values: {} })).toThrow();
  });
  it('rejects client SQL, malformed modes and invalid identifiers', () => {
    expect(() => databaseRowSchema.parse({ ...input({}), query: 'DELETE FROM contacts' })).toThrow();
    expect(() => input({ label: { mode: 'sql', value: 'NOW()' } })).toThrow();
    expect(() => databaseRowSchema.parse({ ...input({}), schema: '\u0000' })).toThrow();
  });
});
