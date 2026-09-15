import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
import { mkdirSync, rmSync } from 'node:fs';
const APP='https://app.e-code.ai', API='https://api.e-code.ai';
const OUT=process.env.FH_OUT, UDD=process.env.FH_UDD;
mkdirSync(OUT,{recursive:true}); try{rmSync(UDD,{recursive:true,force:true});}catch{}
const MOD=process.platform==='darwin'?'Meta':'Control';
async function seed(){const api=await pwRequest.newContext({timeout:60000});const sfx=Date.now()+''+Math.random().toString(36).slice(2);const reg=await api.post(API+'/auth/register',{data:{email:'fhm-'+sfx+'@e-code-proof.test',password:'Password123!',name:'F',organizationName:'F '+sfx}});const auth=JSON.parse(await reg.text());const cp=await api.post(API+'/orgs/'+auth.organization.id+'/projects',{headers:{authorization:'Bearer '+auth.token},data:{name:'FHm'}});const pid=(await cp.json()).project.id;const zip=new JSZip();zip.file('src/greeting.ts','export const MARKER = "seed_v1";\n');await api.post(API+'/projects/'+pid+'/files/import/zip',{headers:{authorization:'Bearer '+auth.token},data:{zipBase64:await zip.generateAsync({type:'base64'})}});await api.dispose();return{token:auth.token,pid};}
async function splash(p){return (await p.getByText('Loading E-Code',{exact:false}).count())>0;}
async function noSplash(p,t=90000){for(let i=0;i<t/1000;i++){if(!(await splash(p)))return;await p.waitForTimeout(1000);}}
async function shot(p,path){for(let i=0;i<5;i++){await noSplash(p,30000);await p.waitForTimeout(600);if(!(await splash(p))){await p.screenshot({path});return;}}await p.screenshot({path});}
async function tour(p){for(const t of ['Skip tour','Skip','Got it','Dismiss']){const el=p.getByRole('button',{name:new RegExp('^'+t+'$','i')}).first();if(await el.count()){await el.click().catch(()=>{});await p.waitForTimeout(400);}}}
async function versions(p){const m=(await p.locator('[data-testid="file-history-meta"]').innerText().catch(()=>'')).match(/Version\s+\d+\s*\/\s*(\d+)/);return m?+m[1]:0;}
async function launch(w,h,token,theme){const ctx=await chromium.launchPersistentContext(UDD,{viewport:{width:w,height:h},deviceScaleFactor:3});const ck=[{name:'vc_session',value:token,url:APP,httpOnly:true,sameSite:'Lax'}];if(theme)ck.push({name:'ecode_theme',value:theme,domain:'.e-code.ai',path:'/',sameSite:'Lax'});await ctx.addCookies(ck);return{ctx,page:ctx.pages()[0]??await ctx.newPage()};}
async function openG(p,w){
  if(w<=1199){await p.evaluate(()=>window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel',{detail:{panel:'files'}})));await p.waitForTimeout(1000);}
  const it=p.getByText('greeting.ts',{exact:false}).first(); await it.waitFor({state:'visible',timeout:150000}); await it.click();
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('vibecore:open-editor-file',{detail:{filePath:'src/greeting.ts'}})));
  if(w<=1199){await p.evaluate(()=>window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel',{detail:{panel:'editor'}})));await p.waitForTimeout(1000);}
  await p.waitForTimeout(2500);
}
async function build(p){
  await p.getByText('greeting.ts',{exact:false}).first().waitFor({state:'visible',timeout:150000});
  await p.getByText('greeting.ts',{exact:false}).first().click(); await p.waitForTimeout(1500);
  for(let i=0;i<60;i++){const t=await p.locator('.view-lines').first().innerText().catch(()=>'');if(t.includes('seed_v1')){console.log('content @'+i*2);break;}await p.waitForTimeout(2000);}
  for(let a=0;a<10;a++){
    await p.locator('[data-testid="file-history-open"]').click().catch(()=>{}); await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000}).catch(()=>{});
    const c=await versions(p); await p.getByLabel('Close file history').click().catch(()=>p.keyboard.press('Escape')); await p.waitForTimeout(400);
    console.log('build v',c); if(c>=4)return c;
    try{await p.locator('.view-lines').first().click({timeout:8000});await p.keyboard.press(MOD+'+A');await p.keyboard.press('Delete');await p.keyboard.type('export const MARKER = "v'+(a+2)+'_'+Math.random().toString(36).slice(2,6)+'";');await p.waitForTimeout(500);await p.keyboard.press(MOD+'+S');await p.waitForTimeout(3000);}catch(e){}
  }
  return versions(p);
}
let {token,pid}=await seed();
// robust build across projects
let built=0;
for(let pa=0;pa<3&&built<4;pa++){
  const {ctx,page}=await launch(1440,900,token,'dark');
  try{await page.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded',timeout:120000});await noSplash(page,120000);await tour(page);built=await build(page);console.log('built',built,'proj',pa);}catch(e){console.log('build err',String(e).slice(0,60));}
  await ctx.close();
  if(built<4&&pa<2){const s=await seed();token=s.token;pid=s.pid;console.log('reseed',pid);}
}
console.log('FINAL build',built);
// capture mobile 390 in both themes
for(const theme of ['dark','light']){
  const {ctx,page}=await launch(390,844,token,theme);
  try{
    await page.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded',timeout:120000});
    await noSplash(page,120000); await tour(page); await openG(page,390); await tour(page);
    const b=page.locator('[data-testid="file-history-open"]'); await b.waitFor({state:'visible',timeout:30000});
    await shot(page,`${OUT}/mobile-390-${theme}-a-button.png`);
    await b.click(); await page.locator('[data-testid="file-history-panel"]').waitFor({state:'visible',timeout:8000});
    await page.locator('[data-testid="file-history-slider"]').waitFor({state:'visible'});
    const v=await versions(page); console.log('mobile-390-'+theme,'versions',v);
    await shot(page,`${OUT}/mobile-390-${theme}-b-panel.png`);
    if(v>=2){await page.getByLabel('Previous version').click();if(v>=3)await page.getByLabel('Previous version').click();await page.locator('[data-testid="file-history-compare"]').click();await page.locator('[data-testid="file-history-diff"]').waitFor({state:'visible',timeout:5000}).catch(()=>{});await shot(page,`${OUT}/mobile-390-${theme}-c-compare.png`);await page.locator('[data-testid="file-history-compare"]').click();await page.locator('[data-testid="file-history-play"]').click();await page.waitForTimeout(500);await shot(page,`${OUT}/mobile-390-${theme}-d-playback.png`);}
    console.log('OK mobile-390-'+theme);
  }catch(e){console.log('FAIL mobile-390-'+theme,String(e).slice(0,120));await page.screenshot({path:`${OUT}/mobile-390-${theme}-FAIL.png`}).catch(()=>{});}
  await ctx.close();
}
console.log('DONE');
