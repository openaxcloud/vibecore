const INVALID_ROWS_ERROR_CODE = 'DATABASE_QUERY_ROWS_INVALID';

export type QueryResult = {
  columns?: string[];
  rows?: Array<Record<string, unknown> | unknown[]>;
  rowsJson?: string;
  rowCount?: number;
  command?: string;
  error?: string;
};

/** Decode only this panel's JSON transport; never silently treat corruption as an empty result. */
export function normalizeRows(result: QueryResult): { columns: string[]; rows: unknown[][] } {
  const encoded = Object.hasOwn(result, 'rowsJson');

  if (encoded && typeof result.rowsJson !== 'string') {
    throw new Error(INVALID_ROWS_ERROR_CODE);
  }

  const rows: unknown = encoded ? JSON.parse(result.rowsJson as string) : (result.rows ?? []);

  if (!Array.isArray(rows) || rows.some((row) => row === null || typeof row !== 'object')) {
    throw new Error(INVALID_ROWS_ERROR_CODE);
  }

  if (!rows.length) {
    return { columns: result.columns ?? [], rows: [] };
  }

  const first = rows[0];
  const columns = result.columns ?? (Array.isArray(first) ? first.map((_, i) => `col_${i + 1}`) : Object.keys(first));

  return {
    columns,
    rows: rows.map((row) =>
      Array.isArray(row) ? row : columns.map((column) => (Object.hasOwn(row, column) ? row[column] : null)),
    ),
  };
}

/** Read-only presentation; edit inputs and SQL literals retain their existing contract. */
export function formatQueryCell(value: unknown): string {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value);
}
