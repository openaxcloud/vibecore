import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const concurrentlyManifest = require.resolve('concurrently/package.json');
const requireFromConcurrently = createRequire(concurrentlyManifest);
const { quote, parse } = requireFromConcurrently('shell-quote');
const { ExpandArguments } = require(join(dirname(concurrentlyManifest), 'dist/src/command-parser/expand-arguments.js'));
const { scripts } = require('../package.json');

// String-only checks: no shell, child process, or generated command is executed.
describe('shell-quote resolved by concurrently (GHSA-pqg4-j6r4-53mv)', () => {
  it.each(['\n', '\r', '\u2028', '\u2029'])('rejects a line terminator after a comment: %j', (separator) => {
    expect(() => quote(['label', { comment: 'note' }, `first${separator}second`])).toThrow(TypeError);
  });

  it.each([
    ['plain', 'two words', ''],
    ["apostrophe's", 'double"quote', 'dollar$literal'],
    ['#literal', 'semi;colon', 'back\\slash'],
  ])('preserves benign string arguments: %j', (...args) => {
    expect(parse(quote(args))).toEqual(args);
  });

  it.each(['dev:all', 'electron:build:deps'])('keeps the trusted repository script unchanged: %s', (name) => {
    const command = scripts[name];
    expect(command).toMatch(/^concurrently /);
    expect(new ExpandArguments([]).parse({ command }).command).toBe(command);
    expect(parse(command).every((token) => typeof token === 'string')).toBe(true);
  });

  it('preserves concurrently argument expansion for spaces and quotes', () => {
    const args = ['two words', "apostrophe's", ''];
    const expanded = new ExpandArguments(args).parse({ command: 'label {@}' }).command;
    expect(parse(expanded)).toEqual(['label', ...args]);
  });
});
