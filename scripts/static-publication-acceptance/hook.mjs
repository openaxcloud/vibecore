import {relayFrameworkTransport} from './framework-transport.mjs';
import {relayScriptErrors} from './script-error.mjs';
/** Owned ready-stack hook. No cloud client, no credential discovery, no extra cluster. */
import assert from 'node:assert/strict';
import {emitDiagnostic,relayDiagnostics,failureCode} from './diagnostics.mjs';
import {ownedChild} from './owned-child.mjs';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { exactProduct, optIn } from './policy.mjs';
export const STATIC_REF='refs/heads/codex/qa-static-marker-edit-20261120';
export function staticEvent(env) {
 assert.equal(process.versions.node.split('.')[0],'22','NODE22_REQUIRED');assert.equal(env.VC_STATIC_ACCEPTANCE,'1');assert.equal(env.GITHUB_REF,STATIC_REF);
 assert.equal(env.GITHUB_EVENT_NAME,'push');optIn(env);
}
export function staticResources(resources) {
 const copy=structuredClone(resources);
 const api=copy.find(r=>r.kind==='Deployment'&&r.metadata.name==='api');assert.ok(api);
 api.spec.template.spec.containers[0].env.push(
  {name:'STATIC_DEPLOY_STORAGE_DIR',value:'/data/projects/.qa-static-artifacts'},
  {name:'STATIC_DEPLOY_BASE_URL',value:'http://127.0.0.1:4317'},
 );return copy;
}
export async function runStaticAcceptance({name,directory,kubeconfig,managerSecret,browsers,path}) {
 let stage='hook-preflight';
 const setStage=value=>{stage=value;emitDiagnostic(stage,'begin');};
 setStage(stage);
 exactProduct();assert.ok(path&&browsers&&managerSecret);
 const net=await import('node:net');
 for(const port of [5173,4317]) await new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
 assert.deepEqual(readdirSync(process.cwd()).filter(n=>(n==='.env'||n.startsWith('.env.'))&&!n.endsWith('.example')),[]);
 const home=mkdtempSync(join(directory,'static-home-'));
 const common={PATH:path,HOME:home,XDG_CONFIG_HOME:home,XDG_CACHE_HOME:home,TMPDIR:home,LANG:'C.UTF-8',TZ:'UTC',CI:'true',HUSKY:'0',VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent',
  KUBECONFIG:kubeconfig,VC_STATIC_RECIPE_ID:name,VC_STATIC_API:'http://127.0.0.1:3001',VC_STATIC_WEB:'http://127.0.0.1:4317',VC_STATIC_UPSTREAM_WEB:'http://127.0.0.1:5173',
  VC_STATIC_FIXTURE:join(home,'fixture.json'),VC_STATIC_PRIVATE_RESULTS:join(home,'results'),PLAYWRIGHT_BROWSERS_PATH:browsers};
 const children=[];let cancelled=false;
 const stopAll=()=>Promise.all(children.map(p=>p.stop()));
 const cancel=()=>{cancelled=true;void stopAll();};
 function start(command,args,env,limit) {
  assert.equal(cancelled,false,'HOOK_CANCELLED');
  const childStage=stage;let output='';
  const relay=relayDiagnostics();const relayScript=relayScriptErrors();const relayFramework=relayFrameworkTransport();
  const p=ownedChild(command,args,env,limit,{
   onData:b=>{relay(b);relayScript(b);relayFramework(b);if(output.length<16384)output+=b.toString();},
   onTimeout:()=>emitDiagnostic(childStage,'failed','timeout'),
  });children.push(p);return {...p,output:()=>output};
 }
 async function ready(proc,probe) {
  for(let n=0;n<120;n++){assert.ok(proc.alive());if(await probe())return;await new Promise(r=>setTimeout(r,500));}assert.fail('LOCAL_READY_TIMEOUT');
 }
 async function command(file,args=[],extra={},limit=240000) {
  const p=start(process.execPath,['--import','tsx',file,...args],{...common,...extra},limit);const code=await p.done;if(code!==0)emitDiagnostic(stage,'failed','child-exit');assert.equal(code,0);return p.output();
 }
 process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
 try {
  // Match the official production E2E transport; same exact environment in both phases.
  const productionEnv={...common,NODE_ENV:'production',VITE_RUNTIME_MODE:'remote-kubernetes',VITE_RUNTIME_API_BASE_URL:'/api/runtime',RUNTIME_MODE:'remote-kubernetes',RUNTIME_API_BASE_URL:'/api/runtime',SAAS_API_URL:common.VC_STATIC_API,API_BASE_URL:common.VC_STATIC_API};
  setStage('web-build');
  const build=start('pnpm',['run','build'],productionEnv,1200000);
  assert.equal(await build.done,0,'COMPILED_BUILD_FAILED');
  setStage('web-ready');
  const web=start('pnpm',['run','start:node'],{...productionEnv,HOST:'127.0.0.1',PORT:'5173'},1200000);
  await ready(web,async()=>{try{const r=await fetch('http://127.0.0.1:5173/login',{redirect:'manual',signal:AbortSignal.timeout(1000)});await r.body?.cancel();return r.status===200;}catch{return false;}});
  setStage('compiled-asset-preflight');
  await command('scripts/static-publication-acceptance/compiled-preflight.mjs',['--check'],{},120000);
  emitDiagnostic('compiled-asset-preflight','complete');
  setStage('fixture-seed');
  await command('scripts/static-publication-acceptance/seed.mjs');
  setStage('gateway-ready');
  const gateway=start(process.execPath,['scripts/static-publication-acceptance/gateway.mjs','--serve'],common,1200000);
  await ready(gateway,()=>gateway.output().includes('"status":"ready"'));
  setStage('worker-ready');
  const worker=start(process.execPath,['--import','tsx','scripts/static-publication-acceptance/consumer.mjs'],{...common,REDIS_URL:'redis://127.0.0.1:56379',INTERNAL_API_SHARED_SECRET:managerSecret},900000);
  await ready(worker,()=>worker.output().includes('"status":"waiting"'));
  setStage('browser-run');
  const result=await command('node_modules/@playwright/test/cli.js',['test','--config','scripts/static-publication-acceptance/playwright.config.ts'],{},1200000);
  assert.ok(result.includes('"stage":"anonymous-static-versions","status":"verified","versions":2'));
  setStage('worker-completion');
  assert.equal(await worker.done,0);assert.ok(worker.output().includes('"status":"completed"'));
  console.log(JSON.stringify({stage:'anonymous-static-versions',status:'verified',versions:2}));
 } catch(error) {emitDiagnostic(stage,'failed',failureCode(error));throw error;} finally {
  process.off('SIGTERM',cancel);process.off('SIGINT',cancel);
  await stopAll();
  rmSync(home,{recursive:true,force:true});
 }
}
