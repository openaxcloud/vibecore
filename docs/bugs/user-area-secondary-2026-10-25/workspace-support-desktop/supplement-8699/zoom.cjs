const {chromium,expect}=require('@playwright/test');
const fs=require('fs');
const base=process.env.UI_BASE_URL,out=process.env.UI_EVIDENCE_DIR||'/tmp/ui-remaining-zoom';
(async()=>{
 if(!base||!/^http:\/\/127\.0\.0\.1:/.test(base))throw Error('Explicit local UI_BASE_URL required');
 fs.mkdirSync(out+'/captures',{recursive:true});
 const result={base,synthetic:true,observations:[],errors:[],blocked:[]};
 for(const lang of ['fr','en'])for(const theme of ['light','dark']){
  const profile=fs.mkdtempSync('/tmp/ui-zoom-remaining-');fs.mkdirSync(profile+'/Default');
  fs.writeFileSync(profile+'/Default/Preferences',JSON.stringify({partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}}));
  const c=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,viewport:null,args:['--no-sandbox','--window-size=1280,800']});
  try{
   await c.addCookies([{name:'vc_session',value:'synthetic-ui-fixture',url:base},{name:'ecode_theme',value:theme,url:base}]);
   await c.addInitScript(()=>localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0})));
   await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||r.request().method()!=='GET'){result.blocked.push({url:u.href,method:r.request().method()});return r.abort()}return r.continue()});
   const p=await c.newPage();p.on('pageerror',e=>result.errors.push(e.message));
   for(const variant of ['support','workspace-settings','desktop-settings','desktop-ready']){
    if(variant==='desktop-ready')await c.addInitScript(()=>{window.vibecoreDesktop={settings:{get:async()=>({proxy:{mode:'manual',server:'https://'+'synthetic-long-proxy-'.repeat(15)+'.example.test'},trayEnabled:false,devicePolicy:{managed:true,source:'synthetic-ui-fixture'}}),set:async()=>{throw Error('Synthetic bridge rejects writes')}},auth:{get:async()=>({encryptionAvailable:false})}}});
    await p.goto(base+'/'+(variant==='desktop-ready'?'desktop-settings':variant)+'?lang='+lang,{waitUntil:'networkidle'});
    if(variant==='desktop-ready')await expect(p.locator('select')).toBeVisible();
    const m=await p.evaluate(variant=>{
     const scopes=[...document.querySelectorAll('main')],main=scopes.at(-1);
     const titles=[...main.querySelectorAll('h1,h2,h3')].filter(e=>e.getBoundingClientRect().width>1).map(e=>({text:e.textContent,client:e.clientWidth,scroll:e.scrollWidth}));
     const ticket=main.querySelector('a[href*="synthetic-ticket"]');
     const targets=[...main.querySelectorAll('button,select,input,label,a')].filter(e=>{
      if(variant==='workspace-settings')return e.getAttribute('aria-label')?.match(/taille de police|font size/)||e.matches('select,[role=radio]')||['Réinitialiser les paramètres de l’éditeur','Reset editor settings'].includes(e.textContent)||e.tagName==='LABEL'&&e.querySelector('input[type=checkbox]');
      if(variant==='support')return e.matches('button[type=submit],input[name=subject],select[name=category]');
      if(variant==='desktop-ready')return e.matches('button,select,input')&&!e.closest('header,nav');
      return e.matches('a[href="/desktop"]');
     }).filter(e=>{const r=e.getBoundingClientRect();return r.height&&r.width}).map(e=>({text:e.getAttribute('aria-label')||e.textContent?.slice(0,60),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));
     const input=variant==='desktop-ready'?main.querySelector('input'):null;
     return{innerWidth,outerWidth,dpr:devicePixelRatio,visualScale:visualViewport.scale,documentWidth:document.documentElement.scrollWidth,titles,targets,ticket:ticket?{client:ticket.clientWidth,scroll:ticket.scrollWidth}:null,proxyInput:input?{client:input.clientWidth,scroll:input.scrollWidth,valueLength:input.value.length}:null};
    },variant);
    result.observations.push({variant,lang,theme,...m});
    expect(m.innerWidth).toBe(640);expect(m.outerWidth).toBe(1280);expect(m.dpr).toBe(2);expect(m.visualScale).toBe(1);expect(m.documentWidth).toBeLessThanOrEqual(641);
    for(const t of m.titles)expect(t.scroll).toBeLessThanOrEqual(t.client+1);
    expect(m.targets.length).toBeGreaterThanOrEqual({'support':3,'workspace-settings':12,'desktop-settings':1,'desktop-ready':5}[variant]);for(const t of m.targets)expect(t.height).toBeGreaterThanOrEqual(44);
    if(m.ticket)expect(m.ticket.scroll).toBeLessThanOrEqual(m.ticket.client+1);
    const cdp=await c.newCDPSession(p);const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});fs.writeFileSync(`${out}/captures/${variant}-${lang}-${theme}-zoom200.png`,Buffer.from(shot.data,'base64'));
   }
  }finally{await c.close();fs.rmSync(profile,{recursive:true,force:true})}
 }
 fs.writeFileSync(out+'/zoom.json',JSON.stringify(result,null,2));console.log({observations:result.observations.length,errors:result.errors,mutations:result.blocked.filter(x=>x.method!=='GET')});
})().catch(e=>{console.error(e);process.exit(1)});
