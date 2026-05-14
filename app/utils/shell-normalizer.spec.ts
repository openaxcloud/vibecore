import { describe, expect, it } from 'vitest';
import { normalizeShellCommand, splitPipeSegments } from './shell-normalizer';

describe('normalizeShellCommand', () => {
  it('rewrites head -N to head -n N', () => {
    expect(normalizeShellCommand('head -20 package.json')).toBe('head -n 20 package.json');
  });

  it('rewrites tail -N to tail -n N', () => {
    expect(normalizeShellCommand('tail -50 log.txt')).toBe('tail -n 50 log.txt');
  });

  it('rewrites the obsolete form after a pipe', () => {
    expect(normalizeShellCommand('cat package.json | head -20')).toBe('cat package.json | head -n 20');
  });

  it('rewrites both segments of a head|tail pipeline', () => {
    expect(normalizeShellCommand('head -200 file | tail -5')).toBe('head -n 200 file | tail -n 5');
  });

  it('leaves the POSIX form untouched', () => {
    expect(normalizeShellCommand('head -n 20 package.json')).toBe('head -n 20 package.json');
  });

  it('is idempotent on already-normalized commands', () => {
    const once = normalizeShellCommand('head -20 a | tail -5 b');
    const twice = normalizeShellCommand(once);
    expect(twice).toBe(once);
  });

  it('does not match utility names embedded in other words', () => {
    expect(normalizeShellCommand('overhead -20 something')).toBe('overhead -20 something');
    expect(normalizeShellCommand('cocktail -50 menu.txt')).toBe('cocktail -50 menu.txt');
  });

  it('does not match flags that are not purely numeric', () => {
    expect(normalizeShellCommand('head -v file')).toBe('head -v file');
    expect(normalizeShellCommand('head -c20 file')).toBe('head -c20 file');
  });

  it('handles the obsolete form at end of line with no trailing space', () => {
    expect(normalizeShellCommand('head -20')).toBe('head -n 20');
  });

  it('passes through empty / non-string inputs without throwing', () => {
    expect(normalizeShellCommand('')).toBe('');
    expect(normalizeShellCommand(null as unknown as string)).toBe(null);
    expect(normalizeShellCommand(undefined as unknown as string)).toBe(undefined);
  });

  it('preserves quoted segments verbatim', () => {
    expect(normalizeShellCommand('echo "head -20" && head -5 file')).toBe('echo "head -20" && head -n 5 file');
  });
});

describe('splitPipeSegments', () => {
  it('returns a single segment when there is no pipe', () => {
    expect(splitPipeSegments('cat package.json')).toEqual(['cat package.json']);
  });

  it('splits on top-level pipes', () => {
    expect(splitPipeSegments('cat a | head -20 | tail -5')).toEqual(['cat a', 'head -20', 'tail -5']);
  });

  it('does not split on pipes inside double quotes', () => {
    expect(splitPipeSegments('echo "a | b" | head -1')).toEqual(['echo "a | b"', 'head -1']);
  });

  it('does not split on pipes inside single quotes', () => {
    expect(splitPipeSegments("grep 'foo|bar' file | wc -l")).toEqual(["grep 'foo|bar' file", 'wc -l']);
  });

  it('honours backslash escapes', () => {
    expect(splitPipeSegments('echo a\\|b | head -1')).toEqual(['echo a\\|b', 'head -1']);
  });

  it('trims whitespace around segments', () => {
    expect(splitPipeSegments('  cat a   |   head -20  ')).toEqual(['cat a', 'head -20']);
  });

  it('drops trailing empty segments', () => {
    expect(splitPipeSegments('cat a |')).toEqual(['cat a']);
  });
});
