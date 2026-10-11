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

  const m = await page.evaluate(() => {
    const px = v => Math.round(parseFloat(v)*10)/10;
    const leafText = root => { const o=[]; root.querySelectorAll('*').forEach(el=>{
      const t=(el.textContent||'').trim(); if(!t||el.children.length) return;
      const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden') return;
      const r=el.getBoundingClientRect(); if(r.width<=0) return;
      o.push({t:t.slice(0,28), fs:px(cs.fontSize), fw:cs.fontWeight, x:Math.round(r.x), w:Math.round(r.width)}); }); return o; };

    const out={};
    // --- item 2: header sizes
    const hdr=document.querySelector('.bolt-mobile-ecode-header');
    out.header = hdr ? leafText(hdr) : null;

    // --- item 2b: the whole scale in the agent panel
    const panel=document.querySelector('.bolt-project-agent-panel');
    const tally={};
    if(panel) panel.querySelectorAll('*').forEach(el=>{
      const t=(el.textContent||'').trim(); if(!t||el.children.length) return;
      const cs=getComputedStyle(el); if(cs.display==='none') return;
      const k=px(cs.fontSize); tally[k]=(tally[k]||0)+1; });
    out.scale = Object.entries(tally).map(([k,v])=>[Number(k),v]).sort((a,b)=>a[0]-b[0]);

    // --- item 4: the context bar
    const cb=document.querySelector('.bolt-mobile-agent-context-bar');
    if(cb){ const r=cb.getBoundingClientRect(); const cs=getComputedStyle(cb);
      out.contextBar={ x:Math.round(r.x), w:Math.round(r.width), viewport:innerWidth,
        clippedLeft: r.x < 0, scrollLeft: cb.scrollLeft, scrollW: cb.scrollWidth, clientW: cb.clientWidth,
        overflowX: cs.overflowX, paddingLeft: cs.paddingLeft,
        children: leafText(cb).slice(0,6) };
    } else out.contextBar=null;

    // --- item 5: the permanent action bar + pencil
    const foot=document.querySelector('.bolt-assistant-message-footer');
    if(foot){ const r=foot.getBoundingClientRect();
      out.actionFooter={ h:Math.round(r.height), buttons:foot.querySelectorAll('.bolt-assistant-message-action').length,
        display:getComputedStyle(foot).display }; }
    const pencil=document.querySelector('.bolt-user-message-edit');
    if(pencil){ const r=pencil.getBoundingClientRect();
      out.pencil={ h:Math.round(r.height), w:Math.round(r.width), visible:r.width>0 }; }

    // --- item 6: density
    const rows=[...document.querySelectorAll('.bolt-chat-message-row')];
    const asst=rows.filter(el=>el.classList.contains('bolt-chat-message-row-assistant'));
    const user=rows.filter(el=>el.classList.contains('bolt-chat-message-row-user'));
    const hh=els=>els.map(el=>Math.round(el.getBoundingClientRect().height));
    out.density={ assistantHeights:hh(asst), userHeights:hh(user),
      firstAssistant: asst[0] ? (()=>{ const cs=getComputedStyle(asst[0]);
        return {pt:cs.paddingTop,pb:cs.paddingBottom,mt:cs.marginTop,gap:cs.rowGap,lh:cs.lineHeight,fs:cs.fontSize}; })() : null };
    return out;
  });
  console.log(JSON.stringify(m,null,1));

  // --- item 1: scroll up and look for the pill
  const pill = await page.evaluate(async () => {
    const sc=document.querySelector('.bolt-project-agent-scroll')||document.querySelector('.bolt-project-agent-transcript');
    if(!sc) return {found:false, why:'no scroller'};
    const before=sc.scrollTop;
    sc.scrollTop = 0;
    sc.dispatchEvent(new Event('scroll',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1500));
    const p=document.querySelector('.bolt-agent-scroll-to-bottom');
    if(!p) return {found:false, why:'pill absent after scrolling to top', before, after:sc.scrollTop, sh:sc.scrollHeight, ch:sc.clientHeight};
    const cs=getComputedStyle(p); const r=p.getBoundingClientRect();
    return {found:true, position:cs.position, bottom:cs.bottom, mis:cs.marginInlineStart, mie:cs.marginInlineEnd,
      rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}, vh:innerHeight, vw:innerWidth};
  });
  console.log('PILL: '+JSON.stringify(pill));
  await page.screenshot({ path: `${SHOT}/agent-scrolled-iphone.png` });
  await b.close();
})();
