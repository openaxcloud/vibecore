const { chromium } = require('/workspace/vibecore-ui-contract812/node_modules/@playwright/test');
const fs = require('fs');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const rows=[];
for(const width of [320,768,1180,1440]) {
const page=await browser.newPage({viewport:{width,height:757}});
const origin=process.env.ORIGIN||'http://127.0.0.1:18299';
await page.context().addCookies([{name:'vc_session',value:'synthetic-ui',url:origin},{name:'vibecore-lang',value:'en',url:origin}]);
await page.addInitScript(()=>{localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0})); window.__marks=[];window.__vibecoreStartupMark=(m)=>window.__marks.push(m);});
let release; const gate=new Promise(r=>release=r); let requested=false;
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.origin!==origin||!['GET','HEAD'].includes(req.method())) return route.fulfill({status:503,json:{error:'isolated fixture blocks external calls and mutations'}});
 if(url.pathname.endsWith('/ide-state')){requested=true;await gate;return route.fulfill({status:200,json:{ideState:{version:1,state:{updatedAt:Date.now(),ui:{mobilePanel:'preview'}}}}});}
 return route.continue();
});
await page.context().routeWebSocket('**/*',s=>s.close());
await page.goto(origin+'/projects/synthetic-first/ide',{waitUntil:'domcontentloaded'});
await page.waitForSelector('.bolt-responsive-ide');
await page.waitForFunction(()=>Boolean(document.querySelector('[data-testid="ide-agent-panel"]')));
const read=()=>page.evaluate(()=>({panel:document.querySelector('.bolt-responsive-ide')?.getAttribute('data-mobile-panel'),agentSelected:document.querySelector('[data-testid="mobile-bottom-navigation"] [data-testid="tab-agent"]')?.getAttribute('aria-pressed'),agentVisible:(()=>{const e=document.querySelector('[data-testid="ide-agent-panel"]');return e&&getComputedStyle(e).display!=='none'})(),marks:window.__marks}));
const before=await read();release();
await page.waitForFunction(()=>window.__marks.includes('layout-restored'));
await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const after=await read();
await page.screenshot({path:'/workspace/ui-initial-panel-evidence/'+(process.env.PHASE||'before')+'-'+width+'.png'});
rows.push({width,requested,before,after});await page.close();
}
fs.writeFileSync('/workspace/ui-initial-panel-evidence/'+(process.env.PHASE||'before')+'.json',JSON.stringify(rows,null,2));await browser.close();console.log(JSON.stringify(rows));
})().catch(e=>{console.error(e);process.exitCode=1});
