import test from 'node:test';import assert from 'node:assert/strict';
import {loopback,optIn,assertOwnedJob,staticSurface} from './policy.mjs';
test('opt-in local-only network destinations',()=>{
 optIn({VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent'});
 for(const v of ['https://example.com','http://localhost:3001','http://127.0.0.1:3001/path','http://user:pass@127.0.0.1:3001']) assert.throws(()=>loopback(v));
 assert.equal(loopback('http://127.0.0.1:3001'),'http://127.0.0.1:3001');loopback('redis://127.0.0.1:56379','redis:');
 assert.throws(()=>optIn({VC_STATIC_ACCEPTANCE:'1',E2E_PROVIDER_MODE:'absent',OPENAI_API_KEY:'fixture'}));assert.throws(()=>optIn({}));
});
const fixture={projectId:'p',workspaceId:'w',userId:'u'};
const job=()=>({name:'deploy.build',attemptsMade:0,data:{projectId:'p',userId:'u',deploymentId:'d',buildInput:{provider:'static',workspaceId:'w',buildCommand:'npm run build',outputDirectory:'dist',timeoutSeconds:600,envVars:{}}}});
test('only one exact fixture static job is eligible',()=>{
 assertOwnedJob(job(),fixture);
 for(const field of ['projectId','userId']){const j=job();j.data[field]='other';assert.throws(()=>assertOwnedJob(j,fixture));}
 for(const [field,value] of [['provider','server'],['workspaceId','other'],['buildCommand','other'],['outputDirectory','other'],['timeoutSeconds',1800],['envVars',{KEY:'x'}]]){const j=job();j.data.buildInput[field]=value;assert.throws(()=>assertOwnedJob(j,fixture));}
 const j=job();j.attemptsMade=1;assert.throws(()=>assertOwnedJob(j,fixture));
});
test('only runtime and bounded static serving are gateway API routes',()=>{
 assert.equal(staticSurface('/static-deployments/deployment_1/index.html'),'api');assert.equal(staticSurface('/api/runtime/workspaces'),'api');
 assert.equal(staticSurface('/api/runtime-token?projectId=p'),'web');assert.equal(staticSurface('/internal/deployments/build'),'web');
 for(const p of ['//outside','/api/chat','/api/generate','/static-deployments/%2e%2e/file'])assert.throws(()=>staticSurface(p));
});
