import { expect, it } from 'vitest';
import { normalizeRows } from './query-result';
it.each(['{broken', 'null', '{}', '[null]', '[1]'])(
  'rejects malformed rowsJson instead of claiming an empty result: %s',
  (rowsJson) => {
    expect(() => normalizeRows({ rowsJson, rows: [] })).toThrow();
  },
);
it('keeps legacy object and matrix rows compatible, without inherited property reads', () => {
  expect(
    normalizeRows({ columns: ['__proto__'], rows: [JSON.parse('{"__proto__":"own"}'), {}, ['matrix']] }).rows,
  ).toEqual([['own'], [null], ['matrix']]);
});
it('preserves nested special JSON keys as own properties and never pollutes prototypes', () => {
  const rowsJson = '[{"__proto__":{"__proto__":{"marker":"nested"},"constructor":"c","prototype":"p"}}]';
  const value = normalizeRows({ columns: ['__proto__'], rowsJson }).rows[0][0] as Record<string, unknown>;
  expect(Object.hasOwn(value, '__proto__')).toBe(true);
  expect(value.__proto__).toEqual({ marker: 'nested' });
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(Object.hasOwn(Object.prototype, 'marker')).toBe(false);
});

it.each([null, ['[]'], 0, {}])('rejects non-string encoded rows: %j', (rowsJson) => {
  expect(() => normalizeRows({ rowsJson: rowsJson as unknown as string })).toThrow();
});
