import pw from '/Users/hb/dev/vibecore-gallery-apps/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch();
for (const vp of [{width:1440,height:900,name:'desktop'},{width:834,height:1112,name:'tablet'},{width:390,height:844,name:'mobile'}]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto('http://127.0.0.1:44140/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const boxes = await page.evaluate(() => {
    const g = (sel) => { const el = document.querySelector(sel); if(!el) return null; const r = el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),bottom:Math.round(r.bottom)}; };
    const btn = document.querySelectorAll('.artifact-switch__btn')[1];
    const br = btn.getBoundingClientRect();
    // what element is at the button's center?
    const cx = br.x + br.width/2, cy = br.y + br.height/2;
    const top = document.elementFromPoint(cx, cy);
    return {
      appBar: g('.app-bar'), appBody: g('.app-body'), stage: g('.deck__stage'),
      switchBtn: {x:Math.round(br.x),y:Math.round(br.y),w:Math.round(br.width),h:Math.round(br.height)},
      elementAtBtnCenter: top ? (top.className || top.tagName) : null,
      bodyOverflow: getComputedStyle(document.querySelector('.app')).overflow,
      appHeight: Math.round(document.querySelector('.app').getBoundingClientRect().height),
    };
  });
  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);
  console.log(JSON.stringify(boxes, null, 2));
  await page.close();
}
await browser.close();
