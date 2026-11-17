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
