import { describe, expect, it } from 'vitest';

import { assertReadOnlySql } from '../app';

/**
 * Regression coverage for the IDE database query editor's read-only guard.
 *
 * The previous implementation only checked that the trimmed query *started*
 * with a read keyword after stripping a single trailing `;`. Because Postgres'
 * simple-query protocol (used by `pg`'s `client.query(string)`) runs every
 * semicolon-separated statement, a payload like `SELECT 1; DROP TABLE users;`
 * passed the guard and the DROP executed — a data-loss vector. Data-modifying
 * CTEs (`WITH t AS (DELETE ... RETURNING *) SELECT * FROM t`) slipped through
 * the same way.
 */
describe('assertReadOnlySql', () => {
  const expectRejected = (query: string) => {
    expect(() => assertReadOnlySql(query)).toThrowError(/read-only|single read-only|Data-modifying/i);
  };

  it('allows plain read-only statements', () => {
    expect(() => assertReadOnlySql('SELECT * FROM users')).not.toThrow();
    expect(() => assertReadOnlySql('select id from t where name = $1')).not.toThrow();
    expect(() => assertReadOnlySql('SHOW TABLES')).not.toThrow();
    expect(() => assertReadOnlySql('EXPLAIN SELECT 1')).not.toThrow();
    expect(() => assertReadOnlySql('  SELECT 1;  ')).not.toThrow();
    expect(() => assertReadOnlySql('WITH t AS (SELECT 1 AS n) SELECT n FROM t')).not.toThrow();
  });

  it('rejects a write smuggled behind a leading SELECT (multi-statement)', () => {
    expectRejected('SELECT 1; DROP TABLE users;');
    expectRejected('SELECT 1; DELETE FROM accounts');
    expectRejected('select 1; update users set admin = true');
  });

  it('rejects data-modifying CTEs', () => {
    expectRejected('WITH t AS (DELETE FROM users RETURNING *) SELECT * FROM t');
    expectRejected('with x as (insert into logs values (1) returning id) select * from x');
  });

  it('rejects outright write statements', () => {
    expectRejected('DELETE FROM users');
    expectRejected('UPDATE users SET admin = true');
    expectRejected('INSERT INTO users (id) VALUES (1)');
    expectRejected('DROP TABLE users');
    expectRejected('TRUNCATE users');
  });

  it('is not fooled by a semicolon or keyword inside a string literal', () => {
    // The `;` and the word "delete" live inside a string, so this is a single
    // legitimate read statement and must be allowed.
    expect(() => assertReadOnlySql("SELECT 'a; delete from x' AS note")).not.toThrow();
    expect(() => assertReadOnlySql("SELECT * FROM t WHERE msg = 'drop table t'")).not.toThrow();
  });

  it('ignores a trailing comment after the statement', () => {
    expect(() => assertReadOnlySql('SELECT 1 -- ; DROP TABLE users')).not.toThrow();
    expect(() => assertReadOnlySql('SELECT 1 /* ; DROP TABLE users */')).not.toThrow();
  });
});
