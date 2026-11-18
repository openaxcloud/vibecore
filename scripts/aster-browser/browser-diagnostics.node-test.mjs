import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readBrowserCheckpoint, writeBrowserCheckpoint, failBrowserCheckpoint, relayBrowserCheckpoint } from './browser-diagnostics.mjs';
import { createDiagnostics, renderDiagnostics } from '../private-runtime-recipe/diagnostics.mjs';

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'browser-checkpoint-'));
  const path = join(directory, 'checkpoint.json');
  writeFileSync(path, '', { mode: 0o600 });
  try { return run(path, directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('fixed browser checkpoint survives failure, and teardown cannot erase the failing phase', () => fixture((path) => {
  writeBrowserCheckpoint('browser-register-form', 'begin', path);
  failBrowserCheckpoint('failed', path);
  writeBrowserCheckpoint('browser-close', 'begin', path);
  assert.deepEqual(readBrowserCheckpoint(path), ['browser-register-form', 'failed']);
  const output = []; relayBrowserCheckpoint(path, createDiagnostics((line) => output.push(line)));
  assert.match(renderDiagnostics(output.join('')), /browser-register-form \/ failed/);
}));

test('invalid records, missing files, symlinks and hardlinks fail closed without raw data', () => fixture((path, directory) => {
  const output=[]; const diagnostic=createDiagnostics((line)=>output.push(line));
  for (const contents of ['SECRET /private/path', JSON.stringify(['browser-register','SECRET']), 'x'.repeat(1025)]) {
    writeFileSync(path, contents); assert.equal(readBrowserCheckpoint(path), undefined);
    relayBrowserCheckpoint(path, diagnostic);
  }
  writeFileSync(path, JSON.stringify(['browser-register','begin']));
  const symlink = join(directory, 'symlink'); symlinkSync(path, symlink);
  assert.equal(readBrowserCheckpoint(symlink), undefined);
  const hardlink = join(directory, 'hardlink'); linkSync(path, hardlink);
  assert.equal(readBrowserCheckpoint(hardlink), undefined);
  assert.equal(readBrowserCheckpoint(join(directory,'missing')), undefined);
  writeBrowserCheckpoint('PRIVATE','SECRET',path);
  assert.ok(!renderDiagnostics(output.join('')).includes('SECRET'));
  assert.ok(!renderDiagnostics(output.join('')).includes('/private'));
}));

test('real Playwright reporter captures injected failure/timeout without forwarding stdout or exception data', () => fixture((path,directory) => {
  const reporter=fileURLToPath(new URL('./browser-reporter.ts', import.meta.url));
  const helper=fileURLToPath(new URL('./browser-diagnostics.mjs',import.meta.url));
  writeFileSync(join(directory,'probe.spec.ts'), `import { test } from ${JSON.stringify(fileURLToPath(new URL('../../node_modules/@playwright/test/index.mjs',import.meta.url)))};\nimport { writeBrowserCheckpoint } from ${JSON.stringify(helper)};\ntest('private-title',async()=>{writeBrowserCheckpoint('browser-register-form');console.log('PRIVATE-STDOUT-SENTINEL');if(process.env.PROBE_TIMEOUT==='1')await new Promise(()=>{});throw new Error('PRIVATE-ERROR-SENTINEL');});\n`);
  writeFileSync(join(directory,'playwright.config.ts'), `export default {testDir: ${JSON.stringify(directory)},testMatch:'probe.spec.ts',workers:1,retries:0,timeout:300,globalTimeout:60000,reporter:[[${JSON.stringify(reporter)}]]};`);
  for(const timeout of [false,true]) {
    writeFileSync(path,'');
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js',import.meta.url)),'test','--config',join(directory,'playwright.config.ts')],{cwd:process.cwd(),env:{...process.env,ASTER_BROWSER_DIAGNOSTICS_FILE:path,PROBE_TIMEOUT:timeout?'1':'0'},encoding:'utf8',timeout:120000});
    assert.equal(result.error,undefined);assert.equal(result.status,1);
    assert.deepEqual(readBrowserCheckpoint(path),['browser-register-form',timeout?'test-timeout':'failed']);
    const output=[];relayBrowserCheckpoint(path,createDiagnostics(line=>output.push(line)));
    const report=renderDiagnostics(output.join(''));
    for(const secret of ['PRIVATE','private-title',directory,'PASS'])assert.ok(!report.includes(secret));
  }
}));

test('test and runner ceilings leave teardown margin inside unchanged parent limit', () => {
  const config=readFileSync(new URL('./playwright.config.ts',import.meta.url),'utf8');
  const run=readFileSync(new URL('../private-runtime-recipe/run.ts',import.meta.url),'utf8');
  assert.match(config,/timeout: 840_000/);assert.match(config,/globalTimeout: 870_000/);
  assert.match(config,/actionTimeout: 30_000/);assert.match(config,/navigationTimeout: 90_000/);
  assert.match(run,/timeout: 900_000,[\s\S]*?ASTER_BROWSER_DIAGNOSTICS_FILE: browserCheckpoint/);
  assert.match(run,/finally \{\s*relayBrowserCheckpoint\(browserCheckpoint, diagnostic\)/);
});
