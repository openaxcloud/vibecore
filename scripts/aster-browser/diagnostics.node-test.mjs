import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnostics, renderDiagnostics, stages, statuses } from '../private-runtime-recipe/diagnostics.mjs';

test('records stages and classifications without copying arbitrary strings', () => {
 const output=[];const d=createDiagnostics((line)=>output.push(line));
 d.stage('create-local-cluster');d.status('completed');d.stage('migrate-local-postgres');d.status('command-timeout');
 d.stage('/private/token-secret');d.status('Error: SECRET path /home/token');
 assert.equal(output.length,4);
 assert.equal(renderDiagnostics(output.join('')).includes('migrate-local-postgres / command-timeout'),true);
 assert.equal(output.join('').includes('SECRET'),false);
 assert.equal(output.join('').includes('/private'),false);
});
test('all fixed stages and statuses are rendered as diagnostics, never a PASS verdict',()=>{
 for(const stage of stages)for(const status of statuses){const result=renderDiagnostics(JSON.stringify([stage,status]));assert.ok(result.includes(`${stage} / ${status}`));assert.ok(!result.includes('PASS'));}
});
test('rejects entire malformed or untrusted streams rather than printing their data',()=>{
 for(const input of [undefined,'','SECRET','["cleanup","completed","SECRET"]','["/private","failed"]','{"stage":"cleanup","token":"SECRET"}', '["cleanup","::error::SECRET"]','x'.repeat(8193),Array(65).fill('["cleanup","begin"]').join('\n')]){
  assert.equal(renderDiagnostics(input),'QA diagnostic: unavailable or invalid; no regression verdict.');
 }
});
test('writer is bounded and a failed diagnostic sink does not affect product execution',()=>{
 const output=[];const d=createDiagnostics((line)=>output.push(line));for(let i=0;i<1000;i++)d.status('begin');assert.equal(output.length,64);assert.ok(Buffer.byteLength(output.join(''))<8192);
 assert.doesNotThrow(()=>createDiagnostics(()=>{throw new Error('SECRET');}).status('failed'));
});

test('real CLI never emits input secrets, paths, or raw parsing exceptions', async()=>{
 const {mkdtempSync,writeFileSync,rmSync,symlinkSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 const dir=mkdtempSync(join(tmpdir(),'diagnostic-test-'));const secret=join(dir,'SECRET-TOKEN');
 try{
  writeFileSync(secret,'SECRET-TOKEN /private/path ::error::secret');
  const link=join(dir,'link');symlinkSync(secret,link);
  const empty=join(dir,'empty');writeFileSync(empty,'');const oversized=join(dir,'oversized');writeFileSync(oversized,'SECRET'.repeat(2000));
  for(const path of [secret,link,empty,oversized,join(dir,'missing-SECRET-TOKEN')]){
   const result=spawnSync(process.execPath,[fileURLToPath(new URL('../private-runtime-recipe/diagnostics.mjs',import.meta.url)),path],{encoding:'utf8',env:{}});
   assert.equal(result.status,0);assert.equal(result.stderr,'');assert.equal(result.stdout,'QA diagnostic: unavailable or invalid; no regression verdict.\n');
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('last reached stage is explicit and incomplete checkpoints never claim success',()=>{
 const output=[];const d=createDiagnostics((line)=>output.push(line));
 d.stage('create-local-cluster');d.stage('migrate-local-postgres');d.status('command-timeout');d.status('failed');d.stage('cleanup');d.status('owned-node-deleted');
 const report=renderDiagnostics(output.join(''));
 assert.ok(report.includes('migrate-local-postgres / failed'));
 assert.ok(report.includes('cleanup / owned-node-deleted'));
 assert.ok(!report.includes('browser-journey'));
 assert.ok(!report.includes('PASS'));
 assert.ok(renderDiagnostics('["browser-journey","begin"]').includes('not proof of regression success'));
});


test('real TypeScript recipe and cleanup launcher preserve fd3 on injected failure', async () => {
 const {mkdtempSync,openSync,closeSync,readFileSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const directory=mkdtempSync(join(tmpdir(),'diagnostic-launcher-'));
 const fixture=join(directory,'probe.ts');
 const sentinel='PRIVATE-DIAGNOSTIC-PROBE-SENTINEL';
 const diagnostics=new URL('../private-runtime-recipe/diagnostics.mjs',import.meta.url).href;
 try {
  writeFileSync(fixture,`import { diagnostic } from ${JSON.stringify(diagnostics)};\nconst stage: string = process.argv.includes('--cleanup') ? 'cleanup' : 'migrate-local-postgres';\ndiagnostic.stage(stage);\ndiagnostic.status('command-exit');\ndiagnostic.status('failed');\nthrow new Error(${JSON.stringify(sentinel)});\n`);
  for(const cleanup of [false,true]) {
   const sink=join(directory,cleanup?'cleanup.jsonl':'recipe.jsonl');
   const fd=openSync(sink,'wx',0o600);
   let result;
   try {
    // Identical executable and argument prefix to both workflow launch sites.
    result=spawnSync(process.execPath,['--import','tsx',fixture,...(cleanup?['--cleanup']:[])],{
     cwd:process.cwd(),encoding:'utf8',stdio:['ignore','pipe','pipe',fd],timeout:120000,
    });
   } finally { closeSync(fd); }
   assert.equal(result.error,undefined,'LAUNCHER_START_FAILED');
   assert.equal(result.status,1,'INJECTED_FAILURE_NOT_OBSERVED');
   assert.ok(result.stderr.includes(sentinel),'FIXTURE_DID_NOT_REACH_INJECTED_FAILURE');
   const input=readFileSync(sink,'utf8');
   const stage=cleanup?'cleanup':'migrate-local-postgres';
   assert.deepEqual(input.trim().split('\n').map(line=>JSON.parse(line)),[
    [stage,'begin'],[stage,'command-exit'],[stage,'failed'],
   ]);
   const report=renderDiagnostics(input);
   assert.ok(report.includes(`${stage} / failed`));
   assert.ok(!report.includes(sentinel)&&!report.includes(directory)&&!report.includes('PASS'));
  }
 } finally { rmSync(directory,{recursive:true,force:true}); }
});

test('workflow uses proven in-process TS launcher for recipe and cleanup',async()=>{
 const {readFileSync}=await import('node:fs');
 // In CI the authoritative workflow lives outside the detached product checkout.
 const {resolve}=await import('node:path');
 const workflow=readFileSync(resolve(process.env.PRIVATE_RUNTIME_QA_SOURCE_ROOT??process.cwd(),'.github/workflows/private-runtime-recipe.yml'),'utf8');
 const samePvc=workflow.slice(workflow.indexOf('  same-pvc-932:'));
 assert.ok(samePvc.includes('if node --import tsx scripts/private-runtime-recipe/run.ts >'));
 assert.ok(samePvc.includes('if ! node --import tsx scripts/private-runtime-recipe/run.ts --cleanup >'));
 assert.ok(!samePvc.includes('pnpm exec tsx'));
 assert.ok(!samePvc.includes('node_modules/.bin/tsx'));
 const preflight=samePvc.indexOf('node --test --test-concurrency=1 scripts/aster-browser/*.node-test.mjs');
 assert.ok(preflight>=0&&preflight<samePvc.indexOf('- name: Install pinned local clients and Chromium'));
});
