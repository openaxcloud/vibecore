import { describe, expect, it } from 'vitest';
import { buildCreateTable, type CreateColumnType } from './create-table';

describe('PostgreSQL table creation', () => {
  it('always supplies an identity primary key, including tables without extra columns', () => {
    expect(buildCreateTable({ schema: 'public', name: 'orders', columns: [] })).toEqual({
      query: 'CREATE TABLE "public"."orders" (\n  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY\n);',
    });
  });
  it('quotes each identifier independently and never interprets injected SQL', () => {
    const result = buildCreateTable({
      schema: 'odd"schema',
      name: 'x"; DROP TABLE users;--',
      columns: [{ name: 'a"b', type: 'text', required: true }],
    });
    expect(result).toEqual({
      query:
        'CREATE TABLE "odd""schema"."x""; DROP TABLE users;--" (\n  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  "a""b" text NOT NULL\n);',
    });
  });
  it.each(['', ' ', 'a\0b', 'a'.repeat(64), 'é'.repeat(32)])('rejects invalid or truncated identifier %j', (name) => {
    expect(buildCreateTable({ schema: 'public', name, columns: [] })).toEqual({ error: 'identifier' });
  });
  it('rejects reserved id and duplicate names after trimming', () => {
    expect(
      buildCreateTable({ schema: 'public', name: 't', columns: [{ name: ' ID ', type: 'integer', required: false }] }),
    ).toEqual({ error: 'reserved' });
    expect(
      buildCreateTable({
        schema: 'public',
        name: 't',
        columns: ['a', ' a '].map((name) => ({ name, type: 'text', required: false })),
      }),
    ).toEqual({ error: 'duplicate' });
  });
  it('rejects a forged SQL type instead of interpolating it', () => {
    expect(
      buildCreateTable({
        schema: 'public',
        name: 't',
        columns: [{ name: 'a', type: 'text);DROP TABLE users;--' as CreateColumnType, required: false }],
      }),
    ).toEqual({ error: 'type' });
  });
});
