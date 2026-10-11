/** Does /runtime/workspaces/:id/files?path=. return an EMPTY tree on a cold open?
 *  That decides whether loadRuntimeFiles "fails" or merely sees nothing yet. */
import { chromium } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const W=Number(process.env.WINDOW_MS||45000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage(); const T0=Date.now(); const trees=[]; const zips=[];
  page.on('response',async r=>{
    const u=r.url();
    if(/\/runtime\/workspaces\/[^/]+\/files\?/.test(u)){
      let n=null,len=null; try{ const t=await r.text(); len=t.length; const j=JSON.parse(t);
        const arr=Array.isArray(j)?j:(j.nodes||j.files||j.tree||[]); n=Array.isArray(arr)?arr.length:'?'; }catch{}
      trees.push({t:Date.now()-T0,status:r.status(),nodes:n,bodyLen:len});
    }
    if(u.includes('/export/zip')) zips.push({t:Date.now()-T0});
  });
  await page.goto(`${APP}/projects/${PROJECT}/ide?panel=overview`,{waitUntil:'domcontentloaded',timeout:60000});
  while(Date.now()-T0<W) await sleep(500);
  await b.close();
  console.log('--- runtime file-tree responses (nodes = entries at root) ---');
  trees.forEach(x=>console.log(`  ${x.t}ms status=${x.status} rootNodes=${x.nodes} bodyLen=${x.bodyLen}`));
  console.log('--- archive downloads, for correlation ---');
  zips.forEach(x=>console.log(`  ${x.t}ms export/zip`));
  const empty=trees.filter(x=>x.nodes===0).length;
  console.log(`\nVERDICT: ${trees.length} tree responses, ${empty} of them EMPTY (0 root entries), ${zips.length} archive downloads`);
})();
