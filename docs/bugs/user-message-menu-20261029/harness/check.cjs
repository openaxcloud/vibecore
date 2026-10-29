const { chromium, expect } = require(process.cwd() + '/node_modules/@playwright/test');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const results = [];
  try {
    for (const width of [1440, 768, 390])
      for (const long of [false, true])
        for (const array of [false, true]) {
          console.log('CASE', width, long);
          const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 800 });
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.route('**/*', (r) =>
            r.request().url().startsWith('http://127.0.0.1:18837') ? r.continue() : r.abort(),
          );
          await page.goto(
            'http://127.0.0.1:18837/?' +
              (width < 800 ? 'mobile&' : '') +
              (long ? 'long&' : '') +
              (array ? 'array' : ''),
          );
          const row = page.locator('#row');
          await row.focus();
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          await page.keyboard.press('Shift+F10');
          const menu = page.getByRole('menu');
          await expect(menu).toBeVisible();
          const box = await menu.boundingBox();
          await page.screenshot({
            path: `/tmp/vibecore-user-menu-evidence/${width}-${long ? 'long' : 'short'}-menu.png`,
          });
          if (box.x < 0 || box.y < 0 || box.x + box.width > width + 1 || box.y + box.height > 900)
            throw Error('Menu outside viewport ' + JSON.stringify(box));
          await page.keyboard.press('ArrowDown');
          await expect(menu.locator('button').first()).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(menu).toHaveCount(0);
          await expect(row).toBeFocused();
          await page.keyboard.press('Shift+F10');
          await menu.locator('button').first().click();
          await expect(menu).toHaveCount(0);
          console.log(
            await page.evaluate(() => ({
              active: document.activeElement?.outerHTML,
              composer: document.getElementById('composer').getBoundingClientRect().toJSON(),
              display: getComputedStyle(document.getElementById('composer')).display,
            })),
          );
          await expect(page.locator('#composer')).toBeFocused();
          await row.focus();
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          await page.keyboard.press('Shift+F10');
          await page.keyboard.press('Tab');
          await expect(menu).toHaveCount(0);
          await row.focus();
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          await page.keyboard.press('Shift+F10');
          await page.locator('#project').click();
          await expect(menu).toHaveCount(0);
          await expect(page.locator('#project')).toBeFocused();
          await page.screenshot({ path: `/tmp/vibecore-user-menu-evidence/${width}-${long ? 'long' : 'short'}.png` });
          if (errors.length) throw Error(errors.join('\n'));
          results.push({ width, long, array, box, errors });
          await page.close();
        }
    fs.writeFileSync('/tmp/vibecore-user-menu-evidence/receipt.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
