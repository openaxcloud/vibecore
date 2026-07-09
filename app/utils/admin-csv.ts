/*
 * Small, dependency-free CSV serializer shared by admin exports (F24 account
 * deletions, etc.). Kept out of the route module so the exact export shape can be
 * unit-tested without pulling in server-only loader code.
 */
/*
 * Serialize `rows` to CSV using a fixed `columns` order. Every field is quoted
 * and inner quotes are doubled (RFC 4180), so values containing commas, quotes or
 * newlines survive a round-trip. Missing/undefined/null cells become empty.
 */
export function rowsToCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
}
