import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{workerCallFailure,workerResultFailure}from'./worker-outcome.mjs';import{diagnostic}from'./diagnostics.mjs';
import{JSDOM}from'jsdom';
import{createRequire}from'node:module';
import{dirname,join}from'node:path';
import{pathToFileURL}from'node:url';
import{planMarkerEdit}from'./editor-edit-preflight.ts';
import{observeOwnedFileTab}from'./editor-dirty-observer.mjs';
test('worker outcomes preserve HTTP versus returned failure without projecting raw values',()=>{
 for(const [error,expected]of [[{message:'deploy.build upstream failed: 401'},'worker-http-4xx'],[{message:'deploy.build upstream failed: 503'},'worker-http-5xx'],[{message:'PRIVATE SECRET'},'worker-call-failed']])assert.equal(workerCallFailure(error),expected);
 assert.equal(workerResultFailure({deployment:{id:'owned',status:'READY'}},'owned'),undefined);
 for(const [value,expected]of [[{deployment:{id:'other',status:'READY'}},'worker-result-mismatch'],[{deployment:{id:'owned',status:'FAILED',logs:['PRIVATE']}},'worker-result-failed'],[{deployment:{id:'owned',status:'BUILDING'}},'worker-not-ready']]){assert.equal(workerResultFailure(value,'owned'),expected);assert.ok(diagnostic({kind:'static-diagnostic',stage:'worker-build',status:'failed',failure:expected}));}
});
test('genuine input and pre-publication proof are retained without store/model mutation',()=>{
 const source=readFileSync(new URL('publication.pw.ts',import.meta.url),'utf8'),helper=readFileSync(new URL('editor-edit-preflight.ts',import.meta.url),'utf8');
 const edit=source.indexOf('await editIndexThroughVisibleMonaco(page,html,priorHtml'),publish=source.indexOf("await page.locator('.bolt-project-publish-button').click()");assert.ok(edit>=0&&publish>edit);
 assert.match(source,/write\.seen\(\)\|\|earlyPost/);assert.match(source,/proveHeldPublication/);assert.match(source,/guardPublicationPost/);
 assert.match(helper,/await view.click\(\)/);assert.match(helper,/ControlOrMeta\+End/);assert.match(helper,/Shift\+ArrowLeft/);assert.match(helper,/keyboard\.insertText\(planned\.text\)/);assert.doesNotMatch(helper,/keyboard\.insertText\(html\)/);assert.match(helper,/tab\.evaluateHandle\(observeOwnedFileTab\)/);assert.match(helper,/selected\.selectedMarker/);assert.match(helper,/editor\?\.getValue\(\)===expected/);assert.doesNotMatch(helper,/\.setValue\(|\.executeEdits\(|workbenchStore|\.fill\(/);
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
 for(const failure of ["edit-fixture-marker","edit-tab-not-clean","edit-model-before","edit-focus-before","edit-selection","edit-model-missing","edit-model-still-original","edit-model-unexpected","edit-dirty-unseen-replaced","edit-dirty-unseen","edit-focus-after","edit-view-diverged","edit-not-settled"])assert.ok(diagnostic({kind:'static-diagnostic',stage:'edit-v1',status:'failed',failure}));
 assert.equal(diagnostic({kind:'static-diagnostic',stage:'edit-v1',status:'failed',failure:'PRIVATE RAW TEXT'}),null);
});

test('marker-only plan requires the same ASCII scaffold and unique old/new marker',()=>{
 const html=marker=>'<!doctype html><main id="proof">'+marker+'</main>';
 const seed='STATIC-SEED-NOT-PUBLISHED',v1='static-acceptance-v1-a0000000-0000-4000-8000-000000000000',v2='static-acceptance-v2-b0000000-0000-4000-8000-000000000000';
 for(const [prev,next] of [[seed,v1],[v1,v2]]){
  const old=html(prev),wanted=html(next),planned=planMarkerEdit(old,wanted);
  assert.ok(planned);assert.equal(old.slice(planned.range.start,planned.range.end),prev);
  assert.equal(planned.suffixLength,'</main>'.length);
  assert.equal(old.slice(0,planned.range.start)+planned.text+old.slice(planned.range.end),wanted);
 }
 for(const [old,wanted]of [[html(seed),html(seed)],[html(seed),html(v1)+'\n'],[html('proof'),html(v1)],[html(seed),html('bad marker')],[html(seed),html(v1).replace('main','div')],[html(seed),html('<unsafe>')]])assert.equal(planMarkerEdit(old,wanted),undefined);
});

test('pinned Monaco HTML and plaintext keyboard rules surround on a leading angle bracket but not the marker',async()=>{
 const require=createRequire(import.meta.url),pkg=require.resolve('monaco-editor/package.json');
 assert.equal(require(pkg).version,'0.52.2');
 const root=join(dirname(pkg),'esm/vs'),mod=relative=>import(pathToFileURL(join(root,relative)).href);
 const {TextAreaState}=await mod('editor/browser/controller/textAreaState.js');
 const {Selection}=await mod('editor/common/core/selection.js');
 const {SurroundSelectionOperation,SimpleCharacterTypeOperation}=await mod('editor/common/cursor/cursorTypeEditOperations.js');
 const {SurroundSelectionCommand}=await mod('editor/common/commands/surroundSelectionCommand.js');
 const {LanguageService}=await mod('editor/common/services/languageService.js');
 const {LanguageConfigurationRegistry}=await mod('editor/common/languages/languageConfigurationRegistry.js');
 const languages=new LanguageService(),registry=new LanguageConfigurationRegistry();
 const fallback=languages.createById('html').languageId;
 assert.equal(fallback,'plaintext');
 const fallbackPairs=Object.fromEntries(registry.getLanguageConfiguration(fallback).getSurroundingPairs().map(({open,close})=>[open,close]));
 assert.equal(fallbackPairs['<'],'>');
 registry.dispose();languages.dispose();
 const htmlConfig=readFileSync(join(root,'basic-languages/html/html.js'),'utf8');
 const htmlPairs=htmlConfig.match(/surroundingPairs:\s*\[([\s\S]+?)\n  \]/)?.[1]; assert.ok(htmlPairs);assert.match(htmlPairs,/\{ open: "<", close: ">" \}/);
 assert.match(readFileSync(join(root,'editor/common/config/editorOptions.js'),'utf8'),/'autoSurround', 'languageDefined'/);
 assert.match(readFileSync(join(root,'editor/common/cursor/cursor.js'),'utf8'),/source === 'keyboard'[\s\S]*?while \(offset < len\)[\s\S]*?typeWithInterceptors/);
 const old='<!doctype html><main id="proof">STATIC-SEED-NOT-PUBLISHED</main>',next='<!doctype html><main id="proof">static-acceptance-v1-00000000-0000-4000-8000-000000000000</main>';
 const model={getLineContent:()=>old},cfg={autoSurround:'languageDefined',surroundingPairs:{'<':'>'}};
 const whole=new Selection(1,1,1,old.length+1);
 const typed=TextAreaState.deduceInput(new TextAreaState(old,0,old.length,whole,0),new TextAreaState(next,next.length,next.length,null,0),false);
 assert.equal(typed.text,next);assert.equal(typed.replacePrevCharCnt,0);
 const collect=command=>{const changes=[],take=(r,text)=>changes.push([r.startColumn,r.endColumn,text]);command.getEditOperations(model,{addTrackedEditOperation:take,addEditOperation:take});return changes;};
 const configurations=[cfg,{...cfg,surroundingPairs:fallbackPairs}];
 for(const configuration of configurations){
  const command=SurroundSelectionOperation.getEdits(configuration,model,[whole],typed.text[0],false).commands[0];
  assert.ok(command instanceof SurroundSelectionCommand);
  assert.deepEqual(collect(command),[[1,1,'<'],[old.length+1,old.length+1,'>']]);
 }
 const {range:{start,end},text}=planMarkerEdit(old,next),marker=new Selection(1,start+1,1,end+1);
 const input=TextAreaState.deduceInput(new TextAreaState(old,start,end,marker,0),new TextAreaState(next,start+text.length,start+text.length,null,0),false);
 assert.equal(input.text,text);assert.equal(input.replacePrevCharCnt,0);
 for(const configuration of configurations)assert.equal(SurroundSelectionOperation.getEdits(configuration,model,[marker],input.text[0],false),undefined);
 assert.deepEqual(collect(SimpleCharacterTypeOperation.getEdits(0,[marker],input.text[0]).commands[0]),[[start+1,end+1,'s']]);
});
