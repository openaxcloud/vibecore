import type { ColonneDuSchema, TableDuSchema } from './tables-du-schema.js';

export function columnLookupKey(table: TableDuSchema): string {
  return JSON.stringify([table.schema ?? '', table.nom]);
}

export function quoteIdentifier(value: string, kind = 'postgres'): string {
  const quote = kind === 'mysql' ? '`' : '"';

  return quote + value.replaceAll(quote, quote + quote) + quote;
}

export function tableSql(table: TableDuSchema, kind = 'postgres'): string {
  return [table.schema, table.nom]
    .filter((part): part is string => part !== undefined)
    .map((part) => quoteIdentifier(part, kind))
    .join('.');
}

function literal(value: unknown, kind: string): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (kind === 'mysql') {
    const hex = Array.from(new TextEncoder().encode(String(value)), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );

    return `CONVERT(X'${hex}' USING utf8mb4)`;
  }

  /*
   * PostgreSQL standard_conforming_strings is normally on; E literals also make
   * backslashes unambiguous when a project has changed its session defaults.
   */
  const text = String(value).replaceAll('\\', '\\\\').replaceAll("'", "''");

  return `E'${text}'`;
}

/** Never fall back to matching all values: duplicate rows are not an identity. */
export function rowUpdateSql(
  table: TableDuSchema,
  schema: ColonneDuSchema[],
  columns: string[],
  row: unknown[],
  column: string,
  value: string,
  kind = 'postgres',
): string | undefined {
  const keys = schema.filter((item) => item.primaryKey);

  if (
    !keys.length ||
    !schema.some((item) => item.nom === column) ||
    keys.some((key) => !columns.includes(key.nom) || row[columns.indexOf(key.nom)] == null)
  ) {
    return undefined;
  }

  const where = keys
    .map((key) => `${quoteIdentifier(key.nom, kind)} = ${literal(row[columns.indexOf(key.nom)], kind)}`)
    .join(' AND ');

  return `UPDATE ${tableSql(table, kind)} SET ${quoteIdentifier(column, kind)} = ${literal(value, kind)} WHERE ${where};`;
}
