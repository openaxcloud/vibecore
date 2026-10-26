const fs=require('node:fs');
const {createRequire}=require('node:module');
const requireRepo=createRequire(process.cwd()+'/package.json');
const {chromium}=requireRepo('@playwright/test');
const base=process.env.AUDIT_BASE||'http://127.0.0.1:10899';
const dir=__dirname;
const out={base,startedAt:new Date().toISOString(),route:'/account-inactivity',cases:[],interactions:[],errors:[],blockedMutations:[],blockedExternal:[],scope:'Anonymous public policy; no deletion/deactivation/authentication or mail sent.'};
const sizes=[[320,900],[390,844],[844,390],[820,1180],[1440,900]];
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
for(const language of ['fr','en'])for(const theme of ['light','dark']){
 const context=await browser.newContext();
 await context.addCookies([{name:'ecode_theme',value:theme,url:base}]);
 await context.route('**/*',route=>{const req=route.request();if(req.method()!=='GET'){out.blockedMutations.push({method:req.method(),url:req.url()});return route.abort();}if(new URL(req.url()).origin!==base){out.blockedExternal.push(req.url());return route.abort();}return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>out.errors.push({language,theme,error:e.message}));
 for(const [width,height]of sizes){
  await page.setViewportSize({width,height});await page.goto(base+'/account-inactivity?lang='+language,{waitUntil:'networkidle'});await page.getByTestId('heading-account-inactivity').waitFor();
  const geometry=await page.locator('main').evaluate(main=>({h1Count:main.querySelectorAll('h1').length,title:main.querySelector('h1')?.textContent,theme:document.documentElement.getAttribute('data-theme'),documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,fields:main.querySelectorAll('input,textarea,select,button').length,headings:[...main.querySelectorAll('h1,h2')].map(e=>({text:e.textContent,id:e.id,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,top:e.getBoundingClientRect().top})),overflows:[...main.querySelectorAll('h1,h2,p,a,strong')].flatMap(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.left < -1||r.right>innerWidth+1)?[{tag:e.tagName,text:e.textContent,left:r.left,right:r.right}]:[]}),links:[...main.querySelectorAll('a')].map(e=>({href:e.getAttribute('href'),text:e.textContent})),headerBottom:document.querySelector('header')?.getBoundingClientRect().bottom}));
  const record={language,theme,width,height,url:page.url(),...geometry};out.cases.push(record);
  await page.screenshot({path:dir+`/account-inactivity-${language}-${theme}-${width}.png`,fullPage:true});
  console.log(language,theme,width,'overflow',geometry.overflows.length,'h1',geometry.h1Count);
 }
 await page.setViewportSize({width:320,height:900});await page.goto(base+'/account-inactivity?lang='+language,{waitUntil:'networkidle'});
 const mail=page.locator('main a[href^="mailto:"]').first();await mail.focus();
 const initial=await mail.evaluate(e=>({focused:document.activeElement===e,href:e.getAttribute('href'),rect:e.getBoundingClientRect().toJSON()}));
 await page.setViewportSize({width:844,height:390});const landscape=await mail.evaluate(e=>({focused:document.activeElement===e,rect:e.getBoundingClientRect().toJSON()}));
 await page.setViewportSize({width:390,height:844});await page.keyboard.press('Escape');await page.keyboard.press('Tab');
 const afterTab=await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent,href:document.activeElement.getAttribute('href')}));
 const previous=page.url();await page.locator('header a[href="/"]').first().click();await page.waitForURL(u=>u.pathname==='/');await page.goBack({waitUntil:'networkidle'});await page.getByTestId('heading-account-inactivity').waitFor();
 out.interactions.push({language,theme,initial,landscape,afterTab,beforeBack:previous,afterBack:page.url(),cookies:(await context.cookies()).map(c=>c.name),note:'No text input exists; resize while focused, no pretend typing. Mailto never activated.'});
 await context.close();
}
}finally{await browser.close();out.finishedAt=new Date().toISOString();fs.writeFileSync(dir+'/receipt.json',JSON.stringify(out,null,2));}})().catch(e=>{console.error(e);process.exitCode=1;});
