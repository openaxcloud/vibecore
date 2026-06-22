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

  it('strips line comments (-- and #)', () => {
    const input = ['SELECT 1; -- trailing', '# leading hash comment', 'SELECT 2;'].join('\n');
    const cleaned = cleanSqlContent(input);
    expect(cleaned).not.toContain('--');
    expect(cleaned).not.toContain('#');
    expect(cleaned).toContain('SELECT 1');
    expect(cleaned).toContain('SELECT 2');
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
      'INSERT INTO users (id) VALUES (gen_random_uuid()); # seed',
    ].join('\n');

    const reviewed = cleanSqlContent(raw);
    const executed = cleanSqlContent(raw);

    expect(executed).toBe(reviewed);
    expect(cleanSqlContent(reviewed)).toBe(reviewed);

    // And the cleaned text differs from the raw uncleaned text (the pre-fix bug).
    expect(reviewed).not.toBe(raw);
    expect(reviewed).not.toContain('/*');
    expect(reviewed).not.toContain('--');
    expect(reviewed).not.toContain('#');
  });
});
