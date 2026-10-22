import { describe, expect, it } from 'vitest';
import { isJsoncFile, parseJsonc } from './jsonc';

describe('shared JSONC parsing', () => {
  it('preserves strings containing comment markers, escaped quotes and comma/bracket patterns', () => {
    const values = {
      url: 'https://example.test/a',
      pattern: ',}',
      other: ',]',
      comment: '/* literal */',
      quote: '\\"',
    };

    const document = `${JSON.stringify(values).slice(0, -1)}, /* trailing comment */ }`;
    expect(parseJsonc(document)).toEqual(values);
  });

  it('allows block/line comments and trailing commas without merging tokens', () => {
    expect(parseJsonc('{/* start */"a": [1,2,],// line\n "b": true,}')).toEqual({ a: [1, 2], b: true });
    expect(() => parseJsonc('{"a": 1/*comment*/2}')).toThrow();
  });

  it.each(['{"a":1/* never closed', '{"a":', '[,]', '{,}', '[1,,]', '{"a":1,,}'])(
    'rejects incomplete or invalid JSONC: %s',
    (input) => expect(() => parseJsonc(input)).toThrow(),
  );

  it.each([
    'tsconfig.json',
    'tsconfig.app.json',
    'jsconfig.json',
    'nested/.vscode/settings.json',
    'dir\\tsconfig.node.json',
  ])('recognizes JSONC configuration path %s', (path) => expect(isJsoncFile(path)).toBe(true));

  it.each(['package.json', 'nested/package.json', 'app.json', 'not-tsconfig.json', 'vscode/settings.json'])(
    'retains strict JSON for %s',
    (path) => expect(isJsoncFile(path)).toBe(false),
  );
});
