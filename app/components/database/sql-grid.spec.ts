import { describe, expect, it } from 'vitest';
import { columnLookupKey, rowUpdateSql, tableSql } from './sql-grid';
import { colonnesDuSchema } from './tables-du-schema';

describe('database grid SQL identity', () => {
  it('quotes dots, reserved names and delimiter characters as identifiers', () => {
    expect(tableSql({ schema: 'with.dot', nom: 'a"b' })).toBe('"with.dot"."a""b"');
    expect(tableSql({ schema: 'with.dot', nom: 'a`b' }, 'mysql')).toBe('`with.dot`.`a``b`');
  });
  it('refuses updates with no key or an incomplete composite key', () => {
    const table = { nom: 'items' };
    expect(rowUpdateSql(table, [{ nom: 'name', type: 'text' }], ['name'], ['same'], 'name', 'next')).toBeUndefined();
    expect(
      rowUpdateSql(table, [{ nom: 'id', type: 'int', primaryKey: true }], ['name'], ['same'], 'name', 'next'),
    ).toBeUndefined();
  });
  it('keeps same-named tables in different schemas separate', () => {
    const columns = colonnesDuSchema({
      columns: [
        { table_schema: 'a', table_name: 'items', column_name: 'id', is_primary_key: true },
        { table_schema: 'b', table_name: 'items', column_name: 'name' },
      ],
    });
    expect(columns.get(columnLookupKey({ schema: 'a', nom: 'items' }))).toEqual([
      { nom: 'id', type: '', primaryKey: true },
    ]);
    expect(columns.get(columnLookupKey({ schema: 'b', nom: 'items' }))).toEqual([{ nom: 'name', type: '' }]);
  });
  it('encodes MySQL text independently of NO_BACKSLASH_ESCAPES mode', () => {
    expect(
      rowUpdateSql(
        { nom: 'items' },
        [
          { nom: 'id', type: 'int', primaryKey: true },
          { nom: 'name', type: 'text' },
        ],
        ['id', 'name'],
        [1, null],
        'name',
        "a\\'",
        'mysql',
      ),
    ).toBe("UPDATE `items` SET `name` = CONVERT(X'615c27' USING utf8mb4) WHERE `id` = 1;");
  });
});
