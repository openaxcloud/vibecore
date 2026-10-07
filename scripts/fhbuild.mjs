import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
const APP='https://app.e-code.ai', API='https://api.e-code.ai';
const MOD=process.platform==='darwin'?'Meta':'Control';
const api=await pwRequest.newContext({timeout:60000});
const sfx=Date.now()+''+Math.random().toString(36).slice(2);
const reg=await api.post(API+'/auth/register',{data:{email:'fhb-'+sfx+'@e-code-proof.test',password:'Password123!',name:'F',organizationName:'F '+sfx}});
const auth=JSON.parse(await reg.text());
const cp=await api.post(API+'/orgs/'+auth.organization.id+'/projects',{headers:{authorization:'Bearer '+auth.token},data:{name:'FHbuild'}});
const pid=(await cp.json()).project.id;
const zip=new JSZip(); zip.file('src/greeting.ts','export const MARKER = "seed_v1";\n');
await api.post(API+'/projects/'+pid+'/files/import/zip',{headers:{authorization:'Bearer '+auth.token},data:{zipBase64:await zip.generateAsync({type:'base64'})}});
console.log('project',pid,'token',auth.token.slice(0,12));
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addCookies([{name:'vc_session',value:auth.token,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await ctx.newPage();
await p.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded'});
await p.getByText('greeting.ts',{exact:false}).first().waitFor({state:'visible',timeout:180000});
await p.getByText('greeting.ts',{exact:false}).first().click();
// Wait for runtime to serve file content into the editor.
let loaded=false;
for(let i=0;i<60;i++){
  const t=await p.locator('.view-lines').first().innerText().catch(()=>'');
  if(t.includes('seed_v1')){loaded=true;console.log('content loaded @'+(i*2)+'s');break;}
  await p.waitForTimeout(2000);
}
if(!loaded) console.log('WARN content never loaded');
async function versionCount(){
  const wasOpen=await p.locator('[data-testid="file-history-panel"]').count();
  if(!wasOpen){ await p.locator('[data-testid="file-history-open"]').click().catch(()=>{}); await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000}).catch(()=>{}); }
  const meta=await p.locator('[data-testid="file-history-meta"]').innerText().catch(()=>'');
  const m=meta.match(/Version\s+(\d+)\s*\/\s*(\d+)/);
  // close panel
  await p.getByLabel('Close file history').click().catch(()=>p.keyboard.press('Escape'));
  await p.waitForTimeout(400);
  return m?Number(m[2]):0;
}
async function tryEdit(v){
  try{
    await p.locator('.view-lines').first().click({timeout:8000});
    await p.keyboard.press(MOD+'+A'); await p.keyboard.press('Delete');
    await p.keyboard.type('export const MARKER = "v'+v+'_'+Math.random().toString(36).slice(2,6)+'";');
    await p.waitForTimeout(500);
    await p.keyboard.press(MOD+'+S');
    await p.waitForTimeout(3000);
    return true;
  }catch(e){ console.log('edit err', String(e).slice(0,80)); return false; }
}
let target=4, attempts=0;
while(attempts<8){
  const c=await versionCount();
  console.log('versions now:', c, 'attempt', attempts);
  if(c>=target) break;
  await tryEdit(attempts+2);
  attempts++;
}
const finalC=await versionCount();
console.log('FINAL versions:', finalC);
console.log('PROJECT_FOR_CAPTURE', pid);
console.log('TOKEN_FOR_CAPTURE', auth.token);
await b.close(); await api.dispose();
