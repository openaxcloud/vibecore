import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '/workspace/ui-database-form-20261101/node_modules/@playwright/test/index.mjs';
import pg from '/workspace/ui-database-form-20261101/node_modules/pg/lib/index.js';
const dir='/workspace/ui-pg-row-parser-20261101',web='http://127.0.0.1:5174';
const f=JSON.parse(await readFile('/workspace/ui-database-form-20261101/fixture-private.json','utf8'));
const u=new URL(f.dataUrl);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55441');
const schema=f.schemas[0];assert.match(schema,/^browser_a_[a-f0-9]+$/);
const table=process.env.REUSE_TABLE==='1'?JSON.parse(await readFile(`${dir}/grid-first-failure.json`,'utf8')).table:`browser_a_${randomUUID().replaceAll('-','')}`,q=s=>'"'+s.replaceAll('"','""')+'"';
if(process.env.REUSE_TABLE!=='1'){
const db=new pg.Client({connectionString:f.dataUrl});await db.connect();
await db.query(`CREATE TABLE ${q(schema)}.${q(table)} ("__proto__" text, "constructor" text, "prototype" text, amount numeric, flag boolean, payload jsonb, absent text)`);
await db.query(`INSERT INTO ${q(schema)}.${q(table)} VALUES ($1,$2,$3,$4,$5,$6,$7)`,['own proto','own constructor','own prototype','900719925474099312345.000001',false,JSON.stringify({synthetic:'own JSON'}),null]);
await db.end();
}
const receipt={table,scope:'Real local compiled web + API + PostgreSQL; one owned synthetic table, no production',cases:[],limitations:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const width of [390,768,1440]){
 const r={width,pass:false,errors:[],reads:[]};receipt.cases.push(r);
 const ctx=await browser.newContext({viewport:{width,height:width===390?844:1000}});
 await ctx.addCookies([{name:'vc_session',value:f.token,url:web,httpOnly:true,sameSite:'Lax'},{name:'vibecore-lang',value:'en',url:web}]);
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());return ![web,f.origin].includes(u.origin)||/\/ai\/|\/chat(?:\/|$)|\/agent(?:\/|$)|\/llm\//.test(u.pathname)?route.abort():route.continue();});await ctx.routeWebSocket('**/*',s=>s.close());
 const page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>r.errors.push(e.message));
 async function select(){await page.getByTestId('db-carte').first().click({timeout:60000});await page.getByRole('tab',{name:'My data',exact:true}).click();await page.getByTestId('studio-table').filter({hasText:table}).click();
 const grid=page.locator('table').filter({has:page.getByTestId('studio-entete').filter({hasText:'__proto__'})});await expect(grid.locator('tbody tr')).toHaveCount(1);
 const cells=grid.locator('tbody tr').first().locator('td');const expected=['own proto','own constructor','own prototype','900719925474099312345.000001','false',JSON.stringify({synthetic:'own JSON'}),'∅'];
 for(let i=0;i<expected.length;i++){await expect(cells.nth(i)).toHaveText(expected[i]);await cells.nth(i).scrollIntoViewIfNeeded();await expect(cells.nth(i)).toBeVisible();}
 r.reads.push(await cells.allTextContents());await cells.first().scrollIntoViewIfNeeded();return grid;}
 try{await page.goto(`${web}/projects/${f.projectId}/ide?panel=database&lang=en`,{waitUntil:'domcontentloaded',timeout:120000});await select();await page.screenshot({path:`${dir}/grid-${width}.jpg`,quality:55});await page.reload({waitUntil:'domcontentloaded'});await select();assert.deepEqual(r.errors,[]);r.reload=true;r.pass=true;}catch(e){r.failure=e.message;await page.screenshot({path:`${dir}/grid-${width}-failure.jpg`,quality:50}).catch(()=>{});}finally{await ctx.close();await writeFile(`${dir}/grid-receipt.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(r));}
 if(!r.pass)break;
}}finally{await browser.close();}
if(receipt.cases.length!==3||receipt.cases.some(r=>!r.pass))process.exitCode=1;
