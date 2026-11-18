import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {startStaticGateway} from './gateway.mjs';
import {triggerDeployBuild} from '../../services/worker/src/deploy-jobs.ts';
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${s.address().port}`)));
const close=s=>new Promise(r=>{s.closeAllConnections();s.close(r);});
test('actual production worker trigger reaches exact local API; static gateway serves local marker',async()=>{
 const old={url:process.env.API_INTERNAL_URL,secret:process.env.INTERNAL_API_SHARED_SECRET};const seen=[];
 const api=createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;
  seen.push({path:req.url,method:req.method,auth:req.headers.authorization});
  if(req.url==='/internal/deployments/build') {assert.deepEqual(JSON.parse(raw),{projectId:'p',deploymentId:'d'});res.setHeader('content-type','application/json');res.end(JSON.stringify({deployment:{id:'d',status:'READY'}}));}
  else if(req.url==='/static-deployments/d/') {res.end('<main id="proof">local-transport-marker</main>');}
  else {res.writeHead(404).end();}
 });
 const web=createServer((req,res)=>res.end('web-route'));let gateway;
 try{
  const apiOrigin=await listen(api),webOrigin=await listen(web);process.env.API_INTERNAL_URL=apiOrigin;process.env.INTERNAL_API_SHARED_SECRET='local-fixture-only';
  const result=await triggerDeployBuild({projectId:'p',deploymentId:'d'});assert.equal(result.deployment.status,'READY');assert.deepEqual(seen[0],{path:'/internal/deployments/build',method:'POST',auth:'Bearer local-fixture-only'});
  gateway=await startStaticGateway(webOrigin,apiOrigin,{VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent'},0);
  const page=await fetch(gateway.origin+'/static-deployments/d/');assert.equal(await page.text(),'<main id="proof">local-transport-marker</main>');
  assert.equal(seen[1].auth,undefined);assert.equal(await(await fetch(gateway.origin+'/api/runtime-token')).text(),'web-route');
 } finally {if(gateway)await close(gateway.server);await close(web);await close(api);for(const [k,v]of [['API_INTERNAL_URL',old.url],['INTERNAL_API_SHARED_SECRET',old.secret]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
import {staticEvent,staticResources,STATIC_REF} from './hook.mjs';
import {recipeManifests} from '../private-runtime-recipe/manifests.ts';
test('opt-in hook is exact-ref scoped and resources change only two local API env values',()=>{
 const env={VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent',GITHUB_REF:STATIC_REF,GITHUB_EVENT_NAME:'push'};
 staticEvent(env);for(const extra of [{VC_STATIC_ACCEPTANCE:'0'},{E2E_PROVIDER_MODE:'paid'},{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'pull_request'}])assert.throws(()=>staticEvent({...env,...extra}));
 const original=recipeManifests('vc-private-1234567890abcdef','local-pass','local-token','local-manager','local-jwt');
 const before=structuredClone(original);const after=staticResources(original);
 const api=after.find(r=>r.kind==='Deployment'&&r.metadata.name==='api');
 assert.deepEqual(api.spec.template.spec.containers[0].env.splice(-2),[
  {name:'STATIC_DEPLOY_STORAGE_DIR',value:'/data/projects/.qa-static-artifacts'},
  {name:'STATIC_DEPLOY_BASE_URL',value:'http://127.0.0.1:4317'},
 ]);assert.deepEqual(after,before);assert.deepEqual(original,before);
});
