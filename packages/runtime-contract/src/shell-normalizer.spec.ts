import { describe, expect, it } from 'vitest';
import {
  normalizeShellCommand,
  normalizeShellCommandArgs,
  normalizeShellCommandRequest,
  splitPipeSegments,
} from './index.js';

describe('normalizeShellCommand', () => {
  it('rewrites obsolete head and tail counts to POSIX -n counts', () => {
    expect(normalizeShellCommand('cat package.json | head -20')).toBe('cat package.json | head -n 20');
    expect(normalizeShellCommand('head -200 file | tail -5')).toBe('head -n 200 file | tail -n 5');
    expect(normalizeShellCommand('head -20; tail -5')).toBe('head -n 20; tail -n 5');
  });

  it('preserves quoted shell text verbatim', () => {
    expect(normalizeShellCommand('echo "head -20" && head -5 file')).toBe('echo "head -20" && head -n 5 file');
    expect(normalizeShellCommand("printf '%s\\n' 'tail -5' | head -1")).toBe("printf '%s\\n' 'tail -5' | head -n 1");
  });

  it('does not rewrite unrelated flags or embedded command names', () => {
    expect(normalizeShellCommand('overhead -20 something')).toBe('overhead -20 something');
    expect(normalizeShellCommand('head -c20 file')).toBe('head -c20 file');
  });
});

describe('normalizeShellCommandArgs', () => {
  it('normalizes shell -c payloads for jsh, sh, bash, and env-launched shells', () => {
    expect(normalizeShellCommandArgs('/bin/jsh', ['-c', 'cat package.json | head -20'])).toEqual([
      '-c',
      'cat package.json | head -n 20',
    ]);
    expect(normalizeShellCommandArgs('bash', ['-lc', 'tail -5 app.log'])).toEqual(['-lc', 'tail -n 5 app.log']);
    expect(normalizeShellCommandArgs('/usr/bin/env', ['NODE_ENV=test', 'sh', '-lc', 'head -1 file'])).toEqual([
      'NODE_ENV=test',
      'sh',
      '-lc',
      'head -n 1 file',
    ]);
  });

  it('leaves non-shell commands untouched', () => {
    const args = ['-e', 'console.log("head -20")'];
    expect(normalizeShellCommandArgs('node', args)).toBe(args);
  });
});

describe('normalizeShellCommandRequest', () => {
  it('returns a cloned request only when shell args changed', () => {
    const original = { command: 'sh', args: ['-lc', 'cat package.json | head -20'], cwd: '/workspace' };
    expect(normalizeShellCommandRequest(original)).toEqual({
      command: 'sh',
      args: ['-lc', 'cat package.json | head -n 20'],
      cwd: '/workspace',
    });

    const untouched = { command: 'node', args: ['-v'] };
    expect(normalizeShellCommandRequest(untouched)).toBe(untouched);
  });
});

describe('splitPipeSegments', () => {
  it('splits only on top-level pipes', () => {
    expect(splitPipeSegments('echo "a | b" | head -1')).toEqual(['echo "a | b"', 'head -1']);
    expect(splitPipeSegments("grep 'foo|bar' file | wc -l")).toEqual(["grep 'foo|bar' file", 'wc -l']);
  });
});
