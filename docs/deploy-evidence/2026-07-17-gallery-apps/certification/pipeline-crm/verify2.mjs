import pw from '/Users/hb/dev/vibecore-gallery-apps/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const { chromium } = pw;
const DIR = '/Users/hb/dev/vibecore-gallery-apps/.rebuild/dev-pipeline-crm/certification/pipeline-crm';
const URL = 'http://127.0.0.1:44170/';
const pe = [], ce = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on('pageerror', (e) => pe.push(String(e)));
page.on('console', (m) => { if (m.type()==='error') ce.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
// pristine reset
await page.locator('.reset-button').click();
await page.waitForTimeout(200);

// FORECAST on pristine seed
await page.locator('.nav-item', { hasText: 'Forecast' }).click();
await page.waitForTimeout(150);
const ft = await page.evaluate(() => [...document.querySelectorAll('.stat-grid.wide .stat')].map((s)=>[s.querySelector('.stat-label').textContent, s.querySelector('.stat-value').textContent]));
console.log('PRISTINE forecast totals', JSON.stringify(ft));
const qt = await page.evaluate(() => [...document.querySelectorAll('.table-panel tbody tr')].map((r)=>[...r.querySelectorAll('th,td')].map(c=>c.textContent)));
console.log('PRISTINE quarter table', JSON.stringify(qt));

// EDGE: Prospecting back button disabled, Closed Won/Lost forward disabled
await page.locator('.nav-item', { hasText: 'Pipeline' }).click();
await page.waitForTimeout(120);
const edge = await page.evaluate(() => {
  const out = {};
  for (const card of document.querySelectorAll('.deal-card')) {
    const stage = card.closest('.kanban-column').querySelector('.kanban-title').textContent;
    const back = card.querySelector('.deal-actions button:nth-child(1)').disabled;
    const fwd = card.querySelector('.deal-actions button:nth-child(2)').disabled;
    out[stage] = out[stage] || { back, fwd };
  }
  return out;
});
console.log('EDGE disabled by stage (first card each):', JSON.stringify(edge));

// EDGE: note button disabled when empty vs enabled with text
await page.locator('.nav-item', { hasText: 'Accounts' }).click();
await page.waitForTimeout(120);
const emptyDisabled = await page.locator('.note-form button[type=submit]').isDisabled();
await page.locator('#note-input').fill('x');
await page.waitForTimeout(50);
const filledDisabled = await page.locator('.note-form button[type=submit]').isDisabled();
await page.locator('#note-input').fill('   '); // whitespace only
await page.waitForTimeout(50);
const wsDisabled = await page.locator('.note-form button[type=submit]').isDisabled();
console.log('note button: empty disabled=', emptyDisabled, ' filled disabled=', filledDisabled, ' whitespace disabled=', wsDisabled);

// EDGE: sidebar skip-link + reset restored counts
const side = await page.evaluate(() => [...document.querySelectorAll('.sidebar-stats > div')].map(d=>[d.querySelector('dt').textContent,d.querySelector('dd').textContent]));
console.log('sidebar', JSON.stringify(side));

console.log('pageErrors', JSON.stringify(pe), 'consoleErrors', JSON.stringify(ce));
await browser.close();
