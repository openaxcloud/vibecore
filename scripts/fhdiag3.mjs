import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
const APP='https://app.e-code.ai', API='https://api.e-code.ai';
const MOD=process.platform==='darwin'?'Meta':'Control';
const api=await pwRequest.newContext({timeout:60000});
const sfx=Date.now()+''+Math.random().toString(36).slice(2);
const reg=await api.post(API+'/auth/register',{data:{email:'fhd3-'+sfx+'@e-code-proof.test',password:'Password123!',name:'F',organizationName:'F '+sfx}});
const auth=JSON.parse(await reg.text());
const cp=await api.post(API+'/orgs/'+auth.organization.id+'/projects',{headers:{authorization:'Bearer '+auth.token},data:{name:'FHdiag3'}});
const pid=(await cp.json()).project.id;
const zip=new JSZip(); zip.file('src/greeting.ts','export const MARKER = "seed-content-xyz";\n');
await api.post(API+'/projects/'+pid+'/files/import/zip',{headers:{authorization:'Bearer '+auth.token},data:{zipBase64:await zip.generateAsync({type:'base64'})}});
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addCookies([{name:'vc_session',value:auth.token,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await ctx.newPage();
await p.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded'});
await p.getByText('greeting.ts',{exact:false}).first().waitFor({state:'visible',timeout:180000});
await p.getByText('greeting.ts',{exact:false}).first().click();
// Wait until the editor actually shows the seeded content (runtime served the file).
let loaded=false;
for(let i=0;i<40;i++){
  const t=await p.locator('.view-lines').first().innerText().catch(()=>'');
  if(t.includes('seed-content-xyz')){loaded=true;console.log('content loaded after',i*2,'s');break;}
  await p.waitForTimeout(2000);
}
console.log('content loaded:',loaded);
async function edit(newLine){
  await p.locator('.view-lines').first().click();
  await p.keyboard.press(MOD+'+A'); await p.keyboard.press('Delete');
  await p.keyboard.type(newLine);
  await p.waitForTimeout(400);
  await p.keyboard.press(MOD+'+S');
  await p.waitForTimeout(2500);
}
await edit('export const MARKER = "v2";');
await edit('export const MARKER = "v3-final";');
await p.locator('[data-testid="file-history-open"]').click();
await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000});
console.log('meta:', (await p.locator('[data-testid="file-history-meta"]').innerText().catch(()=>'?')).replace(/\n/g,' '));
await b.close(); await api.dispose();
