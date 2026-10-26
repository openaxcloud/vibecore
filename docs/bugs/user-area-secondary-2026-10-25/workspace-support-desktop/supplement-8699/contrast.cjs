const {chromium,expect}=require('@playwright/test');const fs=require('fs');const base=process.env.UI_BASE_URL,out=process.env.UI_EVIDENCE_DIR||'/tmp/ui-remaining-contrast';
(async()=>{
 if(!base||!/^http:\/\/127\.0\.0\.1:/.test(base))throw Error('Explicit local UI_BASE_URL required');fs.mkdirSync(out+'/captures',{recursive:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const receipt={base,language:'fr',synthetic:true,observations:[],errors:[],blocked:[]};
 for(const theme of ['light','dark'])for(const variant of ['support','workspace-settings','desktop-settings','desktop-ready']){
  const c=await browser.newContext({viewport:{width:320,height:900}});await c.addCookies([{name:'vc_session',value:'synthetic-ui-fixture',url:base},{name:'ecode_theme',value:theme,url:base}]);
  await c.addInitScript(()=>localStorage.setItem('ecode:user-area-tour:v1',JSON.stringify({version:1,status:'dismissed',step:0})));
  if(variant==='desktop-ready')await c.addInitScript(()=>{window.vibecoreDesktop={settings:{get:async()=>({proxy:{mode:'manual',server:'https://synthetic-proxy.example.test'},trayEnabled:false,devicePolicy:{managed:true,source:'synthetic'}}),set:async()=>{throw Error('Synthetic writes blocked')}},auth:{get:async()=>({encryptionAvailable:false})}}});
  await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||r.request().method()!=='GET'){receipt.blocked.push({url:u.href,method:r.request().method()});return r.abort()}return r.continue()});
  const p=await c.newPage();p.on('pageerror',e=>receipt.errors.push(e.message));await p.goto(base+'/'+(variant==='desktop-ready'?'desktop-settings':variant)+'?lang=fr',{waitUntil:'networkidle'});await expect(p.locator('html')).toHaveAttribute('data-theme',theme);
  for(const width of [320,1440]){
   await p.setViewportSize({width,height:900});const contrast=await p.locator('main').last().evaluate(root=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
    const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
    const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const results=[...root.querySelectorAll('*')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&e.getBoundingClientRect().width>1&&e.getBoundingClientRect().height>1&&getComputedStyle(e).visibility==='visible'&&!e.closest('[disabled],[aria-disabled="true"],[aria-hidden="true"]')).map(e=>{
     const st=getComputedStyle(e);const chain=[];for(let n=e;n;n=n.parentElement)chain.push(n);let bg=[255,255,255,255],complex=false;
     for(const n of chain.reverse()){const s=getComputedStyle(n);if(s.backgroundImage!=='none'||Number(s.opacity)<1)complex=true;const c=rgb(s.backgroundColor),a=c[3]/255;bg=bg.map((v,i)=>i<3?c[i]*a+v*(1-a):255)}
     const fg=rgb(st.color),a=fg[3]/255,actual=fg.map((v,i)=>i<3?v*a+bg[i]*(1-a):255);const ratio=(Math.max(lum(actual),lum(bg))+.05)/(Math.min(lum(actual),lum(bg))+.05);const large=parseFloat(st.fontSize)>=24||parseFloat(st.fontSize)>=18.6667&&Number(st.fontWeight)>=700;
     return{tag:e.tagName,href:e.getAttribute('href'),text:e.textContent.trim().slice(0,130),className:e.className,color:st.color,bg,ratio,font:st.fontSize,weight:st.fontWeight,threshold:large?3:4.5,complex};
    });const eligible=results.filter(x=>!x.complex);return{count:eligible.length,excludedComplex:results.length-eligible.length,min:Math.min(...eligible.map(x=>x.ratio)),failures:eligible.filter(x=>x.ratio<x.threshold),modelSettingsLink:eligible.find(x=>x.href?.includes('settings')&&x.text.includes('modèles'))??null};
   });receipt.observations.push({variant,theme,width,contrast});if(variant==='workspace-settings')await p.screenshot({path:out+`/captures/workspace-${theme}-${width}.png`,fullPage:true});
  }await c.close();
 }
 await browser.close();fs.writeFileSync(out+'/contrast.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
