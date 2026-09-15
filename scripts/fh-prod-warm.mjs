import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
import { mkdirSync, rmSync } from 'node:fs';
const APP=process.env.APP_BASE_URL??'https://app.e-code.ai', API=process.env.API_BASE_URL??'https://api.e-code.ai';
const OUT=process.env.FH_OUT, UDD=process.env.FH_UDD;
mkdirSync(OUT,{recursive:true}); try{rmSync(UDD,{recursive:true,force:true});}catch{}
const MOD=process.platform==='darwin'?'Meta':'Control';
const WIDTHS=[{w:1440,h:900,name:'desktop-1440'},{w:1024,h:768,name:'tablet-1024'},{w:768,h:1024,name:'tablet-768'},{w:390,h:844,name:'mobile-390'}];
async function seed(){
  const api=await pwRequest.newContext({timeout:60000});
  const sfx=Date.now()+''+Math.random().toString(36).slice(2);
  const reg=await api.post(API+'/auth/register',{data:{email:'fhw-'+sfx+'@e-code-proof.test',password:'Password123!',name:'F',organizationName:'F '+sfx}});
  const auth=JSON.parse(await reg.text());
  const cp=await api.post(API+'/orgs/'+auth.organization.id+'/projects',{headers:{authorization:'Bearer '+auth.token},data:{name:'FHwarm'}});
  const pid=(await cp.json()).project.id;
  const zip=new JSZip(); zip.file('src/greeting.ts','export const MARKER = "seed_v1";\n');
  await api.post(API+'/projects/'+pid+'/files/import/zip',{headers:{authorization:'Bearer '+auth.token},data:{zipBase64:await zip.generateAsync({type:'base64'})}});
  await api.dispose(); return {token:auth.token,pid};
}
async function splash(p){return (await p.getByText('Loading E-Code',{exact:false}).count())>0;}
async function noSplash(p,t=90000){for(let i=0;i<t/1000;i++){if(!(await splash(p)))return;await p.waitForTimeout(1000);}}
async function dismissTour(p){
  for(const t of ['Skip tour','Skip','Got it','Dismiss','Close']){
    const el=p.getByRole('button',{name:new RegExp('^'+t+'$','i')}).first();
    if(await el.count()){ await el.click().catch(()=>{}); await p.waitForTimeout(400); }
  }
}
async function shot(p,path){for(let i=0;i<5;i++){await noSplash(p,30000);await p.waitForTimeout(600);if(!(await splash(p))){await p.screenshot({path});return;}}await p.screenshot({path});}
async function openGreeting(p,w){
  if(w<=1199){await p.evaluate(()=>window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel',{detail:{panel:'files'}})));await p.waitForTimeout(800);}
  const it=p.getByText('greeting.ts',{exact:false}).first();
  await it.waitFor({state:'visible',timeout:120000}); await it.click();
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('vibecore:open-editor-file',{detail:{filePath:'src/greeting.ts'}})));
  if(w<=1199){await p.evaluate(()=>window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel',{detail:{panel:'editor'}})));await p.waitForTimeout(800);}
  await p.waitForTimeout(2000);
}
async function versions(p){const m=(await p.locator('[data-testid="file-history-meta"]').innerText().catch(()=>'')).match(/Version\s+\d+\s*\/\s*(\d+)/);return m?+m[1]:0;}
async function drive(p,tag){
  await noSplash(p,60000);
  const b=p.locator('[data-testid="file-history-open"]'); await b.waitFor({state:'visible',timeout:30000});
  await shot(p,`${OUT}/${tag}-a-button.png`);
  await b.click(); await p.locator('[data-testid="file-history-panel"]').waitFor({state:'visible',timeout:8000});
  await p.locator('[data-testid="file-history-slider"]').waitFor({state:'visible'});
  const v=await versions(p); console.log(tag,'versions',v);
  await shot(p,`${OUT}/${tag}-b-panel.png`);
  if(v>=2){
    await p.getByLabel('Previous version').click(); if(v>=3)await p.getByLabel('Previous version').click();
    await p.locator('[data-testid="file-history-compare"]').click();
    await p.locator('[data-testid="file-history-diff"]').waitFor({state:'visible',timeout:5000}).catch(()=>{});
    await shot(p,`${OUT}/${tag}-c-compare.png`);
    await p.locator('[data-testid="file-history-compare"]').click();
    await p.locator('[data-testid="file-history-play"]').click(); await p.waitForTimeout(500);
    await shot(p,`${OUT}/${tag}-d-playback.png`);
  }
  await p.getByLabel('Close file history').click().catch(()=>p.keyboard.press('Escape')); await p.waitForTimeout(400);
}
const {token,pid}=await seed(); console.log('project',pid);
const b=await chromium.launchPersistentContext(UDD,{viewport:{width:1440,height:900},deviceScaleFactor:2});
await b.addCookies([{name:'vc_session',value:token,url:APP,httpOnly:true,sameSite:'Lax'}]);
const p=b.pages()[0]??await b.newPage();
await p.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded',timeout:120000});
await noSplash(p,120000); await dismissTour(p); await openGreeting(p,1440);
// build history
for(let i=0;i<60;i++){const t=await p.locator('.view-lines').first().innerText().catch(()=>'');if(t.includes('seed_v1')){console.log('content @'+i*2+'s');break;}await p.waitForTimeout(2000);}
for(let a=0;a<8;a++){
  await p.locator('[data-testid="file-history-open"]').click().catch(()=>{});
  await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000}).catch(()=>{});
  const c=await versions(p); await p.getByLabel('Close file history').click().catch(()=>p.keyboard.press('Escape')); await p.waitForTimeout(400);
  console.log('build versions',c); if(c>=4)break;
  try{await p.locator('.view-lines').first().click({timeout:8000});await p.keyboard.press(MOD+'+A');await p.keyboard.press('Delete');await p.keyboard.type('export const MARKER = "v'+(a+2)+'_'+Math.random().toString(36).slice(2,6)+'";');await p.waitForTimeout(500);await p.keyboard.press(MOD+'+S');await p.waitForTimeout(3000);}catch(e){console.log('edit err',String(e).slice(0,60));}
}
// capture: per theme (cookie+reload once), per width (resize)
for(const theme of ['dark','light']){
  await b.addCookies([{name:'ecode_theme',value:theme,domain:'.e-code.ai',path:'/',sameSite:'Lax'}]);
  await p.reload({waitUntil:'domcontentloaded',timeout:120000});
  await noSplash(p,120000); await dismissTour(p);
  for(const {w,h,name} of WIDTHS){
    const tag=`${name}-${theme}`;
    await p.setViewportSize({width:w,height:h}); await p.waitForTimeout(800);
    try{ await openGreeting(p,w); const vv=await (async()=>{await p.locator('[data-testid="file-history-open"]').click().catch(()=>{});await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000}).catch(()=>{});const c=await versions(p);await p.getByLabel('Close file history').click().catch(()=>p.keyboard.press('Escape'));await p.waitForTimeout(300);return c;})();
      console.log(tag,'pre-check versions',vv);
      await dismissTour(p); await drive(p,tag); console.log('OK',tag);
    }catch(e){ console.log('FAIL',tag,String(e).slice(0,120)); await p.screenshot({path:`${OUT}/${tag}-FAIL.png`}).catch(()=>{}); }
  }
}
await b.close(); console.log('DONE');
