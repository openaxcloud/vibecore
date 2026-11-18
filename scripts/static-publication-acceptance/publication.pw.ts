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
  let priorId: string|undefined;
  for(const version of ['v1','v2']) {
    const marker=`static-acceptance-${version}-${randomUUID()}`;
    const html=`<!doctype html><main id="proof">${marker}</main>`;
    emitDiagnostic(`editor-${version}`,'begin');
    await page.goto(`${f.web}/projects/${f.projectId}/ide?workspace=${f.workspaceId}&panel=files`,{waitUntil:'domcontentloaded'});
    const file=page.getByText('index.html',{exact:true}).and(page.locator('.bolt-file-tree-name')).filter({visible:true}).first();
    await expect(file).toBeVisible({timeout:180_000});await file.click();
    const editor=page.locator('.monaco-editor textarea.inputarea').filter({visible:true}).first();
    await expect(editor).toBeVisible();
    let release!:()=>void;const hold=new Promise<void>(r=>release=r);let saveSeen=false;let receipt=false;let earlyPost=false;
    const posted:Request[]=[];
    const savePath=`/api/runtime/workspaces/${f.workspaceId}/files/write`;
    const panelPath=`/api/projects/${f.projectId}/ide-panel/deployments`;
    const saveRoute=async(route:import('@playwright/test').Route)=>{
      const request=route.request();let payload: {path?:string;content?:string}|undefined;
      try {payload=request.postDataJSON();}catch{}
      if(request.method()==='PUT'&&payload?.content===html){saveSeen=true;await hold;}
      await route.continue();
    };
    const responseListener=(response:import('@playwright/test').Response)=>{
      if(new URL(response.url()).pathname!==savePath||response.request().method()!=='PUT')return;
      let body;try {body=response.request().postDataJSON();}catch{return;}
      if(body?.content===html&&response.status()===204&&response.headers()['x-vc-file-persistence']==='manifest')receipt=true;
    };
    const requestListener=(request:Request)=>{
      if(new URL(request.url()).pathname===panelPath&&request.method()==='POST'){posted.push(request);if(!receipt)earlyPost=true;}
    };
    await page.route(`**${savePath}`,saveRoute);page.on('response',responseListener);page.on('request',requestListener);
    try {
      emitDiagnostic(`edit-${version}`,'begin');
      await editor.focus();await page.keyboard.press('Control+A');await page.keyboard.insertText(html);
      await page.locator('.bolt-project-publish-button').click();
      const host=page.locator('.bolt-project-deploy-tool');await expect(host).toBeVisible();
      emitDiagnostic(`form-${version}`,'begin');
      let publish;
      if(version==='v1') {
        await host.locator('.bolt-project-tool-tabs').getByRole('button',{name:/^(Manage|Gérer)$/}).click();
        const managed=host.locator('form.vc-managed-publish-form');
        await expect(managed).toHaveCount(1);await expect(managed.locator('input[name="workspaceId"]')).toHaveValue(f.workspaceId);
        await managed.locator('details > summary').click();
        await managed.locator('input[name="deployModeOverride"][value="static"]').check();
        publish=managed.getByRole('button',{name:/^(Publish|Publier)$/});
      } else {publish=host.getByTestId('publication-republier');}
      const actionResponse=page.waitForResponse(r=>new URL(r.url()).pathname===panelPath&&r.request().method()==='POST',{timeout:660_000});
      // Settle rejection immediately; do not leave an unhandled waiter if UI click fails.
      const settled=actionResponse.then(response=>({response}),()=>({response:undefined}));
      emitDiagnostic(`save-${version}`,'begin');
      const clicked=publish.click().then(()=>true,()=>false);
      await expect.poll(()=>saveSeen,{timeout:30_000}).toBe(true);assert.equal(posted.length,0,'POST_BEFORE_SAVE_RECEIPT');
      emitDiagnostic(`post-${version}`,'begin');
      release();assert.equal(await clicked,true);const {response}=await settled;assert.ok(response);assert.ok(response.ok());assert.equal((await response.json()).ok,true);
      assert.equal(earlyPost,false);assert.equal(receipt,true);assert.equal(posted.length,1);
      const sent=await form(posted[0]);
      if(version==='v1'){assert.equal(sent.get('workspaceId'),f.workspaceId);assert.equal(sent.get('provider'),'static');}
      else {assert.equal(sent.get('intent'),'redeploy');assert.equal(sent.get('deploymentId'),priorId);}
      emitDiagnostic(`deployment-${version}`,'begin');
      let deployed:Awaited<ReturnType<typeof list>>[number]|undefined;
      await expect.poll(async()=>{const rows=(await list()).filter(d=>d.workspaceId===f.workspaceId&&d.provider==='static'&&d.id!==priorId);assert.equal(rows.length,1);deployed=rows[0];assert.ok(!['FAILED','CANCELED'].includes(deployed.status));return deployed.status;},{timeout:660_000}).toBe('READY');
      assert.ok(deployed?.url);assert.equal(new URL(deployed.url).origin,f.web);
      emitDiagnostic(`anonymous-${version}`,'begin');
      const visitor=await browser.newContext();
      try {assert.deepEqual(await visitor.cookies(),[]);await visitor.route('**/*',route=>new URL(route.request().url()).origin===f.web?route.continue():route.abort());
        const clean=await visitor.newPage();const served=await clean.goto(deployed.url,{waitUntil:'domcontentloaded'});assert.equal(served?.status(),200);await expect(clean.locator('#proof')).toHaveText(marker);
      } finally {await visitor.close();}
      priorId=deployed.id;
    } finally {release();await page.unroute(`**${savePath}`,saveRoute);page.off('response',responseListener);page.off('request',requestListener);}
  }
  console.log(JSON.stringify({stage:'anonymous-static-versions',status:'verified',versions:2}));
});
