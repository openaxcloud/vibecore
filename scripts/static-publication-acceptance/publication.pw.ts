import {proveHeldPublication,guardPublicationPost,exactEndpoint,observeHeldSave,SaveBarrierFailure,saveBarrierFailureCode} from './save-barrier.mjs';
import {editorState,editIndexThroughVisibleMonaco} from './editor-edit-preflight.js';
import {attachFrameworkTransport} from './framework-transport.mjs';
import {attachScriptErrors} from './script-error.mjs';
import assert from 'node:assert/strict';
import {emitDiagnostic} from './diagnostics.mjs';
import { randomUUID } from 'node:crypto';
import { expect, test, type Request } from '@playwright/test';
import { optIn, exactProduct, readFixture, ownedRecipe } from './policy.mjs';

async function form(request: Request) {
  return new Response(request.postDataBuffer() as BodyInit, { headers: { 'content-type': request.headers()['content-type'] } }).formData();
}
test('real static publish and synchronous republish expose both saved versions anonymously', async ({ page, browser }) => {
  emitDiagnostic('browser-preflight','begin');
  optIn(); exactProduct(); const f=readFixture(process.env.VC_STATIC_FIXTURE); ownedRecipe(f.recipe,f.web);
  const list=async()=>{
    const r=await fetch(`${f.api}/projects/${f.projectId}/deployments`, {headers:{authorization:`Bearer ${f.token}`},signal:AbortSignal.timeout(30_000)});
    assert.equal(r.status,200); return (await r.json()).deployments as Array<{id:string;workspaceId:string;provider:string;status:string;url?:string}>;
  };
  assert.equal((await list()).length,0,'FRESH_FIXTURE_REQUIRED');
  await page.context().route('**/*',route=>new URL(route.request().url()).origin===f.web?route.continue():route.abort());
  await page.context().routeWebSocket('**/*',socket=>new URL(socket.url()).origin.replace(/^ws:/,'http:')===f.web?socket.connectToServer():socket.close());
  await page.context().addCookies([{name:'vc_session',value:f.token,url:f.web,httpOnly:true,sameSite:'Lax'}]);
  await page.setViewportSize({width:1440,height:1000});
  const framework=attachFrameworkTransport(page,f.web,f.projectId,(v:unknown)=>console.log(JSON.stringify(v)));
  const scriptErrors=attachScriptErrors(page,(value:unknown)=>console.log(JSON.stringify(value)));
  try {
  let priorId: string|undefined;
  let priorHtml='<!doctype html><main id="proof">STATIC-SEED-NOT-PUBLISHED</main>';
  for(const version of ['v1','v2']) {
    const marker=`static-acceptance-${version}-${randomUUID()}`;
    const html=`<!doctype html><main id="proof">${marker}</main>`;
    emitDiagnostic(`editor-${version}`,'begin');
    const document=await page.goto(`${f.web}/projects/${f.projectId}/ide?workspace=${f.workspaceId}&panel=files`,{waitUntil:'domcontentloaded'});
    assert.equal(document?.status(),200);const location=new URL(page.url());
    assert.equal(location.origin,f.web);assert.equal(location.pathname,`/projects/${f.projectId}/ide`);assert.equal(location.searchParams.get('workspace'),f.workspaceId);
    scriptErrors.assertClear();
    const file=page.getByText('index.html',{exact:true}).and(page.locator('.bolt-file-tree-name')).filter({visible:true}).first();
    let routeError=false;
    await expect.poll(async()=>{routeError=await page.locator('#root-error-heading').isVisible();return routeError||await file.isVisible();},{timeout:180_000}).toBe(true);
    if(routeError)emitDiagnostic(`editor-${version}`,'failed','route-error');
    assert.equal(routeError,false,'ROOT_ROUTE_ERROR');await expect(file).toBeVisible();await file.click();
    const editor=page.locator('.monaco-editor textarea.inputarea').filter({visible:true}).first();
    await expect(editor).toBeVisible();scriptErrors.assertClear();
    await expect.poll(async()=>{const s=await editorState(page,priorHtml);return s.model&&s.visual;},{timeout:30000}).toBe(true);
    emitDiagnostic(`editor-${version}`,'complete');
    let release!:()=>void;const hold=new Promise<void>(r=>release=r);let earlyPost=false;let publicationClosed=false;let versionComplete=false;
    const posted:Request[]=[];
    const saveScope=exactEndpoint(f.web,`/api/runtime/workspaces/${f.workspaceId}/files/write`);
    const panelScope=exactEndpoint(f.web,`/api/projects/${f.projectId}/ide-panel/deployments`);
    const write=observeHeldSave({scope:saveScope,file:'index.html',content:html});
    const saveRoute=async(route:import('@playwright/test').Route)=>{
      if(write.request(route.request()))await hold;
      await route.continue();
    };
    const responseListener=(response:import('@playwright/test').Response)=>write.response(response);
    const requestListener=(request:Request)=>{
      if(panelScope(new URL(request.url()))&&request.method()==='POST'){posted.push(request);if(!write.verified())earlyPost=true;}
    };
    const publicationRoute=(route:import('@playwright/test').Route)=>guardPublicationPost(route,()=>!publicationClosed&&write.verified(),()=>{earlyPost=true;});
    await page.route(panelScope,publicationRoute);await page.route(saveScope,saveRoute);page.on('response',responseListener);page.on('request',requestListener);
    try {
      emitDiagnostic(`edit-${version}`,'begin');
      await editIndexThroughVisibleMonaco(page,html,priorHtml,`edit-${version}`);
      emitDiagnostic(`edit-${version}`,'complete');
      await page.locator('.bolt-project-publish-button').click();
      const host=page.locator('.bolt-project-deploy-tool');await expect(host).toBeVisible();
      emitDiagnostic(`form-${version}`,'begin');
      let publish:import('@playwright/test').Locator;
      if(version==='v1') {
        await host.locator('.bolt-project-tool-tabs').getByRole('button',{name:/^(Manage|Gérer)$/}).click();
        const managed=host.locator('form.vc-managed-publish-form');
        await expect(managed).toHaveCount(1);await expect(managed.locator('input[name="workspaceId"]')).toHaveValue(f.workspaceId);
        await managed.locator('details > summary').click();
        await managed.locator('input[name="deployModeOverride"][value="static"]').check();
        // The same button's text changes to Publishing… / Publication… as soon as it is busy.
        publish=managed.locator('button[type="submit"]');
        await expect(publish).toHaveCount(1);
        await expect(publish).toHaveAccessibleName(/^(Publish|Publier)$/);
      } else {publish=host.getByTestId('publication-republier');}
      const actionResponse=page.waitForResponse(r=>panelScope(new URL(r.url()))&&r.request().method()==='POST',{timeout:660_000});
      // Settle rejection immediately; do not leave an unhandled waiter if UI click fails.
      const settled=actionResponse.then(response=>({response}),()=>({response:undefined}));
      let barrierStage=`save-${version}`;
      emitDiagnostic(barrierStage,'begin');
      scriptErrors.assertClear();
      try {
        const clicked=publish.click().then(()=>true,()=>false);
        await proveHeldPublication({clicked,
          waitPending:async()=>{await expect.poll(async()=>earlyPost||await publish.isDisabled({timeout:750}).catch(()=>false),{timeout:10000}).toBe(true);},
          waitSave:async()=>{await expect.poll(()=>write.seen()||earlyPost,{timeout:30000}).toBe(true);},
          saveSeen:write.seen,saveFailure:write.putFailure,earlyPost:()=>earlyPost,postCount:()=>posted.length});
        barrierStage=`post-${version}`;
        emitDiagnostic(barrierStage,'begin');
        write.allowRelease();release();
        // A valid receipt must refer to the exact held PUT, not any unrelated or optimistic write.
        try {await expect.poll(()=>write.verified()||earlyPost,{timeout:60000}).toBe(true);}
        catch {throw new SaveBarrierFailure(write.receiptFailure());}
        if(earlyPost)throw new SaveBarrierFailure('save-post-before-receipt');
        if(!write.verified())throw new SaveBarrierFailure(write.receiptFailure());
      }catch(error){
        emitDiagnostic(barrierStage,'failed',saveBarrierFailureCode(error));
        throw error;
      }
      const {response}=await settled;
      if(!response?.ok()||(await response.json().catch(()=>null))?.ok!==true){
        emitDiagnostic(barrierStage,'failed',earlyPost?'save-post-before-receipt':'save-response-invalid');
        throw new SaveBarrierFailure(earlyPost?'save-post-before-receipt':'save-response-invalid');
      }
      assert.equal(earlyPost,false);assert.equal(write.verified(),true);assert.equal(posted.length,1);
      const sent=await form(posted[0]);
      if(version==='v1'){assert.equal(sent.get('workspaceId'),f.workspaceId);assert.equal(sent.get('provider'),'static');}
      else {assert.equal(sent.get('intent'),'redeploy');assert.equal(sent.get('deploymentId'),priorId);}
      emitDiagnostic(`deployment-${version}`,'begin');
      let deployed:Awaited<ReturnType<typeof list>>[number]|undefined;
      await expect.poll(async()=>{const rows=(await list()).filter(d=>d.workspaceId===f.workspaceId&&d.provider==='static'&&d.id!==priorId);assert.equal(rows.length,1);deployed=rows[0];assert.ok(!['FAILED','CANCELED'].includes(deployed.status));return deployed.status;},{timeout:660_000}).toBe('READY');
      assert.ok(deployed?.url);assert.equal(new URL(deployed.url).origin,f.web);
      scriptErrors.assertClear();
      emitDiagnostic(`anonymous-${version}`,'begin');
      const visitor=await browser.newContext();
      try {assert.deepEqual(await visitor.cookies(),[]);await visitor.route('**/*',route=>new URL(route.request().url()).origin===f.web?route.continue():route.abort());
        const clean=await visitor.newPage();const served=await clean.goto(deployed.url,{waitUntil:'domcontentloaded'});assert.equal(served?.status(),200);await expect(clean.locator('#proof')).toHaveText(marker);
      } finally {await visitor.close();}
      priorId=deployed.id;priorHtml=html;versionComplete=true;
    } finally {
      publicationClosed=true;
      release();
      if(versionComplete){
        await page.unroute(saveScope,saveRoute);await page.unroute(panelScope,publicationRoute);
      } else {
        // Keep the scoped POST guard armed while pending saves settle on failure.
        await page.close().catch(()=>undefined);
      }
      page.off('response',responseListener);page.off('request',requestListener);
    }
  }
  scriptErrors.assertClear();
  console.log(JSON.stringify({stage:'anonymous-static-versions',status:'verified',versions:2}));
  } finally {framework.detach();scriptErrors.detach();}
});
