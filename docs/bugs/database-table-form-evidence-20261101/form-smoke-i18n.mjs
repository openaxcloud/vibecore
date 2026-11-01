/** Compiled UI smoke only. Real local API reads, no table submissions. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const dir='/workspace/ui-database-form-20261101',web='http://127.0.0.1:5174';
const fixture=JSON.parse(await readFile(`${dir}/fixture-private.json`,'utf8'));
assert.equal(fixture.origin,'http://127.0.0.1:8787');
const out=`${dir}/smoke-i18n-${Date.now()}`;await mkdir(out);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const rows=[];
const formats=[{width:320,height:568},{width:820,height:1180},{width:1180,height:820},{width:844,height:390}];
try{for(const locale of ['en','fr'])for(const theme of ['light','dark'])for(const format of formats){
 const row={...format,locale,theme,pass:false,errors:[],blockedMutations:0};
 const context=await browser.newContext({viewport:format});
 await context.addCookies([{name:'vc_session',value:fixture.token,url:web,httpOnly:true,sameSite:'Lax'},{name:'vibecore-lang',value:locale,url:web},{name:'ecode_theme',value:theme,url:web}]);
 await context.addInitScript(({theme})=>{localStorage.setItem('bolt_theme',theme);localStorage.setItem('ecode_theme',theme);localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0}));},{theme});
 await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(![web,fixture.origin].includes(url.origin)||/\/ai\/|\/chat(?:\/|$)|\/agent(?:\/|$)|\/llm\//.test(url.pathname))return route.abort();if(!['GET','HEAD'].includes(req.method())){row.blockedMutations++;return route.abort();}return route.continue();});
 await context.routeWebSocket('**/*',s=>s.close());
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>row.errors.push(e.message));
 const fr=locale==='fr',name=fr?'Nom de la table':'Table name',column=fr?'Nom de la colonne':'Column name',add=fr?'Ajouter une colonne':'Add column',cancel=fr?'Annuler':'Cancel',create=fr?'Créer la table':'Create table';
 try{
 await page.goto(`${web}/projects/${fixture.projectId}/ide?panel=database&lang=${locale}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.getByTestId('db-carte').first().click({timeout:45000});
 await page.getByRole('tab',{name:fr?'Mes données':'My data',exact:true}).click();
 await page.getByTestId('studio-create-table').click();
 const form=page.locator('form').filter({has:page.getByLabel(name,{exact:true})});
 await page.getByLabel(name,{exact:true}).fill('draft_unsubmitted');
 await page.getByRole('button',{name:add,exact:true}).click();
 await page.getByLabel(name,{exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByLabel(column,{exact:true})).toBeFocused();await page.keyboard.type('long_field_label');await page.keyboard.press('Tab');await expect(page.getByLabel('Type',{exact:true})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(page.getByLabel('Type',{exact:true})).toHaveValue('integer');
 row.themeActual=await page.evaluate(()=>({theme:document.documentElement.getAttribute('data-theme'),className:document.documentElement.className}));
 assert.equal(row.themeActual.theme,theme,'requested theme applied');
 row.bounds=await form.evaluate(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.ok(!row.bounds.overflow&&row.bounds.left>=-1&&row.bounds.right<=row.bounds.width+1,'horizontal overflow');
 for(const label of [create,cancel]){const button=page.getByRole('button',{name:label,exact:true});await button.scrollIntoViewIfNeeded();const bounds=await button.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=format.width+1&&bounds.y>=0&&bounds.y+bounds.height<=format.height,'action clipped');await expect(button).toBeVisible();}
 if(format.width===320||format.height===390)await page.screenshot({path:`${out}/${locale}-${theme}-${format.width}.jpg`,quality:45});
 await page.setViewportSize({width:format.width===320?1180:320,height:820});await expect(page.getByLabel(name,{exact:true})).toHaveValue('draft_unsubmitted');await expect(page.getByLabel(column,{exact:true})).toHaveValue('long_field_label');row.resizeDraftPreserved=true;
 await page.getByRole('button',{name:cancel,exact:true}).click();await expect(page.getByLabel(name,{exact:true})).toHaveCount(0);row.pass=true;
 }catch(e){row.failure=e.message;}finally{await context.close();rows.push(row);await writeFile(`${out}/receipt.json`,JSON.stringify(rows,null,2));console.log(JSON.stringify({locale,theme,...format,pass:row.pass,failure:row.failure}));}
}}finally{await browser.close();}
if(rows.some(r=>!r.pass))process.exitCode=1;
console.log(`Receipt: ${out}/receipt.json`);
