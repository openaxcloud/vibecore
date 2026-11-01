import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const dir='/workspace/ui-database-form-20261101',web='http://127.0.0.1:5174';
const fixture=JSON.parse(await readFile(`${dir}/fixture-private.json`,'utf8'));
assert.equal(new URL(fixture.origin).origin,'http://127.0.0.1:8787');
const profile=await mkdtemp('/tmp/database-native-zoom-');
const context=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox'],viewport:{width:1440,height:1000}});
const report={nativeZoom:true,creationSubmitted:false,errors:[]};
try{
const settings=await context.newPage();await settings.goto('chrome://settings/appearance');await settings.locator('#zoomLevel').selectOption('2');await settings.close();
await context.route('**/*',route=>{const url=new URL(route.request().url());return [web,fixture.origin].includes(url.origin)&&! /\/ai\/|\/chat(?:\/|$)|\/agent(?:\/|$)|\/llm\//.test(url.pathname)?route.continue():route.abort();});
await context.routeWebSocket('**/*',s=>s.close());
await context.addCookies([{name:'vc_session',value:fixture.token,url:web,httpOnly:true,sameSite:'Lax'},{name:'vibecore-lang',value:'en',url:web}]);
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.setDefaultTimeout(20000);
await page.goto(`${web}/projects/${fixture.projectId}/ide?panel=database&lang=en`,{waitUntil:'domcontentloaded',timeout:120000});
await page.getByTestId('db-carte').first().click({timeout:90000});await page.getByRole('tab',{name:'My data',exact:true}).click();await page.getByTestId('studio-create-table').click();
report.metrics=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom}));assert.equal(report.metrics.width,720);assert.equal(report.metrics.cssZoom,'1');
await page.getByRole('button',{name:'Add column',exact:true}).click();await page.getByLabel('Table name',{exact:true}).focus();await page.keyboard.type('keyboard_draft');await page.keyboard.press('Tab');await expect(page.getByLabel('Column name',{exact:true})).toBeFocused();await page.keyboard.type('amount');await page.keyboard.press('Tab');await expect(page.getByLabel('Type',{exact:true})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(page.getByLabel('Type',{exact:true})).toHaveValue('integer');await page.keyboard.press('Tab');await expect(page.getByLabel('Required',{exact:true})).toBeFocused();await page.keyboard.press('Space');await expect(page.getByLabel('Required',{exact:true})).toBeChecked();
const form=page.locator('form').filter({has:page.getByLabel('Table name',{exact:true})});report.bounds=await form.evaluate(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1}});assert.ok(!report.bounds.overflow&&report.bounds.left>=-1&&report.bounds.right<=report.bounds.width+1);
await page.getByRole('button',{name:'Cancel',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/zoom200-keyboard.jpg`,quality:55}).catch(()=>{});
await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByLabel('Table name',{exact:true})).toHaveCount(0);report.pass=true;
}catch(e){report.pass=false;report.failure=e.message;process.exitCode=1;}finally{await writeFile(`${dir}/zoom-keyboard-receipt.json`,JSON.stringify(report,null,2));await context.close();await rm(profile,{recursive:true,force:true});console.log(JSON.stringify(report));}
