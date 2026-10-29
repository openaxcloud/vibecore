const { chromium, expect } = require(process.cwd() + '/node_modules/@playwright/test');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const result = [];
  try {
    for (const width of [1440, 768, 390]) {
      const p = await b.newPage({ viewport: { width, height: 900 } });
      await p.goto('http://127.0.0.1:18837/before.html?' + (width < 800 ? 'mobile' : ''));
      await p.locator('#row').focus();
      await p.keyboard.press('Shift+F10');
      await expect(p.getByRole('menu')).toHaveCount(0);
      await p.locator('.bolt-user-message-bubble').click({ button: 'right' });
      await expect(p.getByRole('menu')).toBeVisible();
      result.push({ width, shiftF10Opened: false, rightClickOpened: true });
      await p.close();
    }
    fs.writeFileSync('/tmp/vibecore-user-menu-evidence/before.json', JSON.stringify(result, null, 2));
    console.log(result);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
