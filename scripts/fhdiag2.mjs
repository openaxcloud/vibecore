import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
const APP='https://app.e-code.ai', API='https://api.e-code.ai';
const MOD=process.platform==='darwin'?'Meta':'Control';
const api=await pwRequest.newContext({timeout:60000});
const sfx=Date.now()+''+Math.random().toString(36).slice(2);
const reg=await api.post(API+'/auth/register',{data:{email:'fhd2-'+sfx+'@e-code-proof.test',password:'Password123!',name:'F',organizationName:'F '+sfx}});
const auth=JSON.parse(await reg.text());
const cp=await api.post(API+'/orgs/'+auth.organization.id+'/projects',{headers:{authorization:'Bearer '+auth.token},data:{name:'FHdiag2'}});
const pid=(await cp.json()).project.id;
const zip=new JSZip(); zip.file('src/greeting.ts','line0\n');
await api.post(API+'/projects/'+pid+'/files/import/zip',{headers:{authorization:'Bearer '+auth.token},data:{zipBase64:await zip.generateAsync({type:'base64'})}});
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addCookies([{name:'vc_session',value:auth.token,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await ctx.newPage();
await p.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded'});
await p.getByText('greeting.ts',{exact:false}).first().waitFor({state:'visible',timeout:180000});
await p.getByText('greeting.ts',{exact:false}).first().click();
// poll up to 40s for editor readiness
let kind='none';
for(let i=0;i<20;i++){
  const mon=await p.locator('.monaco-editor').count();
  const ta=await p.locator('[data-testid="responsive-code-editor"] textarea, .bolt-project-editor-adapter textarea, textarea.inputarea').count();
  const cm=await p.locator('.cm-content').count();
  if(mon){kind='monaco';break;}
  if(cm){kind='cm';break;}
  if(ta){kind='textarea';break;}
  await p.waitForTimeout(2000);
}
console.log('editor kind:', kind);
// Try to change content + observe via the History baseline seeding difference:
// Type using keyboard into whatever is focused after clicking editor region.
const region=p.locator('[data-testid="responsive-code-editor"]').first();
await region.click({position:{x:200,y:60}}).catch(()=>{});
await p.keyboard.press(MOD+'+A'); await p.keyboard.type('CHANGED_ONE'); await p.waitForTimeout(300);
await p.keyboard.press(MOD+'+S'); await p.waitForTimeout(1800);
await region.click({position:{x:200,y:60}}).catch(()=>{});
await p.keyboard.press(MOD+'+A'); await p.keyboard.type('CHANGED_TWO_DIFFERENT'); await p.waitForTimeout(300);
await p.keyboard.press(MOD+'+S'); await p.waitForTimeout(1800);
await p.locator('[data-testid="file-history-open"]').click();
await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000});
console.log('meta after 2 edits:', (await p.locator('[data-testid="file-history-meta"]').innerText().catch(()=>'?')).replace(/\n/g,' '));
await b.close(); await api.dispose();
