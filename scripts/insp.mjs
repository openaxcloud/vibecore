import { chromium } from '@playwright/test';
const OUT='/private/tmp/claude-501/-Users-hb-dev-vibecore/52c7ea32-0da7-4ae2-94db-b564ececf263/scratchpad';
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:768,height:1024},deviceScaleFactor:2}); const p=await c.newPage();
p.on('console',m=>{if(m.type()==='error')console.log('[err]',m.text().slice(0,120));});
await p.goto('http://localhost:5179/dev/fh-monaco?theme=dark',{waitUntil:'domcontentloaded',timeout:60000});
await p.locator('[data-testid="file-history-open"]').waitFor({state:'visible',timeout:30000});
await p.locator('[data-testid="file-history-open"]').click();
await p.locator('[data-testid="file-history-panel"]').waitFor({timeout:8000});
await p.waitForTimeout(1500);
await p.screenshot({path:OUT+'/monaco-overlap.png'});
const info=await p.evaluate(()=>{
  const panel=document.querySelector('[data-testid="file-history-panel"]');
  const cs=getComputedStyle(panel);
  const header=panel.firstElementChild;
  const hcs=getComputedStyle(header);
  const monaco=document.querySelector('.monaco-editor');
  const mcs=monaco?getComputedStyle(monaco):null;
  // find any editor descendant with z-index or transform creating stacking above panel
  let highZ=[];
  document.querySelectorAll('.monaco-editor *').forEach(el=>{const s=getComputedStyle(el); if((s.zIndex!=='auto'&&+s.zIndex>=30)||s.position==='fixed'){highZ.push((el.className||'').toString().slice(0,40)+' z='+s.zIndex+' pos='+s.position);}});
  return {panelBg:cs.backgroundColor, panelZ:cs.zIndex, panelPos:cs.position, panelOpacity:cs.opacity, headerBg:hcs.backgroundColor, monacoZ:mcs?.zIndex, monacoPos:mcs?.position, monacoTransform:mcs?.transform?.slice(0,30), offsetParent:panel.offsetParent?.className?.toString().slice(0,50), highZ:highZ.slice(0,6)};
});
console.log(JSON.stringify(info,null,1));
await b.close();
