import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
const APP='https://app.e-code.ai', API='https://api.e-code.ai';
const api=await pwRequest.newContext({timeout:60000});
const sfx=Date.now()+''+Math.random().toString(36).slice(2);
const reg=await api.post(API+'/auth/register',{data:{email:'fhi-'+sfx+'@e-code-proof.test',password:'Password123!',name:'F',organizationName:'F '+sfx}});
const auth=JSON.parse(await reg.text());
const cp=await api.post(API+'/orgs/'+auth.organization.id+'/projects',{headers:{authorization:'Bearer '+auth.token},data:{name:'FHi'}});
const pid=(await cp.json()).project.id;
const zip=new JSZip(); zip.file('src/greeting.ts','export const MARKER = "seed_v1";\n');
await api.post(API+'/projects/'+pid+'/files/import/zip',{headers:{authorization:'Bearer '+auth.token},data:{zipBase64:await zip.generateAsync({type:'base64'})}});
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:768,height:1024}});
await ctx.addCookies([{name:'vc_session',value:auth.token,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=await ctx.newPage();
await p.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded',timeout:120000});
await p.getByText('greeting.ts',{exact:false}).first().waitFor({state:'visible',timeout:180000});
await p.getByText('greeting.ts',{exact:false}).first().click();
await p.waitForTimeout(3000);
await p.locator('[data-testid="file-history-open"]').click();
await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000});
await p.waitForTimeout(1000);
const info=await p.evaluate(()=>{
  const panel=document.querySelector('[data-testid="file-history-panel"]');
  const cs=getComputedStyle(panel);
  const header=panel.querySelector('div');
  const hcs=getComputedStyle(header);
  const rect=panel.getBoundingClientRect();
  // what's the offsetParent (positioning ancestor)?
  const op=panel.offsetParent; const opcs=op?getComputedStyle(op):null;
  const monaco=document.querySelector('.monaco-editor');
  const mcs=monaco?getComputedStyle(monaco):null;
  const mrect=monaco?monaco.getBoundingClientRect():null;
  return {
    panel:{bg:cs.backgroundColor, z:cs.zIndex, pos:cs.position, opacity:cs.opacity, top:Math.round(rect.top), height:Math.round(rect.height)},
    header:{bg:hcs.backgroundColor, className:header.className.slice(0,60)},
    offsetParent:{tag:op?.tagName, cls:(op?.className||'').slice(0,60), z:opcs?.zIndex, pos:opcs?.position},
    monaco: monaco?{z:mcs.zIndex, pos:mcs.position, top:Math.round(mrect.top), height:Math.round(mrect.height)}:null,
  };
});
console.log(JSON.stringify(info,null,1));
await b.close(); await api.dispose();
