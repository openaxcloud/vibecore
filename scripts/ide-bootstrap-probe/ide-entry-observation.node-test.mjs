import test from 'node:test';import assert from 'node:assert/strict';import{EventEmitter}from'node:events';
import{classifyDocument,resourceOf,safeObservation,attachIdeEntryObserver}from'./ide-entry-observation.mjs';
const f={web:'http://127.0.0.1:4317',projectId:'owned-project',workspaceId:'owned-workspace'};
test('document identities are exact and contain no route/query/private strings',()=>{
 assert.equal(classifyDocument(f.web+'/projects/owned-project/ide?workspace=owned-workspace',200,f).identity,'expected-project-workspace');
 for(const [url,status,result]of [[f.web+'/login?next=PRIVATE',200,'login'],[f.web+'/projects/owned-project/ide?workspace=PRIVATE',200,'wrong-workspace'],[f.web+'/projects/owned-project/ide',200,'missing-workspace'],[f.web+'/projects/owned-project/ide?workspace=owned-workspace',500,'http-error'],['https://PRIVATE.example',200,'off-origin']]){const r=classifyDocument(url,status,f);assert.equal(r.identity,result);assert.ok(!JSON.stringify(r).includes('PRIVATE'));}
});
test('only exact owned GET resources are observed; arbitrary/credential queries are ignored',()=>{
 const paths=[['/api/projects/owned-project/export/zip','archive-json'],['/api/projects/owned-project/project-action?intent=export','archive-binary'],['/api/runtime-token?projectId=owned-project','runtime-ticket'],['/api/runtime/workspaces/owned-workspace/files?path=.','runtime-files'],['/api/runtime/workspaces/owned-workspace/files/read?path=%2Fhome%2Fproject%2Findex.html','runtime-read']];
 for(const[p,r]of paths){assert.equal(resourceOf(f.web+p,'GET',f),r);assert.equal(resourceOf(f.web+p,'POST',f),null);}
 for(const p of ['/api/runtime-token?projectId=other','/api/runtime-token?projectId=owned-project&token=PRIVATE','/api/projects/other/export/zip','/api/runtime/workspaces/other/files?path=.'])assert.equal(resourceOf(f.web+p,'GET',f),null);
 assert.equal(safeObservation({kind:'ide-entry-network',resource:'runtime-ticket',outcome:'4xx',body:'PRIVATE'}),null);
});
class Page extends EventEmitter{url(){return f.web+'/projects/owned-project/ide?workspace=owned-workspace';}locator(s){return{filter(){return this;},count:async()=>s.includes('monaco')?0:1};}getByText(){return{and:()=>this.locator('row')};}}
test('first exact bootstrap failure stops before DOM operations; no body/header access or raw logging',()=>{
 const page=new Page(),out=[];const observer=attachIdeEntryObserver(page,f,r=>out.push(r));
 const response={url:()=>f.web+'/api/runtime-token?projectId=owned-project',status:()=>403,request:()=>({method:()=>'GET'}),body(){throw Error('must not read body');}};
 page.emit('response',response);page.emit('response',response);
 assert.deepEqual(out,[{kind:'ide-entry-network',resource:'runtime-ticket',outcome:'4xx'}]);assert.throws(()=>observer.assertNoProvenIssue(),/^Error: bootstrap-http-error$/);observer.detach();assert.equal(page.listenerCount('response'),0);
});
test('DOM checks emit booleans only and unavailable editor is not a publication pass',async()=>{
 const out=[];const observer=attachIdeEntryObserver(new Page(),f,r=>out.push(r));observer.document({status:()=>200});
 const dom=await observer.checkpoint('after-document');assert.equal(dom.row,true);assert.equal(dom.monaco,false);
 await assert.rejects(observer.checkpoint('after-file-open'),/^Error: editor-unavailable$/);assert.ok(out.every(r=>safeObservation(r)));observer.detach();
});

test('missing document response cannot become an authenticated document proof',()=>{const observer=attachIdeEntryObserver(new Page(),f,()=>{});assert.throws(()=>observer.document(null),/^Error: document-response-unverified$/);observer.detach();});
