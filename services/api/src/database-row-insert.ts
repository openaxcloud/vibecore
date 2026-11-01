import type { Client } from 'pg';
import { z } from 'zod';
import { appPublicEnglish } from './app-public-copy.js';

const identifier = z
  .string()
  .min(1)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 63 && !/[\u0000-\u001f\u007f]/u.test(value));
export const databaseRowSchema = z
  .object({
    key: z.string().min(1).max(160),
    schema: identifier,
    table: identifier,

    values: z
      .array(
        z.discriminatedUnion('mode', [
          z.object({ column: identifier, mode: z.literal('value'), value: z.string().max(100000) }).strict(),
          z.object({ column: identifier, mode: z.literal('null') }).strict(),
          z.object({ column: identifier, mode: z.literal('default') }).strict(),
        ]),
      )
      .max(1600)
      .refine((fields) => new Set(fields.map((field) => field.column)).size === fields.length, {
        message: appPublicEnglish('DATABASE_ROW_INVALID'),
      }),
  })
  .strict();

type Column = {
  column_name: string;
  is_nullable: string;
  is_identity: string;
  is_generated: string;
  has_default: boolean;
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

const invalid = () =>
  Object.assign(new Error(appPublicEnglish('DATABASE_ROW_INVALID')), { statusCode: 400, code: 'DATABASE_ROW_INVALID' });

/** Metadata and INSERT share a lock, so concurrent DDL cannot invalidate validation. */
export async function insertPostgresRow(client: Pick<Client, 'query'>, input: z.infer<typeof databaseRowSchema>) {
  const table = `${quote(input.schema)}.${quote(input.table)}`;
  await client.query('BEGIN');

  try {
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query(`LOCK TABLE ${table} IN ROW EXCLUSIVE MODE`);

    const metadata = await client.query<Column>(
      'SELECT column_name, is_nullable, is_identity, is_generated, (column_default IS NOT NULL) AS has_default FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      [input.schema, input.table],
    );

    const columns = new Map(metadata.rows.map((column) => [column.column_name, column]));

    if (!columns.size || input.values.some((field) => !columns.has(field.column))) {
      throw invalid();
    }

    const fields = new Map(input.values.map((field) => [field.column, field]));
    const names: string[] = [];
    const values: Array<string | null> = [];

    for (const column of metadata.rows) {
      const field = fields.get(column.column_name);
      const generated = column.is_identity === 'YES' || column.is_generated !== 'NEVER';

      if (generated) {
        if (field) {
          throw invalid();
        }

        continue;
      }

      if (!field || field.mode === 'default') {
        if (field ? !column.has_default : !column.has_default && column.is_nullable !== 'YES') {
          throw invalid();
        }

        continue;
      }

      if (field.mode === 'null' && column.is_nullable !== 'YES') {
        throw invalid();
      }

      names.push(quote(column.column_name));
      values.push(field.mode === 'null' ? null : field.value);
    }

    const sql = names.length
      ? `INSERT INTO ${table} (${names.join(', ')}) VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})`
      : `INSERT INTO ${table} DEFAULT VALUES`;

    const result = await client.query(sql, values);

    if (result.command !== 'INSERT' || result.rowCount !== 1) {
      throw invalid();
    }

    await client.query('COMMIT');

    return { command: 'INSERT' as const, rowCount: 1, columns: [], rows: [] };
  } catch (error) {
    await client.query('ROLLBACK');

    // Convert only PostgreSQL data/constraint SQLSTATEs, after rollback succeeds.
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;

    if (typeof code === 'string' && /^(22|23)[A-Z0-9]{3}$/.test(code)) {
      throw invalid();
    }

    throw error;
  }
}
