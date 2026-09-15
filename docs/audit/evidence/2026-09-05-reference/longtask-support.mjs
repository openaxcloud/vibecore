import { webkit, chromium, devices } from '@playwright/test';
(async()=>{
  for(const [e,n,o] of [[webkit,'webkit-iphone',{...devices['iPhone 13']}],[chromium,'chromium',{}]]){
    const b=await e.launch(); const ctx=await b.newContext(o); const p=await ctx.newPage();
    await p.goto('about:blank');
    const r=await p.evaluate(()=>{
      const types = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
      let observed=false, err=null;
      try{ new PerformanceObserver(()=>{}).observe({entryTypes:['longtask']}); observed=true; }catch(e){ err=String(e.message).slice(0,60); }
      // témoin : provoquer une tâche longue de ~300 ms
      const t0=performance.now(); while(performance.now()-t0<300){}
      return { hasPO: !!window.PerformanceObserver, supported: types, longtaskSupported: types.includes('longtask'), observeOk: observed, err };
    });
    console.log(`  ${n}: PerformanceObserver=${r.hasPO}  'longtask' supporté=${r.longtaskSupported}  observe() accepté=${r.observeOk}${r.err?'  err='+r.err:''}`);
    console.log(`    types supportés: ${(r.supported||[]).join(', ').slice(0,120)}`);
    await b.close();
  }
})();
