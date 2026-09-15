import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
const APP='https://app.e-code.ai', API='https://api.e-code.ai';
const MOD=process.platform==='darwin'?'Meta':'Control';
const api=await pwRequest.newContext({timeout:60000});
const sfx=Date.now()+''+Math.random().toString(36).slice(2);
const reg=await api.post(API+'/auth/register',{data:{email:'fhd-'+sfx+'@e-code-proof.test',password:'Password123!',name:'F',organizationName:'F '+sfx}});
const auth=JSON.parse(await reg.text());
const cp=await api.post(API+'/orgs/'+auth.organization.id+'/projects',{headers:{authorization:'Bearer '+auth.token},data:{name:'FHdiag'}});
const pid=(await cp.json()).project.id;
const zip=new JSZip(); zip.file('src/greeting.ts','export function greeting(name) { return name; }\n');
await api.post(API+'/projects/'+pid+'/files/import/zip',{headers:{authorization:'Bearer '+auth.token},data:{zipBase64:await zip.generateAsync({type:'base64'})}});
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addCookies([{name:'vc_session',value:auth.token,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await ctx.newPage();
await p.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded'});
await p.getByText('greeting.ts',{exact:false}).first().waitFor({state:'visible',timeout:180000});
await p.getByText('greeting.ts',{exact:false}).first().click();
await p.waitForTimeout(3000);
// wait for monaco
const hasMonaco=await p.locator('.monaco-editor').count();
console.log('monaco count', hasMonaco, 'textarea.inputarea', await p.locator('.monaco-editor textarea.inputarea, textarea.inputarea').count());
const before=await p.locator('.view-lines').first().innerText().catch(()=>'(no view-lines)');
console.log('BEFORE:', JSON.stringify(before.slice(0,80)));
// try click view-lines + type
await p.locator('.monaco-editor').first().click();
await p.keyboard.press(MOD+'+A');
await p.keyboard.type('const CHANGED = 111;');
await p.waitForTimeout(500);
const after=await p.locator('.view-lines').first().innerText().catch(()=>'(no)');
console.log('AFTER type:', JSON.stringify(after.slice(0,80)));
await p.keyboard.press(MOD+'+S');
await p.waitForTimeout(2000);
// open history, read version count
await p.locator('[data-testid="file-history-open"]').click();
await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000});
const meta=await p.locator('[data-testid="file-history-meta"]').innerText().catch(()=>'(no meta)');
console.log('HISTORY meta:', meta.replace(/\n/g,' '));
await b.close(); await api.dispose();
