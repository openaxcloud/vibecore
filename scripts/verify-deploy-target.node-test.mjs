import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const script = new URL('./verify-deploy-target.sh', import.meta.url).pathname;

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commitFile(cwd, path, content, message) {
  const absolute = join(cwd, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content);
  git(cwd, 'add', path);
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function repository() {
  const cwd = mkdtempSync(join(tmpdir(), 'verify-deploy-target-'));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'ci@example.test');
  git(cwd, 'config', 'user.name', 'CI Test');
  const initial = commitFile(cwd, 'src/app.ts', 'export const version = 1;\n', 'initial');
  git(cwd, 'branch', '-M', 'main');
  return { cwd, initial };
}

function verify(cwd, target, mainRef = 'main') {
  return spawnSync('bash', [script, target, mainRef], { cwd, encoding: 'utf8' });
}

test('accepts the exact current main commit', () => {
  const { cwd, initial } = repository();
  const result = verify(cwd, initial);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /current main commit/u);
});

test('accepts an ancestor when every newer path is documentation-only', () => {
  const { cwd, initial } = repository();
  commitFile(cwd, 'docs/parity/snapshot.html', '<html></html>\n', 'docs snapshot');
  commitFile(cwd, 'RUNBOOK.md', '# Runbook\n', 'root markdown');
  const result = verify(cwd, initial);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /only by ignored documentation paths/u);
});

test('refuses an older target when application code advanced', () => {
  const { cwd, initial } = repository();
  commitFile(cwd, 'src/app.ts', 'export const version = 2;\n', 'runtime change');
  const result = verify(cwd, initial);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contains non-documentation changes/u);
  assert.match(result.stderr, /src\/app\.ts/u);
});

test('refuses workflow and configuration changes even when docs also advanced', () => {
  const { cwd, initial } = repository();
  commitFile(cwd, 'docs/notes.md', '# Notes\n', 'docs');
  commitFile(cwd, '.github/workflows/ci.yml', 'name: CI\n', 'workflow');
  const result = verify(cwd, initial);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /.github\/workflows\/ci\.yml/u);
});

test('refuses a rename from a runtime path into documentation', () => {
  const { cwd, initial } = repository();
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  git(cwd, 'mv', 'src/app.ts', 'docs/app-history.md');
  git(cwd, 'commit', '-m', 'move runtime into docs');
  const result = verify(cwd, initial);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/app\.ts/u);
});

test('refuses a target that is not an ancestor of main', () => {
  const { cwd, initial } = repository();
  git(cwd, 'checkout', '-q', '-b', 'other', initial);
  const divergent = commitFile(cwd, 'src/other.ts', 'export const other = true;\n', 'other');
  git(cwd, 'checkout', '-q', 'main');
  commitFile(cwd, 'src/main.ts', 'export const main = true;\n', 'main');
  const result = verify(cwd, divergent);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not an ancestor/u);
});

test('rejects malformed and unavailable commit identifiers', () => {
  const { cwd } = repository();
  const malformed = verify(cwd, 'HEAD');
  assert.equal(malformed.status, 2);
  assert.match(malformed.stderr, /full lowercase 40-hex/u);

  const missing = verify(cwd, 'f'.repeat(40));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /not available as a commit/u);
});
