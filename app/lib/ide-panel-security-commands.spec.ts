import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSecurityGrepCommand, readSecurityGrepOutput } from './ide-panel-security';

// Real local shell/grep processes on disposable synthetic files, not a runtime E2E.
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'security-scan-'));
  directories.push(directory);

  return directory;
}

for (const kind of ['secrets', 'sast'] as const) {
  describe(`${kind} shell command`, () => {
    it('succeeds when grep finds no matches', () => {
      const cwd = fixture();
      writeFileSync(join(cwd, 'clean.txt'), 'ordinary fixture');

      const result = spawnSync('sh', ['-c', buildSecurityGrepCommand(kind)], { cwd, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(readSecurityGrepOutput(result.stdout)).toEqual({ output: '', complete: true });
    });
    it('returns real matches and excludes dependencies', () => {
      const cwd = fixture();
      const source = kind === 'secrets' ? 'token=synthetic-only' : 'eval(syntheticInput)';
      writeFileSync(join(cwd, 'source.txt'), source);
      mkdirSync(join(cwd, 'node_modules'));
      writeFileSync(join(cwd, 'node_modules', 'ignored.txt'), source);

      const result = spawnSync('sh', ['-c', buildSecurityGrepCommand(kind)], { cwd, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(readSecurityGrepOutput(result.stdout)).toEqual({ output: `./source.txt:1:${source}\n`, complete: true });
    });
    it('preserves a real grep option error instead of head masking it', () => {
      const cwd = fixture();
      const bin = join(cwd, 'bin');
      mkdirSync(bin);

      /*
       * Inject an unsupported option into the real local grep, as happens on
       * runtimes whose grep does not support the requested exclusion options.
       */
      writeFileSync(join(bin, 'grep'), '#!/bin/sh\nexec /usr/bin/grep --invalid-scanner-option "$@"\n', {
        mode: 0o700,
      });

      const result = spawnSync('sh', ['-c', buildSecurityGrepCommand(kind)], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
    });
  });
}

it('drains a large real grep result while bounding returned output', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'large.txt'), 'token=synthetic-only\n'.repeat(100_000));

  const result = spawnSync('sh', ['-c', buildSecurityGrepCommand('secrets')], { cwd, encoding: 'utf8' });
  expect(result.status).toBe(0);

  const parsed = readSecurityGrepOutput(result.stdout);
  expect(parsed.output.trim().split('\n')).toHaveLength(50);
  expect(Buffer.byteLength(parsed.output)).toBeLessThanOrEqual(65536);
  expect(parsed.complete).toBe(false);
});

it('marks byte-truncated grep output incomplete', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'huge.txt'), 'token=' + 'x'.repeat(100_000));

  const result = spawnSync('sh', ['-c', buildSecurityGrepCommand('secrets')], { cwd, encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(readSecurityGrepOutput(result.stdout).complete).toBe(false);
  expect(Buffer.byteLength(readSecurityGrepOutput(result.stdout).output)).toBe(65536);
});

it('recognizes exactly the line limit as complete when grep has no remaining output', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'exact.txt'), 'token=fixture\n'.repeat(50));

  const result = spawnSync('sh', ['-c', buildSecurityGrepCommand('secrets')], { cwd, encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(readSecurityGrepOutput(result.stdout).complete).toBe(true);
});
