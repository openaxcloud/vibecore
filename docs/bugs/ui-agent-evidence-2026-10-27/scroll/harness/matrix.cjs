const { chromium } = require(require('node:path').join(process.cwd(), 'node_modules/@playwright/test'));
const fs = require('fs');
const outDir = process.env.UI_SCROLL_RECEIPT_DIR || '/tmp/ui-scroll-receipt';
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  let b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  let p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('http://127.0.0.1:20399');
  await p.waitForFunction(() => window.hook?.state.scrollTop > 2000);
  await p.waitForTimeout(500);
  const read = () =>
    p.evaluate(() => ({
      top: document.getElementById('scroll').scrollTop,
      h: document.getElementById('scroll').scrollHeight,
      view: document.getElementById('scroll').clientHeight,
      pill: !!document.querySelector('#pill'),
      bottom: hook.state.isAtBottom,
      escaped: hook.state.escapedFromLock,
    }));
  let results = [];
  for (const width of [390, 768, 1024, 1440])
    for (const mode of ['normal', 'resize-immediate', 'native-resize']) {
      await p.setViewportSize({ width, height: 844 });
      await p.reload();
      await p.waitForFunction(() => window.hook?.state.scrollTop > 2000);
      await p.waitForTimeout(500);
      let before = await read();
      await p.evaluate((mode) => {
        const el = document.getElementById('scroll');
        el.scrollTop = 0;
        if (mode !== 'native-resize') el.dispatchEvent(new Event('scroll'));
        if (mode !== 'normal') {
          el.style.height = '350px';
          document.getElementById('content').style.paddingBottom = '80px';
        }
      }, mode);
      let immediate = await read();
      await p.waitForTimeout(1200);
      let after = await read();
      await p.screenshot({
        path: `${outDir}/${width}-${mode}.png`,
      });
      if (after.top !== 0 || !after.pill) throw new Error(JSON.stringify({ width, mode, after }));
      await p.locator('#pill').click();
      await p.waitForFunction(() => !document.querySelector('#pill'));
      await p.waitForFunction(
        () => {
          const e = document.getElementById('scroll');
          return e.scrollTop >= e.scrollHeight - e.clientHeight - 2;
        },
        {},
        { timeout: 5000 },
      );
      const returned = await read();
      if (returned.top < returned.h - returned.view - 2) throw new Error('Return did not reach bottom');
      results.push({ width, mode, before, immediate, after, returned });
    }
  fs.writeFileSync(require('node:path').join(outDir, 'after-matrix.json'), JSON.stringify(results, null, 2));
  console.log(results);
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
