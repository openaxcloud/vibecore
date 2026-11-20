import test from 'node:test';import assert from 'node:assert/strict';import{proveHeldPublication,guardPublicationPost}from'./save-barrier.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('pre-existing autosave cannot release until real click and pending confirmation both complete',async()=>{
 const click=deferred(),pending=deferred();let release=false;const order=[];
 const run=proveHeldPublication({clicked:click.promise,waitPending:async()=>{order.push('pending');await pending.promise;},waitSave:async()=>{order.push('save');},saveSeen:()=>true,earlyPost:()=>false,postCount:()=>0}).then(()=>{release=true;});
 await Promise.resolve();assert.equal(release,false);assert.deepEqual(order,[]);
 click.resolve(true);await new Promise(r=>setImmediate(r));assert.equal(release,false);assert.deepEqual(order,['pending']);
 pending.resolve();await run;assert.equal(release,true);assert.deepEqual(order,['pending','save']);
});
test('early POST, failed click and missing save never pass the release barrier',async()=>{
 const base={clicked:Promise.resolve(true),waitPending:async()=>{},waitSave:async()=>{},saveSeen:()=>true,earlyPost:()=>false,postCount:()=>0};
 for(const delta of [{clicked:Promise.resolve(false)},{earlyPost:()=>true},{saveSeen:()=>false},{postCount:()=>1}])await assert.rejects(proveHeldPublication({...base,...delta}));
 let early=false;await assert.rejects(proveHeldPublication({...base,waitPending:async()=>{early=true;},earlyPost:()=>early}));
});
test('exact scoped routed POST aborts without receipt, correct real POST continues unchanged',async()=>{
 const calls=[];let early=0;const route={request:()=>({method:()=> 'POST'}),continue:async()=>{calls.push('continue');},abort:async code=>{calls.push(code);}};
 await guardPublicationPost(route,()=>false,()=>{early++;});assert.deepEqual(calls,['blockedbyclient']);assert.equal(early,1);
 calls.length=0;await guardPublicationPost(route,()=>true,()=>{early++;});assert.deepEqual(calls,['continue']);assert.equal(early,1);
 calls.length=0;await guardPublicationPost({...route,request:()=>({method:()=> 'GET'})},()=>false,()=>{early++;});assert.deepEqual(calls,['continue']);assert.equal(early,1);
});
