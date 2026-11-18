import {attachScriptErrors} from './script-error.mjs';
import {test,expect} from '@playwright/test';
import {optIn,exactProduct,readFixture,ownedRecipe} from './policy.mjs';
import {attachIdeEntryObserver} from './ide-entry-observation.mjs';
import {browserRequestAllowed,ownedBootstrap} from './browser-policy.mjs';
import {emitDiagnostic} from './diagnostics.mjs';
test('observe exact IDE bootstrap without editing or publishing',async({page})=>{
 emitDiagnostic('browser-preflight','begin');optIn();exactProduct();
 const f=readFixture(process.env.VC_IDE_FIXTURE);ownedRecipe(f.recipe,f.web);
 await page.context().route('**/*',route=>{
  const request=route.request();if(!browserRequestAllowed(request.url(),request.method(),f))return route.abort();
  if(request.method()==='POST'){try{if(!ownedBootstrap(request.postDataJSON(),f))return route.abort();}catch{return route.abort();}}
  return route.continue();
 });
 await page.context().routeWebSocket('**/*',socket=>new URL(socket.url()).origin.replace(/^ws:/,'http:')===f.web?socket.connectToServer():socket.close());
 await page.context().addCookies([{name:'vc_session',value:f.token,url:f.web,httpOnly:true,sameSite:'Lax'}]);
 await page.setViewportSize({width:1440,height:1000});
 const observer=attachIdeEntryObserver(page,f,(v:unknown)=>console.log(JSON.stringify(v)));
 const script=attachScriptErrors(page,(v:unknown)=>console.log(JSON.stringify(v)));
 const guard=()=>{script.assertClear();observer.assertNoProvenIssue();};
 try {
  const response=await page.goto(`${f.web}/projects/${f.projectId}/ide?workspace=${f.workspaceId}&panel=files`,{waitUntil:'domcontentloaded'});
  observer.document(response);await observer.checkpoint('after-document');
  const file=page.getByText('index.html',{exact:true}).and(page.locator('.bolt-file-tree-name')).filter({visible:true}).first();
  // Polling checks the first fixed HTTP failure promptly, not only at the end of the wait.
  try {const deadline=Date.now()+60_000;while(Date.now()<deadline){guard();if(await file.isVisible())break;await new Promise(resolve=>setTimeout(resolve,250));}guard();}
  finally {await observer.checkpoint('file-wait-end');}
  await file.click();
  try {await expect(page.locator('.monaco-editor textarea.inputarea').filter({visible:true}).first()).toBeVisible({timeout:15_000});}
  finally {await observer.checkpoint('after-file-open');}
  guard();console.log(JSON.stringify({stage:'ide-entry-probe',status:'observed'}));
 } finally {script.detach();observer.detach();}
});
