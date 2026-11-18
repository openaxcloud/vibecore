/** Creates one local fixture via supported API, no browser ZIP route and no direct database edits. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { optIn, exactProduct, loopback, PRODUCT_SHA, ownedRecipe } from './policy.mjs';
async function main() {
optIn();exactProduct();const api=loopback(process.env.VC_STATIC_API);const web=loopback(process.env.VC_STATIC_WEB);
const recipe=process.env.VC_STATIC_RECIPE_ID;ownedRecipe(recipe,web);
const destination=process.env.VC_STATIC_FIXTURE;assert.ok(destination);
const call=async(path,body,token,method='POST')=>{
 const r=await fetch(api+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(180_000)});
 assert.ok(r.ok,'LOCAL_FIXTURE_API_FAILED');return r;
};
const auth=await(await call('/auth/register',{email:`static-proof-${randomUUID()}@local.test`,password:`Fixture-${randomUUID()}!`,name:'Static acceptance',organizationName:'Static acceptance'})).json();
const project=(await(await call(`/orgs/${auth.organization.id}/projects`,{name:'Owned static acceptance'},auth.token)).json()).project;
const workspace=(await(await call(`/projects/${project.id}/workspaces`,{name:'Static target',runtimeMode:'remote-kubernetes'},auth.token)).json()).workspace;
// Preserve cleanup identity BEFORE runtime allocation or writes; never print token/IDs.
writeFileSync(destination,JSON.stringify({productSha:PRODUCT_SHA,recipe,api,web,projectId:project.id,workspaceId:workspace.id,userId:auth.user.id,token:auth.token}),{mode:0o600,flag:'wx'});
await call('/api/runtime/workspaces',{workspaceId:workspace.id,metadata:{projectId:project.id,workspaceId:workspace.id}},auth.token);
const files={
 'package.json':JSON.stringify({name:'owned-static-proof',version:'1.0.0',private:true,scripts:{dev:'node server.cjs',start:'node server.cjs',build:'node build.cjs'}}),
 'package-lock.json':JSON.stringify({name:'owned-static-proof',version:'1.0.0',lockfileVersion:3,requires:true,packages:{'':{name:'owned-static-proof',version:'1.0.0'}}}),
 'build.cjs':"const f=require('node:fs');f.mkdirSync('dist',{recursive:true});f.copyFileSync('index.html','dist/index.html');",
 'server.cjs':"const f=require('node:fs');require('node:http').createServer((q,s)=>{s.setHeader('content-type','text/html');s.end(f.readFileSync('index.html'))}).listen(5173,'0.0.0.0');",
 'index.html':'<!doctype html><main id="proof">STATIC-SEED-NOT-PUBLISHED</main>',
};
for(const [path,content] of Object.entries(files)){
 const r=await call(`/api/runtime/workspaces/${workspace.id}/files/write`,{path,content},auth.token,'PUT');assert.equal(r.status,204);assert.equal(r.headers.get('x-vc-file-persistence'),'manifest');await r.arrayBuffer();
}
console.log(JSON.stringify({stage:'static-fixture',status:'seeded',files:Object.keys(files).length}));

}
main().catch(()=>{console.error(JSON.stringify({stage:'static-fixture',status:'failed'}));process.exit(1);});
