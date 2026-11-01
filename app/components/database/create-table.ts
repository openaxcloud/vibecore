import { quoteIdentifier } from './sql-grid';

export const columnTypes = ['text', 'integer', 'numeric', 'boolean', 'date', 'timestamp'] as const;
export type CreateColumnType = (typeof columnTypes)[number];
export type CreateColumn = { name: string; type: CreateColumnType; required: boolean };
export type CreateTableError = 'identifier' | 'duplicate' | 'reserved' | 'type';
export type CreateTableDefinition = { schema: string; name: string; columns: CreateColumn[] };

/** PostgreSQL identifiers are limited to 63 UTF-8 bytes; reject rather than silently truncate. */
function validIdentifier(value: string): boolean {
  return (
    value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value) && new TextEncoder().encode(value).length <= 63
  );
}

export function buildCreateTable(definition: CreateTableDefinition): { query: string } | { error: CreateTableError } {
  const schema = definition.schema.trim();
  const name = definition.name.trim();

  if (!validIdentifier(schema) || !validIdentifier(name)) {
    return { error: 'identifier' };
  }

  const names = new Set<string>();
  const columns = ['"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY'];

  for (const column of definition.columns) {
    const columnName = column.name.trim();

    if (!validIdentifier(columnName)) {
      return { error: 'identifier' };
    }

    if (columnName.toLowerCase() === 'id') {
      return { error: 'reserved' };
    }

    if (names.has(columnName)) {
      return { error: 'duplicate' };
    }

    if (!(columnTypes as readonly string[]).includes(column.type)) {
      return { error: 'type' };
    }

    names.add(columnName);
    columns.push(`${quoteIdentifier(columnName)} ${column.type}${column.required ? ' NOT NULL' : ''}`);
  }

  return {
    query: `CREATE TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(name)} (\n  ${columns.join(',\n  ')}\n);`,
  };
}
