const {chromium}=require('/workspace/vibecore/node_modules/@playwright/test');
const fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
for(const variant of ['same-node-srcdoc-update','new-node-per-document','same-node-identical-srcdoc']){
 const page=await browser.newPage();
 await page.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated history fixture</title><main></main>'}));
 await page.goto('https://fixture.invalid/ide?panel=preview');
 await page.evaluate(()=>{window.events=[];window.snap=(event)=>events.push({event,url:location.pathname+location.search,length:history.length,idx:history.state?.idx??0});addEventListener('popstate',()=>snap('popstate'));history.replaceState({idx:0},'');snap('initial');});
 const load=async(replace,html)=>page.evaluate(async({replace,html})=>{
   let f=document.querySelector('iframe');
   if(!f||replace){f?.remove();f=document.createElement('iframe');f.sandbox='allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation';document.querySelector('main').append(f);}
   await new Promise(resolve=>{f.onload=resolve;f.srcdoc=html;});snap('frame-loaded');
 },{replace,html});
 await load(false,'<!doctype html><title>one</title><h1>one</h1>');
 await page.evaluate(()=>{history.pushState({idx:1},'','?panel=deployments');snap('deploy');});
 await load(variant==='new-node-per-document',variant==='same-node-identical-srcdoc'?'<!doctype html><title>one</title><h1>one</h1>':'<!doctype html><title>two</title><h1>two</h1>');
 await page.evaluate(()=>{history.pushState({idx:2},'','?panel=deployments');snap('cancel-preview');});
 await page.goBack({waitUntil:'domcontentloaded',timeout:1000}).catch(()=>{});await page.evaluate(()=>snap('after-back1'));
 await page.goBack({waitUntil:'domcontentloaded',timeout:1000}).catch(()=>{});await page.evaluate(()=>snap('after-back2'));
 results.push({variant,browser:browser.version(),events:await page.evaluate(()=>events),frames:page.frames().map(f=>f.url())});await page.close();
}
await browser.close();fs.writeFileSync('/tmp/cpu4-probe/iframe-history-proof.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})();
