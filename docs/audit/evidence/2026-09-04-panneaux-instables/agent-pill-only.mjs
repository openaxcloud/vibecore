import { webkit, devices } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const SHOT=process.env.SHOT_DIR||'/tmp';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await webkit.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,...devices['iPhone 13']});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  await page.goto(`${APP}/projects/${PROJECT}/ide?panel=agent`,{waitUntil:'domcontentloaded',timeout:90000});
  await sleep(14000);
  const r = await page.evaluate(async () => {
    // pick the scroller BY MEASUREMENT, not by class name
    const cands=[...document.querySelectorAll('*')]
      .filter(el=>el.scrollHeight-el.clientHeight>100 && el.clientHeight>200)
      .sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
    if(!cands.length) return {ok:false, why:'no scrollable element'};
    const sc=cands[0];
    const info={cls:String(sc.className||'').slice(0,60), sh:sc.scrollHeight, ch:sc.clientHeight};
    sc.scrollTop=0; sc.dispatchEvent(new Event('scroll',{bubbles:true}));
    await new Promise(x=>setTimeout(x,2000));
    const p=document.querySelector('.bolt-agent-scroll-to-bottom');
    if(!p) return {ok:false, why:'pill still absent', info, after:sc.scrollTop};
    const cs=getComputedStyle(p); const rect=p.getBoundingClientRect();
    const out={ok:true, info, position:cs.position, bottom:cs.bottom,
      mis:cs.marginInlineStart, mie:cs.marginInlineEnd, z:cs.zIndex,
      rect:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)},
      vw:innerWidth, vh:innerHeight,
      vars:{ composer:getComputedStyle(document.documentElement).getPropertyValue('--vc-agent-composer-measured-height').trim(),
             nav:getComputedStyle(document.documentElement).getPropertyValue('--mobile-nav-height').trim() }};
    // caret probe under the pill + counter-witness
    const prev=p.style.pointerEvents; p.style.pointerEvents='none';
    const probe=(x0,y0,w,h)=>{let t=0,n=0;const s=[];
      for(let x=x0+2;x<x0+w-2;x+=4)for(let y=y0+2;y<y0+h-2;y+=4){t++;
        let node=null;
        if(document.caretRangeFromPoint){const rr=document.caretRangeFromPoint(x,y);node=rr&&rr.startContainer;}
        else if(document.caretPositionFromPoint){const q=document.caretPositionFromPoint(x,y);node=q&&q.offsetNode;}
        if(node&&node.nodeType===3&&(node.textContent||'').trim()){n++;if(s.length<2)s.push((node.textContent||'').trim().slice(0,44));}}
      return {t,n,pct:t?Math.round(100*n/t):0,s};};
    out.underPill=probe(rect.x,rect.y,rect.width,rect.height);
    out.counterWitness=probe(4,4,180,16);
    p.style.pointerEvents=prev;
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await page.screenshot({ path: `${SHOT}/agent-pill-scrolled.png` });
  await b.close();
})();
