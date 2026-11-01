/** Hold a real committed insertion response, navigate away, then release. No project B writes. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import pg from 'pg';
const dir='/workspace/ui-database-form-20261101',web='http://127.0.0.1:5174';const fixture=JSON.parse(await readFile(`${dir}/fixture-private.json`,'utf8'));
assert.ok(fixture.otherProjectId&&fixture.otherProjectId!==fixture.projectId);assert.equal(new URL(fixture.dataUrl).hostname,'127.0.0.1');assert.equal(new URL(fixture.dataUrl).port,'55441');
const schema=fixture.schemas[0];assert.match(schema,/^browser_a_[a-f0-9]+$/);const q=s=>'"'+s.replaceAll('"','""')+'"';const label=`late_${Date.now()}`;
const data=new pg.Client({connectionString:fixture.dataUrl});await data.connect();const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.setDefaultTimeout(15000);
const report={label,held:false,released:false,insertA:0,insertB:0,pass:false,errors:[]};let release,finish;const gate=new Promise(r=>release=r),finished=new Promise(r=>finish=r);
await context.addCookies([{name:'vc_session',value:fixture.token,url:web,httpOnly:true,sameSite:'Lax'},{name:'vibecore-lang',value:'en',url:web}]);
await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(![web,fixture.origin].includes(u.origin)||/\/ai\/|\/chat(?:\/|$)|\/agent(?:\/|$)|\/llm\//.test(u.pathname))return route.abort();
if(r.method()==='POST'&&/\/ide-panel\/database(?:\.data)?$/.test(u.pathname)&&new URLSearchParams(r.postData()||'').get('intent')==='insert-row'){
 if(u.pathname.includes(fixture.otherProjectId)){report.insertB++;return route.abort();}
 report.insertA++;const response=await route.fetch();report.held=true;await gate;try{await route.fulfill({response});report.released=true;}catch(e){report.deliveryCancelled=e.message;}finally{finish();}return;
}return route.continue();});await context.routeWebSocket('**/*',s=>s.close());page.on('pageerror',e=>report.errors.push(e.message));
try{
await page.goto(`${web}/projects/${fixture.projectId}/ide?panel=database&lang=en`,{waitUntil:'domcontentloaded',timeout:120000});await page.getByTestId('db-carte').first().click({timeout:60000});await page.getByRole('tab',{name:'My data',exact:true}).click();await page.getByTestId('studio-table').filter({hasText:'Row Modes'}).click();await page.getByRole('button',{name:'+ Insert row',exact:true}).click();
for(const [name,value]of Object.entries({label,qty:'7.01',at:'2026-11-01T12:34:56+02:00',['__proto__']:'late proto',constructor:'late constructor'}))await page.getByLabel(`Value — ${name}`,{exact:true}).fill(value);
await page.getByLabel('Value — flag',{exact:true}).selectOption('false');await page.getByRole('button',{name:'Insert row',exact:true}).click();await expect.poll(()=>report.held,{timeout:15000}).toBe(true);
assert.equal((await data.query(`SELECT count(*)::int AS n FROM ${q(schema)}."Row Modes" WHERE label=$1`,[label])).rows[0].n,1);report.commitBeforeNavigation=true;
await page.goto(`${web}/projects/${fixture.otherProjectId}/ide?panel=database&lang=en`,{waitUntil:'domcontentloaded',timeout:120000});await expect(page).toHaveURL(new RegExp(fixture.otherProjectId));
release();await finished;await expect(page.getByText('Row inserted.',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Value — label',{exact:true})).toHaveCount(0);assert.equal(report.insertA,1);assert.equal(report.insertB,0);report.pass=true;
}catch(e){report.failure=e.message;process.exitCode=1;}finally{release();await context.close();await browser.close();await data.end();await writeFile(`${dir}/row-navigation-${label}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
