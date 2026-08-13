import { describe, expect, it } from 'vitest';
import { describeSkipReason, parseDotEnv } from './parse-dot-env';

describe('parseDotEnv', () => {
  it('parses plain KEY=value lines and trims whitespace', () => {
    const result = parseDotEnv('  DATABASE_URL = postgres://db:5432/app  \nPORT=3000');

    expect(result.entries).toEqual([
      { key: 'DATABASE_URL', value: 'postgres://db:5432/app' },
      { key: 'PORT', value: '3000' },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('strips the `export ` prefix', () => {
    const result = parseDotEnv('export STRIPE_SECRET_KEY=sk_test_123');

    expect(result.entries).toEqual([{ key: 'STRIPE_SECRET_KEY', value: 'sk_test_123' }]);
  });

  it('strips one matching pair of double or single quotes', () => {
    const result = parseDotEnv(`A="hello world"\nB='single quoted'\nC="unbalanced'`);

    expect(result.entries).toEqual([
      { key: 'A', value: 'hello world' },
      { key: 'B', value: 'single quoted' },

      // Mismatched quotes are NOT a matching pair — value kept verbatim.
      { key: 'C', value: `"unbalanced'` },
    ]);
  });

  it('keeps `=` characters inside the value (only the first = splits)', () => {
    const result = parseDotEnv('JWT=abc==def=');

    expect(result.entries).toEqual([{ key: 'JWT', value: 'abc==def=' }]);
  });

  it('allows empty values', () => {
    const result = parseDotEnv('EMPTY=');

    expect(result.entries).toEqual([{ key: 'EMPTY', value: '' }]);
  });

  it('skips comments and blank lines silently (not reported as skipped)', () => {
    const result = parseDotEnv('# comment\n\n   \nKEY=value\n# another');

    expect(result.entries).toEqual([{ key: 'KEY', value: 'value' }]);
    expect(result.skipped).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const result = parseDotEnv('A=1\r\nB=2\r\n');

    expect(result.entries).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: '2' },
    ]);
  });

  it('reports lines without an = separator, with 1-based line numbers', () => {
    const result = parseDotEnv('GOOD=1\nthis line has no equals\n=starts-with-equals');

    expect(result.entries).toEqual([{ key: 'GOOD', value: '1' }]);
    expect(result.skipped).toEqual([
      { line: 2, text: 'this line has no equals', reason: 'no-equals-sign' },
      { line: 3, text: '=starts-with-equals', reason: 'no-equals-sign' },
    ]);
  });

  it('reports invalid key names (spaces, dashes, leading digits)', () => {
    const result = parseDotEnv('MY KEY=1\nMY-KEY=2\n1KEY=3\nOK_KEY=4');

    expect(result.entries).toEqual([{ key: 'OK_KEY', value: '4' }]);
    expect(result.skipped.map((s) => s.reason)).toEqual(['invalid-key', 'invalid-key', 'invalid-key']);
    expect(result.skipped.map((s) => s.line)).toEqual([1, 2, 3]);
  });

  it('deduplicates repeated keys — last occurrence wins, one preview row', () => {
    const result = parseDotEnv('API_KEY=first\nOTHER=x\nAPI_KEY=second');

    expect(result.entries).toEqual([
      { key: 'API_KEY', value: 'second' },
      { key: 'OTHER', value: 'x' },
    ]);
  });

  it('truncates long skipped lines for display', () => {
    const longLine = `not-a-valid-line ${'x'.repeat(200)}`;
    const result = parseDotEnv(longLine);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].text.length).toBeLessThanOrEqual(81); // 80 chars + ellipsis
    expect(result.skipped[0].text.endsWith('…')).toBe(true);
  });

  it('returns nothing for an empty paste', () => {
    expect(parseDotEnv('')).toEqual({ entries: [], skipped: [] });
  });
});

describe('describeSkipReason', () => {
  it('maps both reasons to human labels', () => {
    expect(describeSkipReason('no-equals-sign')).toContain('=');
    expect(describeSkipReason('invalid-key')).toContain('key');
  });
});
