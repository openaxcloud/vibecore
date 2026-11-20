import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{workerCallFailure,workerResultFailure}from'./worker-outcome.mjs';import{diagnostic}from'./diagnostics.mjs';
import{JSDOM}from'jsdom';
import{observeOwnedFileTab}from'./editor-dirty-observer.mjs';
test('worker outcomes preserve HTTP versus returned failure without projecting raw values',()=>{
 for(const [error,expected]of [[{message:'deploy.build upstream failed: 401'},'worker-http-4xx'],[{message:'deploy.build upstream failed: 503'},'worker-http-5xx'],[{message:'PRIVATE SECRET'},'worker-call-failed']])assert.equal(workerCallFailure(error),expected);
 assert.equal(workerResultFailure({deployment:{id:'owned',status:'READY'}},'owned'),undefined);
 for(const [value,expected]of [[{deployment:{id:'other',status:'READY'}},'worker-result-mismatch'],[{deployment:{id:'owned',status:'FAILED',logs:['PRIVATE']}},'worker-result-failed'],[{deployment:{id:'owned',status:'BUILDING'}},'worker-not-ready']]){assert.equal(workerResultFailure(value,'owned'),expected);assert.ok(diagnostic({kind:'static-diagnostic',stage:'worker-build',status:'failed',failure:expected}));}
});
test('genuine input and pre-publication proof are retained without store/model mutation',()=>{
 const source=readFileSync(new URL('publication.pw.ts',import.meta.url),'utf8'),helper=readFileSync(new URL('editor-edit-preflight.ts',import.meta.url),'utf8');
 const edit=source.indexOf('await editIndexThroughVisibleMonaco(page,html,priorHtml'),publish=source.indexOf("await page.locator('.bolt-project-publish-button').click()");assert.ok(edit>=0&&publish>edit);
 assert.match(source,/saveSeen\|\|earlyPost/);assert.match(source,/proveHeldPublication/);assert.match(source,/guardPublicationPost/);
 assert.match(helper,/await view.click\(\)/);assert.match(helper,/ControlOrMeta\+a/);assert.match(helper,/tab\.evaluateHandle\(observeOwnedFileTab\)/);assert.match(helper,/selected\.selectedAll/);assert.match(helper,/editor\?\.getValue\(\)===expected/);assert.doesNotMatch(helper,/\.setValue\(|\.executeEdits\(|workbenchStore|\.fill\(/);
});

test('only owned FAILED results classify declared codes or closest emitted phase, without raw detail',()=>{
 const failed=logs=>({deployment:{id:'owned',status:'FAILED',logs}});
 assert.equal(workerResultFailure(failed([{level:'error',message:'PRIVATE [AGENT_TOKEN_UNAVAILABLE] secret'}]),'owned'),'worker-agent-token-unavailable');
 assert.equal(workerResultFailure(failed([{level:'info',message:'[prepare] PRIVATE'},{level:'info',message:'[install] SECRET'},{level:'error',message:'[build] PRIVATE'}]),'owned'),'worker-failed-after-build-output');
 assert.equal(workerResultFailure(failed([{level:'error',message:'[UNKNOWN_PRIVATE]'}]),'owned'),'worker-result-failed');
 assert.equal(workerResultFailure(failed([{level:'error',message:'[NO_USER_CONTEXT]'}]),'other'),'worker-result-mismatch');
 for(const code of ['NO_USER_CONTEXT','NO_WEBSOCKET_RUNTIME','AGENT_TOKEN_UNAVAILABLE','WORKSPACE_UNREACHABLE','WORKSPACE_QUOTA','WORKSPACE_QUOTA_BUSY','BUILD_INVOCATION_THREW'])assert.ok(diagnostic({kind:'static-diagnostic',stage:'worker-build',status:'failed',failure:workerResultFailure(failed([{level:'error',message:`[${code}]`}]),'owned')}));
});

test('dirty observer preserves transient owned identity across tab remount and rejects unrelated dirty state',async()=>{
 for(const mode of ['normal','remounted','already-dirty-insertion','unrelated','initially-dirty','missing-identity']){
  const dom=new JSDOM('<div role="tablist"><button role="tab" data-tab-id="owned">index.html</button><button role="tab" data-tab-id="other">index.html</button></div>',{runScripts:'outside-only'});
  try{
   const observe=dom.window.eval('('+observeOwnedFileTab.toString()+')');
   const tab=dom.window.document.querySelector('[data-tab-id="owned"]');
   if(mode==='initially-dirty')tab.setAttribute('data-dirty','true');
   if(mode==='missing-identity')tab.removeAttribute('data-tab-id');
   const state=observe(tab);
   try{
    if(mode==='initially-dirty'||mode==='missing-identity'){assert.equal(state.valid,false);assert.equal(state.observed,false);continue;}
    assert.equal(state.valid,true);
    let edited=tab;
    if(mode==='remounted'||mode==='already-dirty-insertion'){edited=tab.cloneNode(true);if(mode==='already-dirty-insertion')edited.setAttribute('data-dirty','true');tab.replaceWith(edited);}
    if(mode==='unrelated')edited=dom.window.document.querySelector('[data-tab-id="other"]');
    if(mode!=='already-dirty-insertion'){edited.setAttribute('data-dirty','true');edited.removeAttribute('data-dirty');}
    await new Promise(queueMicrotask);
    assert.equal(state.observed,mode!=='unrelated',mode);
    assert.equal(state.replaced(),mode==='remounted'||mode==='already-dirty-insertion',mode);
   }finally{state.disconnect();}
  }finally{dom.window.close();}
 }
});

test('edit failure projection emits only closed codes and never arbitrary browser text',()=>{
 for(const failure of ["edit-tab-not-clean","edit-model-before","edit-focus-before","edit-selection","edit-model-missing","edit-model-still-original","edit-model-unexpected","edit-dirty-unseen-replaced","edit-dirty-unseen","edit-focus-after","edit-view-diverged","edit-not-settled"])assert.ok(diagnostic({kind:'static-diagnostic',stage:'edit-v1',status:'failed',failure}));
 assert.equal(diagnostic({kind:'static-diagnostic',stage:'edit-v1',status:'failed',failure:'PRIVATE RAW TEXT'}),null);
});
