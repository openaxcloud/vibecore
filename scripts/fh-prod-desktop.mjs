import { chromium, request as pwRequest } from '@playwright/test';
import JSZip from 'jszip';
import { mkdirSync } from 'node:fs';
const APP = process.env.APP_BASE_URL ?? 'https://app.e-code.ai';
const API = process.env.API_BASE_URL ?? 'https://api.e-code.ai';
const OUT = process.env.FH_OUT;
mkdirSync(OUT, { recursive: true });
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const EDITS = [
  'export function greeting(name) {\n  return `Hello, ${name}!`;\n}\n',
  "export function greeting(name, punctuation = '!') {\n  return `Hello, ${name}${punctuation}`;\n}\n",
  "export function greeting(name, punctuation = '!') {\n  const trimmed = String(name).trim();\n  return `Hello, ${trimmed || 'friend'}${punctuation}`;\n}\n",
];
async function seed(api){
  const sfx=Date.now()+''+Math.random().toString(36).slice(2);
  const reg=await api.post(API+'/auth/register',{data:{email:'fh-'+sfx+'@e-code-proof.test',password:'Password123!',name:'FH',organizationName:'FH '+sfx}});
  const auth=JSON.parse(await reg.text());
  const cp=await api.post(API+'/orgs/'+auth.organization.id+'/projects',{headers:{authorization:'Bearer '+auth.token},data:{name:'FH live'}});
  const pid=(await cp.json()).project.id;
  const zip=new JSZip(); zip.file('src/greeting.ts','export function greeting(name) {\n  return \x27Hello \x27 + name;\n}\n');
  await api.post(API+'/projects/'+pid+'/files/import/zip',{headers:{authorization:'Bearer '+auth.token},data:{zipBase64:await zip.generateAsync({type:'base64'})}});
  return {auth,pid};
}
async function openGreeting(page){
  await page.getByText('greeting.ts',{exact:false}).first().waitFor({state:'visible',timeout:180000});
  await page.getByText('greeting.ts',{exact:false}).first().click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('vibecore:open-editor-file',{detail:{filePath:'src/greeting.ts'}})));
  await page.waitForTimeout(2500);
}
async function build(page){
  const ed=page.locator('.bolt-project-editor-adapter, [data-testid="responsive-code-editor"] textarea').first();
  await ed.waitFor({state:'visible',timeout:30000});
  for(const c of EDITS){
    await ed.click(); await page.keyboard.press(MOD+'+A'); await page.keyboard.press('Delete');
    await page.keyboard.insertText(c);
    const s=page.getByRole('button',{name:/^Save$/}).first();
    if(await s.count()) await s.click(); else await page.keyboard.press(MOD+'+S');
    await page.waitForTimeout(1500);
  }
}
async function setTheme(page,t){ await page.evaluate((th)=>{const r=document.documentElement;r.setAttribute('data-theme',th);r.classList.toggle('dark',th==='dark');r.classList.toggle('light',th==='light');},t); await page.waitForTimeout(300); }
async function drive(page,tag){
  const b=page.locator('[data-testid="file-history-open"]'); await b.waitFor({state:'visible',timeout:30000});
  await page.screenshot({path:`${OUT}/${tag}-a-button.png`});
  await b.click();
  await page.locator('[data-testid="file-history-panel"]').waitFor({state:'visible',timeout:8000});
  const meta=await page.locator('[data-testid="file-history-meta"]').innerText().catch(()=>'');
  console.log(tag,'meta:',meta.replace(/\n/g,' '));
  await page.screenshot({path:`${OUT}/${tag}-b-panel.png`});
  await page.getByLabel('Previous version').click(); await page.getByLabel('Previous version').click();
  await page.locator('[data-testid="file-history-compare"]').click();
  await page.locator('[data-testid="file-history-diff"]').waitFor({state:'visible',timeout:5000}).catch(()=>{});
  await page.screenshot({path:`${OUT}/${tag}-c-compare.png`});
  await page.locator('[data-testid="file-history-compare"]').click();
  await page.locator('[data-testid="file-history-play"]').click(); await page.waitForTimeout(500);
  await page.screenshot({path:`${OUT}/${tag}-d-playback.png`});
}
const api=await pwRequest.newContext({timeout:60000});
const {auth,pid}=await seed(api);
console.log('project',pid);
const browser=await chromium.launch();
for(const theme of ['light','dark']){
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.addCookies([{name:'vc_session',value:auth.token,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  await page.goto(APP+'/projects/'+pid+'/ide',{waitUntil:'domcontentloaded'});
  await openGreeting(page); await build(page);
  await setTheme(page,theme);
  try{ await drive(page,'desktop-1440-'+theme); console.log('OK desktop-1440-'+theme); }
  catch(e){ console.log('FAIL desktop-1440-'+theme, String(e).slice(0,120)); await page.screenshot({path:`${OUT}/desktop-1440-${theme}-FAIL.png`}).catch(()=>{}); }
  await ctx.close();
}
await browser.close(); await api.dispose(); console.log('DONE');
