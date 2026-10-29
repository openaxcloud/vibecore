const { chromium, expect } = require(process.cwd() + '/node_modules/@playwright/test');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const result = [];
  try {
    for (const width of [390, 768]) {
      const p = await b.newPage({ viewport: { width, height: 900 }, hasTouch: true });
      await p.addInitScript(() => {
        window.trace = [];
        for (const type of [
          'pointerdown',
          'pointerup',
          'mousedown',
          'mouseup',
          'click',
          'contextmenu',
          'focusin',
          'scroll',
        ])
          document.addEventListener(
            type,
            (e) =>
              window.trace.push({
                type,
                target: e.target?.id || e.target?.className,
                active: document.activeElement?.id || document.activeElement?.className,
              }),
            true,
          );
      });
      await p.goto('http://127.0.0.1:18837/?mobile&long');
      const c = await p.context().newCDPSession(p);
      const row = await p.locator('#row').boundingBox();
      const point = { x: Math.round(row.x + row.width / 2), y: Math.round(row.y + 20) };
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await expect(p.getByRole('menu')).toBeVisible();
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      console.log(await p.evaluate(() => window.trace));
      await expect(p.getByRole('menu')).toBeFocused();
      const box = await p.getByRole('menu').boundingBox();
      await p.getByRole('menu').locator('button').tap();
      await expect(p.getByRole('menu')).toHaveCount(0);
      await expect(p.locator('#composer')).toBeFocused();
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await expect(p.getByRole('menu')).toBeVisible();
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.locator('main').evaluate((el) => (el.scrollTop = 100));
      await expect(p.getByRole('menu')).toHaveCount(0);
      result.push({ width, longPress: true, closedOnScroll: true, explicitActionTap: true, box });
      await p.close();
    }
    fs.writeFileSync('/tmp/vibecore-user-menu-evidence/touch.json', JSON.stringify(result, null, 2));
    console.log(result);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
