import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { onTestFinished, test } from 'vitest';

const script = new URL('./retirer-compilateur-natif-web.mjs', import.meta.url).pathname;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'native-ts-web-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  const modules = join(root, 'node_modules');

  function packageAt(entry, manifest) {
    const p = join(modules, '.pnpm', entry, 'node_modules', manifest.name);
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, 'package.json'), JSON.stringify(manifest));

    return p;
  }

  const native = packageAt('typescript@7.0.2', {
    name: 'typescript',
    version: '7.0.2',
    optionalDependencies: { '@typescript/typescript-linux-x64': '7.0.2' },
  });
  const binary = packageAt('@typescript+typescript-linux-x64@7.0.2', {
    name: '@typescript/typescript-linux-x64',
    version: '7.0.2',
  });
  writeFileSync(join(binary, 'tsc'), 'native payload fixture');

  const js = packageAt('typescript@5.8.3', { name: 'typescript', version: '5.8.3', main: 'index.js' });
  writeFileSync(join(js, 'index.js'), "module.exports = {version:'5.8.3'};");

  const consumer = packageAt('consumer@1', {
    name: 'consumer',
    version: '1',
    peerDependencies: { typescript: '*' },
    peerDependenciesMeta: { typescript: { optional: true } },
  });

  function link(target, path) {
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(relative(dirname(path), target), path);
  }
  link(native, join(dirname(consumer), 'typescript'));
  link(binary, join(dirname(native), '@typescript/typescript-linux-x64'));
  link(native, join(modules, '.pnpm/node_modules/typescript'));
  link(js, join(modules, 'typescript'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'web', dependencies: { typescript: '^5' } }));

  return { root, native, binary, js, consumer, link };
}

const run = (root, ...args) => spawnSync(process.execPath, [script, root, ...args], { encoding: 'utf8' });
test('dry run preserves native compiler and binary', (t) => {
  const f = fixture(t);
  const r = run(f.root);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(f.native));
  assert.ok(existsSync(f.binary));
});
test('removes optional native compiler and hoists, preserving executable JS TypeScript', (t) => {
  const f = fixture(t);
  const r = run(f.root, '--supprimer');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(f.native), false);
  assert.equal(existsSync(f.binary), false);
  assert.equal(existsSync(join(f.root, 'node_modules/.pnpm/node_modules/typescript')), false);

  const resolved = spawnSync(process.execPath, ['-e', "console.log(require('typescript').version)"], {
    cwd: f.root,
    encoding: 'utf8',
  });
  assert.equal(resolved.status, 0, resolved.stderr);
  assert.equal(resolved.stdout.trim(), '5.8.3');
  assert.equal(run(f.root, '--supprimer').status, 0);
});

for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  test(`refuses a surviving ${field} consumer before any removal`, (t) => {
    const f = fixture(t);
    writeFileSync(join(f.consumer, 'package.json'), JSON.stringify({ name: 'consumer', [field]: { typescript: '*' } }));

    const r = run(f.root, '--supprimer');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Refusing required typescript of consumer/);
    assert.ok(existsSync(f.native));
    assert.ok(existsSync(f.binary));
  });
}
test('refuses direct production dependency on the native compiler', (t) => {
  const f = fixture(t);
  rmSync(join(f.root, 'node_modules/typescript'));
  f.link(f.native, join(f.root, 'node_modules/typescript'));

  const r = run(f.root, '--supprimer');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing required typescript of web/);
  assert.ok(existsSync(f.binary));
});
test('web Dockerfile removes optional tooling before reachability pruning and keeps real boot gate', () => {
  const docker = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const prune = docker.indexOf('RUN pnpm prune --prod --ignore-scripts');
  const native = docker.indexOf('RUN node scripts/retirer-compilateur-natif-web.mjs /app --supprimer');
  const sweep = docker.indexOf('RUN node scripts/elaguer-magasin-pnpm.mjs /app --supprimer');
  const boot = docker.indexOf('NODE_ENV=production PORT=3100 HOST=127.0.0.1 node ./server.mjs');
  assert.ok(prune >= 0 && native > prune && sweep > native && boot > sweep);
  assert.match(docker, /fetch\('http:\/\/127\.0\.0\.1:3100\/health'\)/);
});

test('removes a bin shim linked to the removed native compiler', (t) => {
  const f = fixture(t);
  const bin = join(dirname(f.consumer), '.bin', 'tsc');
  mkdirSync(dirname(bin), { recursive: true });
  writeFileSync(bin, '#!/bin/sh\nexec ../typescript/bin/tsc "$@"\n');

  const r = run(f.root, '--supprimer');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(bin), false);
});
test('fails closed when the installed pnpm store is absent', (t) => {
  const f = fixture(t);
  rmSync(join(f.root, 'node_modules/.pnpm'), { recursive: true });

  const r = run(f.root, '--supprimer');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /physical pnpm store/);
});

test('refuses a required npm alias to the native compiler', (t) => {
  const f = fixture(t);
  f.link(f.native, join(dirname(f.consumer), 'compiler'));
  writeFileSync(
    join(f.consumer, 'package.json'),
    JSON.stringify({ name: 'consumer', dependencies: { compiler: 'npm:typescript@7.0.2' } }),
  );

  const r = run(f.root, '--supprimer');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing required compiler of consumer/);
  assert.ok(existsSync(f.native));
});
test('refuses a required compiler of a linked workspace consumer', (t) => {
  const f = fixture(t);
  const service = join(f.root, 'packages', 'service');
  mkdirSync(service, { recursive: true });
  writeFileSync(join(service, 'package.json'), JSON.stringify({ name: 'service', dependencies: { typescript: '*' } }));
  f.link(f.native, join(service, 'node_modules/typescript'));
  f.link(service, join(f.root, 'node_modules/service'));
  writeFileSync(
    join(f.root, 'package.json'),
    JSON.stringify({ name: 'web', dependencies: { service: 'workspace:*' } }),
  );

  const r = run(f.root, '--supprimer');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing required typescript of service/);
  assert.ok(existsSync(f.native));
});
test('refuses a missing required compiler instead of assuming it optional', (t) => {
  const f = fixture(t);
  writeFileSync(
    join(f.consumer, 'package.json'),
    JSON.stringify({ name: 'consumer', dependencies: { missingCompiler: 'npm:typescript@7' } }),
  );

  const r = run(f.root, '--supprimer');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Cannot verify required missingCompiler/);
  assert.ok(existsSync(f.native));
});

test('refuses a pnpm store redirected outside its physical location', (t) => {
  const f = fixture(t);
  const store = join(f.root, 'node_modules/.pnpm');
  const moved = join(f.root, 'external-store');
  renameSync(store, moved);
  symlinkSync(moved, store);

  const r = run(f.root, '--supprimer');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /physical pnpm store/);
  assert.ok(existsSync(join(moved, '@typescript+typescript-linux-x64@7.0.2')));
});
test('preserves an unrelated external package link and its data', (t) => {
  const f = fixture(t);
  const outside = join(f.root, 'external-package');
  mkdirSync(outside);
  writeFileSync(join(outside, 'package.json'), JSON.stringify({ name: 'external', version: '1' }));
  writeFileSync(join(outside, 'keep.txt'), 'untouched');
  f.link(outside, join(f.root, 'node_modules/external'));
  assert.equal(run(f.root, '--supprimer').status, 0);
  assert.ok(existsSync(join(f.root, 'node_modules/external')));
  assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'untouched');
});
