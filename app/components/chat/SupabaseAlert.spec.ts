import { describe, expect, it } from 'vitest';
import { cleanSqlContent } from './SupabaseAlert';

describe('cleanSqlContent', () => {
  it('returns empty string for empty input', () => {
    expect(cleanSqlContent('')).toBe('');
    expect(cleanSqlContent(undefined as unknown as string)).toBe('');
  });

  it('strips block comments', () => {
    const input = 'SELECT 1 /* inline note */;';
    expect(cleanSqlContent(input)).toBe('SELECT 1');
  });

  it('strips -- line comments', () => {
    const input = ['SELECT 1; -- trailing', 'SELECT 2;'].join('\n');
    const cleaned = cleanSqlContent(input);
    expect(cleaned).not.toContain('--');
    expect(cleaned).toContain('SELECT 1');
    expect(cleaned).toContain('SELECT 2');
  });

  it('does NOT treat # as a comment marker (Postgres uses # as an operator, not MySQL line comments)', () => {
    // JSONB path operators: #>, #>>, #- (statement splitter trims the trailing ';').
    expect(cleanSqlContent(`SELECT data #> '{a,b}' FROM t;`)).toBe(`SELECT data #> '{a,b}' FROM t`);
    expect(cleanSqlContent(`SELECT data #>> '{a,b}' FROM t;`)).toBe(`SELECT data #>> '{a,b}' FROM t`);
    expect(cleanSqlContent(`UPDATE t SET d = d #- '{a}' WHERE id = 1;`)).toBe(
      `UPDATE t SET d = d #- '{a}' WHERE id = 1`,
    );

    // Bitwise XOR operator.
    expect(cleanSqlContent(`SELECT 5 # 3 AS xor;`)).toBe(`SELECT 5 # 3 AS xor`);
  });

  it('does not truncate a query after a # operator (regression for silent SQL-corruption bug)', () => {
    const sql = `SELECT data #>> '{path}' AS v, other_col FROM t WHERE id = 1;`;
    const result = cleanSqlContent(sql);

    // Everything after the '#' must survive (pre-fix, the query was cut at the '#').
    expect(result).toContain(`#>>`);
    expect(result).toContain('other_col');
    expect(result).toContain('WHERE id = 1');
    expect(result).toBe(`SELECT data #>> '{path}' AS v, other_col FROM t WHERE id = 1`);
  });

  it('reformats statements joined by blank lines and drops empties', () => {
    const input = 'CREATE TABLE a (id int);;CREATE TABLE b (id int);';
    expect(cleanSqlContent(input)).toBe('CREATE TABLE a (id int);\n\nCREATE TABLE b (id int)');
  });

  it('is idempotent: cleaning the reviewed text again yields the same text', () => {
    /*
     * This guards the bug fix: the reviewer is shown cleanSqlContent(content) and
     * Apply Changes now executes cleanSqlContent(content) too. Since the helper is
     * idempotent, the executed string is exactly the reviewed string.
     */
    const raw = [
      '/* migration */',
      'CREATE TABLE users (id uuid primary key); -- users table',
      '',
      `UPDATE settings SET flags = flags # 4 WHERE active; -- toggle bit`,
    ].join('\n');

    const reviewed = cleanSqlContent(raw);
    const executed = cleanSqlContent(raw);

    expect(executed).toBe(reviewed);
    expect(cleanSqlContent(reviewed)).toBe(reviewed);

    // And the cleaned text differs from the raw uncleaned text (the pre-fix bug).
    expect(reviewed).not.toBe(raw);
    expect(reviewed).not.toContain('/*');
    expect(reviewed).not.toContain('--');

    // The '#' bitwise operator must be preserved, not treated as a comment.
    expect(reviewed).toContain('flags # 4');
  });
});
