import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import {diagnostic,relayDiagnostics} from './diagnostics.mjs';
const event={kind:'static-diagnostic',stage:'seed-runtime',status:'failed',failure:'http-rejected'};
test('closed enum payload rejects raw/extra/private fields and bounded split relay strips noise',()=>{
 assert.deepEqual(diagnostic(event),event);
 for(const bad of [{...event,token:'PRIVATE'},{...event,stage:'PRIVATE'},{...event,failure:'PRIVATE'},{...event,status:'PRIVATE'},{...event,failure:'none'},null,[]])assert.equal(diagnostic(bad),null);
 const got=[];const relay=relayDiagnostics(v=>got.push(v));const text=JSON.stringify(event)+'\n';
 relay('PRIVATE\n'+JSON.stringify({...event,url:'PRIVATE'})+'\n');relay('X'.repeat(1000));relay('\n');relay(text.slice(0,19));relay(text.slice(19));assert.deepEqual(got,[event]);
 const bounded=[];const capped=relayDiagnostics(v=>bounded.push(v));capped(text.repeat(200));assert.equal(bounded.length,128);
});
test('before proof: exact prior wrapper loses recipe stage, after: allowlisted nested stage survives without secrets',()=>{
 const directory=mkdtempSync(join(tmpdir(),'vc-diag-control-'));
 try{
  const prior=join(directory,'prior.mjs');writeFileSync(prior,readFileSync(new URL('./prior-safe-run.fixture.mjs',import.meta.url)));
  const old=spawnSync(process.execPath,[prior,'--expect-publication',process.execPath,'-e',`console.log(JSON.stringify({ok:false,stage:'build-local-images',cluster:'PRIVATE'}));process.exit(1)`],{encoding:'utf8'});
  assert.equal(old.status,1);assert.ok(!old.stdout.includes('build-local-images'));
  const module=new URL('./diagnostics.mjs',import.meta.url).href;
  const leaf=`console.log(${JSON.stringify(JSON.stringify(event))});console.log('PRIVATE');console.error('PRIVATE');process.exit(1)`;
  const middle=`import{spawn}from'node:child_process';import{relayDiagnostics}from${JSON.stringify(module)};const p=spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:['ignore','pipe','ignore']});p.stdout.on('data',relayDiagnostics());p.on('close',c=>process.exit(c));`;
  const next=spawnSync(process.execPath,[new URL('./safe-run.mjs',import.meta.url).pathname,'--expect-publication',process.execPath,'--input-type=module','-e',middle],{encoding:'utf8'});
  assert.equal(next.status,1);assert.ok(!next.stdout.includes('PRIVATE'));assert.ok(!next.stderr.includes('PRIVATE'));
  const rows=next.stdout.trim().split('\n').map(v=>JSON.parse(v));assert.deepEqual(rows[0],event);assert.equal(rows.at(-1).status,'failed');
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('editor route error projects only the fixed failure category',()=>{
 const value={kind:'static-diagnostic',stage:'editor-v1',status:'failed',failure:'route-error'};
 assert.deepEqual(diagnostic(value),value);
 assert.equal(diagnostic({...value,failure:'route-error: private detail'}),null);
});
