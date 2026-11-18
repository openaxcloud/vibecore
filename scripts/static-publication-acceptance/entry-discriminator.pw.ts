import {entryRequestDecision} from './entry-policy.mjs';
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {optIn,exactProduct,readFixture,ownedRecipe} from './policy.mjs';
import {semanticReadback,emit,uiResult} from './entry-observation.mjs';
test('read-only exact fixture semantic views and real editor boundary',async({page})=>{
 optIn();exactProduct();const f=readFixture(process.env.VC_STATIC_FIXTURE);ownedRecipe(f.recipe,f.web);
 await semanticReadback(f);
 const blocked=new Set<string>();
 await page.context().route('**/*',route=>{
  const r=route.request();let body;try{body=r.postDataJSON();}catch{}
  const decision=entryRequestDecision(r.url(),r.method(),body,f);
  if(decision!=='allowed'&&!blocked.has(decision)){blocked.add(decision);emit('request-policy',decision);}
  return decision==='allowed'?route.continue():route.abort();
 });
 await page.context().routeWebSocket('**/*',s=>new URL(s.url()).origin.replace(/^ws:/,'http:')===f.web?s.connectToServer():s.close());
 await page.context().addCookies([{name:'vc_session',value:f.token,url:f.web,httpOnly:true,sameSite:'Lax'}]);
 await page.setViewportSize({width:1440,height:1000});
 emit('document','begin');
 const response=await page.goto(`${f.web}/projects/${f.projectId}/ide?workspace=${f.workspaceId}&panel=files`,{waitUntil:'domcontentloaded'});
 const u=new URL(page.url());const exact=response?.status()===200&&u.origin===f.web&&u.pathname===`/projects/${f.projectId}/ide`&&u.searchParams.get('workspace')===f.workspaceId;
 emit('document',exact?'verified':'wrong-document');assert.ok(exact);
 const row=page.getByText('index.html',{exact:true}).and(page.locator('.bolt-file-tree-name')).filter({visible:true}).first();
 const visible=async(selector:string)=>page.locator(selector).first().isVisible();
 const state=async()=>({boundary:await visible('main.h-dvh > section[role="alert"]'),pane:await visible('.bolt-project-pane-leaf'),files:await visible('.bolt-project-files-tool'),tree:await visible('.bolt-project-file-tree'),row:await row.isVisible()});
 const checkpoint=async(stage:'ui-initial'|'ui-final')=>{const x=await state();for(const key of ['boundary','pane','files','tree','row'] as const)emit(stage+'-'+key,x[key]?'visible':'absent');return uiResult(x);};
 let result=await checkpoint('ui-initial');emit('ui-initial',result);
 const until=Date.now()+20_000;
 while(result!=='verified'&&result!=='boundary-visible'&&Date.now()<until){await page.waitForTimeout(250);result=uiResult(await state());}
 result=await checkpoint('ui-final');emit('ui-final',result);assert.equal(result,'verified');
 await row.click();await expect(page.locator('.monaco-editor textarea.inputarea').filter({visible:true}).first()).toBeVisible({timeout:10_000});
 emit('terminal','editor-ready');
});
