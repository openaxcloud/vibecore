/** Owned ready-stack hook. No cloud client, no credential discovery, no extra cluster. */
import {relaySafe} from './safe-output.mjs';
import assert from 'node:assert/strict';
import {emitDiagnostic,failureCode} from './diagnostics.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { exactProduct, optIn } from './policy.mjs';
export const PROBE_REF='refs/heads/codex/qa-ide-bootstrap-compiled-20261118';
export function probeEvent(env) {
 assert.equal(process.versions.node.split('.')[0],'22','NODE22_REQUIRED');assert.equal(env.VC_IDE_BOOTSTRAP_PROBE,'1');assert.equal(env.GITHUB_REF,PROBE_REF);
 assert.equal(env.GITHUB_EVENT_NAME,'push');optIn(env);
}
export async function runIdeProbe({name,directory,kubeconfig,browsers,path}) {
 let stage='hook-preflight';
 const setStage=value=>{stage=value;emitDiagnostic(stage,'begin');};
 setStage(stage);
 exactProduct();assert.ok(path&&browsers);
 const net=await import('node:net');
 for(const port of [5173,4317]) await new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
 assert.deepEqual(readdirSync(process.cwd()).filter(n=>(n==='.env'||n.startsWith('.env.'))&&!n.endsWith('.example')),[]);
 const home=mkdtempSync(join(directory,'static-home-'));
 const common={PATH:path,HOME:home,XDG_CONFIG_HOME:home,XDG_CACHE_HOME:home,TMPDIR:home,LANG:'C.UTF-8',TZ:'UTC',CI:'true',HUSKY:'0',VC_IDE_BOOTSTRAP_PROBE:'1',E2E_PROVIDER_MODE:'absent',
  KUBECONFIG:kubeconfig,VC_IDE_RECIPE_ID:name,VC_IDE_API:'http://127.0.0.1:3001',VC_IDE_WEB:'http://127.0.0.1:4317',VC_IDE_UPSTREAM_WEB:'http://127.0.0.1:5173',
  VC_IDE_FIXTURE:join(home,'fixture.json'),VC_IDE_PRIVATE_RESULTS:join(home,'results'),PLAYWRIGHT_BROWSERS_PATH:browsers};
 const children=[];
 function start(command,args,env,limit) {
  const childStage=stage;
  const child=spawn(command,args,{env,stdio:['ignore','pipe','ignore']});children.push(child);
  let output='';let settled=false;let killTimer;
  const relay=relaySafe();
  const timer=setTimeout(()=>{emitDiagnostic(childStage,'failed','timeout');child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);},limit);
  const done=new Promise(resolve=>{
   child.stdout.on('data',b=>{relay(b);if(output.length<16384)output+=b.toString();});
   child.on('error',()=>{settled=true;clearTimeout(timer);clearTimeout(killTimer);resolve(-1);});
   child.on('close',code=>{settled=true;clearTimeout(timer);clearTimeout(killTimer);resolve(code);});
  });return {child,done,output:()=>output,alive:()=>!settled};
 }
 async function ready(proc,probe) {
  for(let n=0;n<120;n++){assert.ok(proc.alive());if(await probe())return;await new Promise(r=>setTimeout(r,500));}assert.fail('LOCAL_READY_TIMEOUT');
 }
 async function command(file,args=[],extra={},limit=240000) {
  const p=start(process.execPath,['--import','tsx',file,...args],{...common,...extra},limit);const code=await p.done;if(code!==0)emitDiagnostic(stage,'failed','child-exit');assert.equal(code,0);return p.output();
 }
 try {
  // Official E2E production build/start path; no alternative compiler or retries.
  const productionEnv={...common,NODE_ENV:'production',VITE_RUNTIME_MODE:'remote-kubernetes',VITE_RUNTIME_API_BASE_URL:'/api/runtime',RUNTIME_MODE:'remote-kubernetes',RUNTIME_API_BASE_URL:'/api/runtime',SAAS_API_URL:common.VC_IDE_API,API_BASE_URL:common.VC_IDE_API};
  setStage('web-build');
  const build=start('pnpm',['run','build'],productionEnv,1200000);
  assert.equal(await build.done,0,'COMPILED_BUILD_FAILED');
  setStage('web-ready');
  const web=start('pnpm',['run','start:node'],{...productionEnv,HOST:'127.0.0.1',PORT:'5173'},1200000);
  await ready(web,async()=>{try{const r=await fetch('http://127.0.0.1:5173/login',{redirect:'manual',signal:AbortSignal.timeout(1000)});await r.body?.cancel();return r.status===200;}catch{return false;}});
  setStage('compiled-asset-preflight');
  await command('scripts/ide-bootstrap-probe/compiled-preflight.mjs',['--check'],{},120000);
  emitDiagnostic('compiled-asset-preflight','complete');
  setStage('fixture-seed');
  await command('scripts/ide-bootstrap-probe/seed.mjs');
  setStage('gateway-ready');
  const gateway=start(process.execPath,['scripts/ide-bootstrap-probe/gateway.mjs','--serve'],common,1200000);
  await ready(gateway,()=>gateway.output().includes('"status":"ready"'));
  setStage('browser-run');
  const result=await command('node_modules/@playwright/test/cli.js',['test','--config','scripts/ide-bootstrap-probe/playwright.config.ts'],{},240000);
  assert.ok(result.includes('"stage":"ide-entry-probe","status":"observed"'));
  console.log(JSON.stringify({stage:'ide-entry-probe',status:'observed'}));
 } catch(error) {emitDiagnostic(stage,'failed',failureCode(error));throw error;} finally {
  for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
  await new Promise(r=>setTimeout(r,2000));
  for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');
  rmSync(home,{recursive:true,force:true});
 }
}
