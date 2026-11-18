import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{workerCallFailure,workerResultFailure}from'./worker-outcome.mjs';import{diagnostic}from'./diagnostics.mjs';
test('worker outcomes preserve HTTP versus returned failure without projecting raw values',()=>{
 for(const [error,expected]of [[{message:'deploy.build upstream failed: 401'},'worker-http-4xx'],[{message:'deploy.build upstream failed: 503'},'worker-http-5xx'],[{message:'PRIVATE SECRET'},'worker-call-failed']])assert.equal(workerCallFailure(error),expected);
 assert.equal(workerResultFailure({deployment:{id:'owned',status:'READY'}},'owned'),undefined);
 for(const [value,expected]of [[{deployment:{id:'other',status:'READY'}},'worker-result-mismatch'],[{deployment:{id:'owned',status:'FAILED',logs:['PRIVATE']}},'worker-result-failed'],[{deployment:{id:'owned',status:'BUILDING'}},'worker-not-ready']]){assert.equal(workerResultFailure(value,'owned'),expected);assert.ok(diagnostic({kind:'static-diagnostic',stage:'worker-build',status:'failed',failure:expected}));}
});
test('genuine input and pre-publication proof are retained without store/model mutation',()=>{
 const source=readFileSync(new URL('publication.pw.ts',import.meta.url),'utf8'),helper=readFileSync(new URL('editor-edit-preflight.ts',import.meta.url),'utf8');
 assert.ok(source.indexOf('await editIndexThroughVisibleMonaco(page,html)')<source.indexOf("await page.locator('.bolt-project-publish-button').click()"));
 assert.match(source,/saveSeen\|\|earlyPost/);assert.match(source,/proveHeldPublication/);assert.match(source,/guardPublicationPost/);
 assert.match(helper,/await view.click\(\)/);assert.match(helper,/ControlOrMeta\+a/);assert.match(helper,/MutationObserver/);assert.match(helper,/attributeOldValue:true/);assert.match(helper,/editor\?\.getValue\(\)===expected/);assert.doesNotMatch(helper,/\.setValue\(|\.executeEdits\(|workbenchStore|\.fill\(/);
});

test('only owned FAILED results classify declared codes or closest emitted phase, without raw detail',()=>{
 const failed=logs=>({deployment:{id:'owned',status:'FAILED',logs}});
 assert.equal(workerResultFailure(failed([{level:'error',message:'PRIVATE [AGENT_TOKEN_UNAVAILABLE] secret'}]),'owned'),'worker-agent-token-unavailable');
 assert.equal(workerResultFailure(failed([{level:'info',message:'[prepare] PRIVATE'},{level:'info',message:'[install] SECRET'},{level:'error',message:'[build] PRIVATE'}]),'owned'),'worker-failed-after-build-output');
 assert.equal(workerResultFailure(failed([{level:'error',message:'[UNKNOWN_PRIVATE]'}]),'owned'),'worker-result-failed');
 assert.equal(workerResultFailure(failed([{level:'error',message:'[NO_USER_CONTEXT]'}]),'other'),'worker-result-mismatch');
 for(const code of ['NO_USER_CONTEXT','NO_WEBSOCKET_RUNTIME','AGENT_TOKEN_UNAVAILABLE','WORKSPACE_UNREACHABLE','WORKSPACE_QUOTA','WORKSPACE_QUOTA_BUSY','BUILD_INVOCATION_THREW'])assert.ok(diagnostic({kind:'static-diagnostic',stage:'worker-build',status:'failed',failure:workerResultFailure(failed([{level:'error',message:`[${code}]`}]),'owned')}));
});
