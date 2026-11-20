import test from 'node:test';import assert from 'node:assert/strict';import{proveHeldPublication,guardPublicationPost,exactEndpoint,observeHeldSave,saveBarrierFailureCode,SaveBarrierFailure}from'./save-barrier.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('pre-existing autosave cannot release until real click and pending confirmation both complete',async()=>{
 const click=deferred(),pending=deferred();let release=false;const order=[];
 const run=proveHeldPublication({clicked:click.promise,waitPending:async()=>{order.push('pending');await pending.promise;},waitSave:async()=>{order.push('save');},saveSeen:()=>true,saveFailure:()=> 'save-put-not-seen',earlyPost:()=>false,postCount:()=>0}).then(()=>{release=true;});
 await Promise.resolve();assert.equal(release,false);assert.deepEqual(order,[]);
 click.resolve(true);await new Promise(r=>setImmediate(r));assert.equal(release,false);assert.deepEqual(order,['pending']);
 pending.resolve();await run;assert.equal(release,true);assert.deepEqual(order,['pending','save']);
});
test('early POST, failed click and missing save never pass the release barrier',async()=>{
 const base={clicked:Promise.resolve(true),waitPending:async()=>{},waitSave:async()=>{},saveSeen:()=>true,saveFailure:()=> 'save-put-not-seen',earlyPost:()=>false,postCount:()=>0};
 for(const delta of [{clicked:Promise.resolve(false)},{earlyPost:()=>true},{saveSeen:()=>false},{postCount:()=>1}])await assert.rejects(proveHeldPublication({...base,...delta}));
 let early=false;await assert.rejects(proveHeldPublication({...base,waitPending:async()=>{early=true;},earlyPost:()=>early}));
});
test('exact scoped routed POST aborts without receipt, correct real POST continues unchanged',async()=>{
 const calls=[];let early=0;const route={request:()=>({method:()=> 'POST'}),continue:async()=>{calls.push('continue');},abort:async code=>{calls.push(code);}};
 await guardPublicationPost(route,()=>false,()=>{early++;});assert.deepEqual(calls,['blockedbyclient']);assert.equal(early,1);
 calls.length=0;await guardPublicationPost(route,()=>true,()=>{early++;});assert.deepEqual(calls,['continue']);assert.equal(early,1);
 calls.length=0;await guardPublicationPost({...route,request:()=>({method:()=> 'GET'})},()=>false,()=>{early++;});assert.deepEqual(calls,['continue']);assert.equal(early,1);
});

test('barrier projects fast failure types without any exception text or network detail',async()=>{
 const base={clicked:Promise.resolve(true),waitPending:async()=>{},waitSave:async()=>{},saveSeen:()=>true,saveFailure:()=> 'save-body-content-mismatch',earlyPost:()=>false,postCount:()=>0};
 const error=new Error('private arbitrary failure');
 for(const [delta,code]of [
  [{clicked:Promise.reject(error)},'save-click-rejected'],
  [{earlyPost:()=>true},'save-post-before-receipt'],
  [{waitPending:async()=>{throw error;}},'save-pending-timeout'],
  [{waitSave:async()=>{throw error;}},'save-body-content-mismatch'],
 ])await assert.rejects(proveHeldPublication({...base,...delta}),e=>e.message==='PUBLICATION_BARRIER_NOT_VERIFIED'&&saveBarrierFailureCode(e)===code);
 assert.equal(saveBarrierFailureCode(error),'save-barrier-unexpected');
 assert.equal(saveBarrierFailureCode(new SaveBarrierFailure('raw arbitrary value')),'save-barrier-unexpected');
});

test('only matching owned held PUT and its real 204 manifest can admit a POST',async()=>{
 const origin='http://127.0.0.1:4317',pathname='/api/runtime/workspaces/owned/files/write';
 const scope=exactEndpoint(origin,pathname),state=observeHeldSave({scope,file:'index.html',content:'fixture-full-html'});
 const request=(body,url=origin+pathname,method='PUT')=>({method:()=>method,url:()=>url,postDataJSON:()=>{if(body===null)throw new Error('private');return body;}});
 for(const [req,reason]of [
  [request({path:'index.html',content:'fixture-full-html'},origin+pathname,'GET'),'save-put-not-seen'],
  [request({path:'index.html',content:'fixture-full-html'},origin+pathname+'?extra=1'),'save-put-not-seen'],
  [request(null),'save-body-invalid'],
  [request({path:'other.html',content:'fixture-full-html'}),'save-body-wrong-file'],
  [request({path:'index.html',content:'different'}),'save-body-content-mismatch'],
 ]){assert.equal(state.request(req),false);assert.equal(state.putFailure(),reason);}
 const held=request({path:'index.html',content:'fixture-full-html'}),other=request({path:'index.html',content:'fixture-full-html'});
 const response=(req,status,persistence)=>({request:()=>req,status:()=>status,headers:()=>({'x-vc-file-persistence':persistence})});
 assert.equal(state.request(held),true);assert.equal(state.seen(),true);
 state.response(response(held,204,'manifest'));assert.equal(state.verified(),false);assert.equal(state.receiptFailure(),'save-receipt-before-release');
 state.allowRelease();
 state.response(response(other,204,'manifest'));assert.equal(state.verified(),false);
 state.response(response(held,409,'manifest'));assert.equal(state.receiptFailure(),'save-receipt-non-204');assert.equal(state.verified(),false);
 state.response(response(held,204,'runtime-only'));assert.equal(state.receiptFailure(),'save-receipt-not-manifest');assert.equal(state.verified(),false);
 const events=[],route={request:()=>({method:()=> 'POST'}),continue:async()=>events.push('real-pass'),abort:async()=>events.push('actual-abort')};
 await guardPublicationPost(route,state.verified,()=>{});assert.deepEqual(events,['actual-abort']);
 state.response(response(held,204,'manifest'));assert.equal(state.verified(),true);
 await guardPublicationPost(route,state.verified,()=>{});assert.deepEqual(events,['actual-abort','real-pass']);
});
