/** Sur ORDINATEUR, la variable de hauteur du composeur est-elle ecrite ?
 *  Si non, `bottom: calc(var(--vc-agent-composer-measured-height, 0px) + 12px)`
 *  retombe silencieusement sur 12px. */
import { chromium } from '@playwright/test';
const APP=process.env.APP_BASE, TOKEN=process.env.QA_TOKEN, PROJECT=process.env.QA_PROJECT;
const SHOT=process.env.SHOT_DIR||'/tmp';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
  await ctx.addCookies([{name:'vc_session',value:TOKEN,url:APP,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();
  await page.goto(`${APP}/projects/${PROJECT}/ide?panel=agent`,{waitUntil:'domcontentloaded',timeout:90000});
  await sleep(15000);
  const r = await page.evaluate(async () => {
    const rootCs=getComputedStyle(document.documentElement);
    const out={ vars:{
      composer: rootCs.getPropertyValue('--vc-agent-composer-measured-height').trim() || '(UNSET)',
      nav: rootCs.getPropertyValue('--mobile-nav-height').trim() || '(unset)' } };
    const cands=[...document.querySelectorAll('*')]
      .filter(el=>el.scrollHeight-el.clientHeight>100 && el.clientHeight>200)
      .sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
    if(!cands.length){ out.scroller=null; return out; }
    const sc=cands[0]; out.scroller={cls:String(sc.className||'').slice(0,50), sh:sc.scrollHeight, ch:sc.clientHeight};
    sc.scrollTop=0; sc.dispatchEvent(new Event('scroll',{bubbles:true}));
    await new Promise(x=>setTimeout(x,2000));
    const p=document.querySelector('.bolt-agent-scroll-to-bottom');
    if(!p){ out.pill=null; out.why='pill absent'; return out; }
    const cs=getComputedStyle(p), rect=p.getBoundingClientRect();
    out.pill={ position:cs.position, bottom:cs.bottom, z:cs.zIndex,
      rect:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)},
      vh:innerHeight };
    // does the composer sit on top of it?
    const comp=document.querySelector('.bolt-project-agent-composer');
    if(comp){ const c=comp.getBoundingClientRect();
      out.composer={y:Math.round(c.y),h:Math.round(c.height)};
      out.pillOverlapsComposer = !(rect.bottom<=c.top || rect.top>=c.bottom);
      out.elementAtPillCentre = (document.elementFromPoint(rect.x+rect.width/2, rect.y+rect.height/2)||{}).className||null;
    }
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await page.screenshot({path:`${SHOT}/pill-desktop.png`});
  await b.close();
})();
