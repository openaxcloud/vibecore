/** Local real browser -> BFF -> actual API -> native isolated PostgreSQL. No production. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import pg from 'pg';
const dir='/workspace/ui-database-form-20261101';
const fixture=JSON.parse(await readFile(`${dir}/fixture-private.json`,'utf8'));
const web='http://127.0.0.1:5174';
assert.equal(new URL(fixture.dataUrl).hostname,'127.0.0.1');
assert.equal(new URL(fixture.dataUrl).port,'55441');
assert.equal(new URL(fixture.origin).origin,'http://127.0.0.1:8787');
const schema=fixture.schemas[0];assert.match(schema,/^browser_a_[a-f0-9]+$/);
const q=x=>'"'+x.replaceAll('"','""')+'"';
const out=`${dir}/browser-${Date.now()}`;await mkdir(out);
let webkitAvailable=false;try{await access(webkit.executablePath());webkitAvailable=true;}catch{}
const data=new pg.Client({connectionString:fixture.dataUrl});await data.connect();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const report={backend:'Actual API with TestApiStore metadata; native PostgreSQL data',webkitInstalled:webkitAvailable,webkitExecuted:false,cases:[]};
async function studio(page){
 await page.goto(`${web}/projects/${fixture.projectId}/ide?panel=database&lang=en`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.getByTestId('db-carte').first().click({timeout:90000});
 await page.getByRole('tab',{name:'My data',exact:true}).click();
 await expect(page.getByTestId('studio-create-table')).toBeVisible({timeout:30000});
}
async function open(page,name){await page.getByTestId('studio-create-table').click();await page.getByLabel('Schema',{exact:true}).fill(schema);await page.getByLabel('Table name',{exact:true}).fill(name);}
async function columnsOf(name){return (await data.query('SELECT column_name,data_type,is_nullable,is_identity,identity_generation FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[schema,name])).rows;}
try{
for(const [width,height] of [[1440,1000],[768,1024],[390,844]]){
 const row={width,height,errors:[],blockedRequests:[],requests:0};report.cases.push(row);
 const context=await browser.newContext({viewport:{width,height}});await context.addCookies([{name:'vc_session',value:fixture.token,url:web,httpOnly:true,sameSite:'Lax'},{name:'vibecore-lang',value:'en',url:web}]);
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(![web,fixture.origin].includes(url.origin)||/\/ai\/|\/chat(?:\/|$)|\/agent(?:\/|$)|\/llm\//.test(url.pathname)){row.blockedRequests.push({path:url.pathname,method:route.request().method()});return route.abort();}return route.continue();});
 await context.routeWebSocket('**/*',socket=>socket.close());
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>row.errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&/\/ide-panel\/database(?:\.data)?$/.test(new URL(r.url()).pathname))row.requests++;});
 const name=`form_${width}_${Date.now()}`,cancelled=`cancel_${width}_${Date.now()}`;
 try{
 await studio(page);await open(page,name);
 await page.getByRole('button',{name:'Add column',exact:true}).click();
 await page.getByLabel('Column name',{exact:true}).fill('Display Name');
 await page.getByLabel('Type',{exact:true}).selectOption('text');
 await page.getByLabel('Required',{exact:true}).check();
 await page.getByLabel('Table name',{exact:true}).focus();await page.keyboard.press('Tab');
 row.keyboardFocus=await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.closest('label')?.textContent}));
 const form=page.locator('form').filter({has:page.getByLabel('Table name',{exact:true})});
 const bounds=await form.evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};});row.bounds=bounds;
 assert.ok(bounds.left>=-1&&bounds.right<=bounds.viewport+1&&!bounds.overflow,'form horizontal bounds');
 await page.screenshot({path:`${out}/${width}-form.jpg`,quality:55});
 await page.getByRole('button',{name:'Create table',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Table created.'})).toBeVisible();
 const cols=await columnsOf(name);assert.equal(cols.length,2);assert.deepEqual(cols.map(c=>[c.column_name,c.is_nullable,c.is_identity]),[['id','NO','YES'],['Display Name','NO','NO']]);assert.equal(cols[0].identity_generation,'ALWAYS');
 const pk=await data.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=$1::regclass AND i.indisprimary`,[`${q(schema)}.${q(name)}`]);assert.deepEqual(pk.rows,[{attname:'id'}]);
 const insertion=await data.query(`INSERT INTO ${q(schema)}.${q(name)} ("Display Name") VALUES ($1) RETURNING id`,['Synthetic created row']);assert.ok(insertion.rows[0].id);row.nativePostgresPrimaryKey=true;
 await page.getByRole('button',{name:'Close',exact:true}).click();await open(page,name);await page.getByRole('button',{name:'Create table',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('did not confirm');await expect(page.getByLabel('Table name',{exact:true})).toHaveValue(name);
 assert.equal((await data.query(`SELECT count(*)::int AS count FROM ${q(schema)}.${q(name)}`)).rows[0].count,1);row.duplicatePreservesDataAndDraft=true;
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await open(page,cancelled);await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await columnsOf(cancelled)).length,0);row.cancelDidNotCreate=true;
 await studio(page);await expect(page.getByTestId('studio-table').filter({hasText:name})).toBeVisible();row.reloadedSchemaPersists=true;
 await open(page,cancelled);await page.getByRole('button',{name:'Add column',exact:true}).click();await page.getByLabel('Column name',{exact:true}).fill('draft column');
 await page.setViewportSize({width:width===1440?390:1440,height:1000});
 try{await expect(page.getByLabel('Table name',{exact:true})).toHaveValue(cancelled,{timeout:5000});await expect(page.getByLabel('Column name',{exact:true})).toHaveValue('draft column',{timeout:5000});row.resizeDraftPreserved=true;}catch{row.resizeDraftPreserved=false;}
 row.functionalPass=true;
 }catch(e){row.failure=e.message;row.functionalPass=false;await page.screenshot({path:`${out}/${width}-failure.jpg`,quality:55}).catch(()=>{});}
 finally{await context.close();await writeFile(`${out}/receipt.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({width,pass:row.functionalPass,resizeDraftPreserved:row.resizeDraftPreserved,failure:row.failure}));}
}
}finally{await browser.close();await data.end();}
report.zoom200='Not executed; native browser zoom requires separate controlled recipe. No CSS zoom represented as native zoom.';
await writeFile(`${out}/receipt.json`,JSON.stringify(report,null,2));console.log(`Receipt: ${out}/receipt.json`);
if(report.cases.some(r=>!r.functionalPass||r.resizeDraftPreserved===false))process.exitCode=1;
