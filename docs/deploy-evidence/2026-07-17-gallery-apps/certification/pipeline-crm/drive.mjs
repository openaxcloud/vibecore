import pw from '/Users/hb/dev/vibecore-gallery-apps/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const { chromium } = pw;
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const URL = 'http://127.0.0.1:44170/';
const shot = (page, name) => page.screenshot({ path: path.join(DIR, name) });

const pageErrors = [];
const consoleErrors = [];
const log = [];
const L = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-gallery-app-id="pipeline-crm"]');

// Helper to read state from localStorage
const readLS = () => page.evaluate(() => JSON.parse(localStorage.getItem('pipeline-crm.state.v1') || 'null'));
// Helper: column head totals in kanban
const columnData = () => page.evaluate(() =>
  [...document.querySelectorAll('.kanban-column')].map((c) => ({
    stage: c.querySelector('.kanban-title')?.textContent,
    count: c.querySelector('.kanban-count')?.textContent,
    total: c.querySelector('.kanban-total')?.textContent,
  })));
const sidebarStats = () => page.evaluate(() =>
  [...document.querySelectorAll('.sidebar-stats > div')].map((d) => ({
    label: d.querySelector('dt')?.textContent, value: d.querySelector('dd')?.textContent })));

// ---------- 1. Initial pipeline ----------
L('== INITIAL PIPELINE ==');
L('sidebar', JSON.stringify(await sidebarStats()));
L('columns', JSON.stringify(await columnData()));
await shot(page, '01-pipeline-initial.png');

// ---------- 2. Move opportunity: advance "POS refresh" (Negotiation->Closed Won) ----------
L('== ADVANCE POS refresh (Negotiation -> Closed Won) ==');
// find the deal card for "POS refresh" and click its advance (→) button
const advancePOS = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.deal-card')];
  const card = cards.find((c) => c.querySelector('.deal-title')?.textContent?.includes('POS refresh'));
  if (!card) return 'card-not-found';
  const stage = card.closest('.kanban-column')?.querySelector('.kanban-title')?.textContent;
  return stage;
});
L('POS refresh currently in stage:', advancePOS);
// click advance button
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.deal-card')];
  const card = cards.find((c) => c.querySelector('.deal-title')?.textContent?.includes('POS refresh'));
  card.querySelector('.deal-actions button:nth-child(2)').click();
});
await page.waitForTimeout(150);
L('columns after advance', JSON.stringify(await columnData()));
L('sidebar after advance', JSON.stringify(await sidebarStats()));
const lsAfterMove = await readLS();
const posOpp = lsAfterMove.opportunities.find((o) => o.name === 'POS refresh');
L('POS refresh stage in LS:', posOpp.stage);
L('newest activity:', JSON.stringify(lsAfterMove.activities[0]));
await shot(page, '02-after-advance.png');

// move it back to restore
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.deal-card')];
  const card = cards.find((c) => c.querySelector('.deal-title')?.textContent?.includes('POS refresh'));
  card.querySelector('.deal-actions button:nth-child(1)').click();
});
await page.waitForTimeout(150);
const posBack = (await readLS()).opportunities.find((o) => o.name === 'POS refresh');
L('POS refresh stage after back:', posBack.stage);

// ---------- 3. Drag opportunity between stages ----------
L('== DRAG Warehouse rollout (Proposal -> Negotiation) ==');
const dragCard = page.locator('.deal-card', { hasText: 'Warehouse rollout' });
const negColumn = page.locator('.kanban-column', { hasText: 'Negotiation' }).first();
await dragCard.dragTo(negColumn);
await page.waitForTimeout(200);
let whStage = (await readLS()).opportunities.find((o) => o.name === 'Warehouse rollout').stage;
L('Warehouse rollout stage after drag:', whStage);
L('columns after drag', JSON.stringify(await columnData()));
await shot(page, '03-after-drag.png');
// restore via drag back to Proposal
const propColumn = page.locator('.kanban-column', { hasText: 'Proposal' }).first();
await page.locator('.deal-card', { hasText: 'Warehouse rollout' }).dragTo(propColumn);
await page.waitForTimeout(200);
whStage = (await readLS()).opportunities.find((o) => o.name === 'Warehouse rollout').stage;
L('Warehouse rollout stage after drag-back:', whStage);

// ---------- 4. Deal title -> opens Account ----------
L('== CLICK deal title (Fleet telemetry suite) -> Account 360 ==');
await page.locator('.deal-title', { hasText: 'Fleet telemetry suite' }).click();
await page.waitForTimeout(150);
const acc360Title = await page.locator('.account-360 h2').first().textContent();
L('Account 360 header:', acc360Title);
await shot(page, '04-account-from-deal.png');

// ---------- 5. Accounts view + add note ----------
L('== ACCOUNTS: select Northwind, add note ==');
await page.locator('.record-item', { hasText: 'Northwind Traders' }).click();
await page.waitForTimeout(120);
const noteText = 'Certification note ' + Date.now();
await page.locator('#note-input').fill(noteText);
await page.locator('.note-form button[type=submit]').click();
await page.waitForTimeout(150);
const timelineTop = await page.locator('.timeline-item .timeline-text').first().textContent();
L('timeline top after note:', timelineTop);
const noteInLS = (await readLS()).activities.find((a) => a.body === noteText);
L('note persisted in LS:', noteInLS ? 'YES kind=' + noteInLS.kind : 'NO');
// verify stat grid numbers for Northwind
const northwindStats = await page.evaluate(() =>
  [...document.querySelectorAll('.stat-grid .stat')].map((s) => ({
    label: s.querySelector('.stat-label')?.textContent, value: s.querySelector('.stat-value')?.textContent })));
L('Northwind stat grid', JSON.stringify(northwindStats));
await shot(page, '05-account-note-added.png');

// note button disabled when empty
const emptyDisabled = await page.evaluate(() => {
  const inp = document.querySelector('#note-input'); inp.value='';
  return document.querySelector('.note-form button[type=submit]').disabled;
});
L('Log note disabled when empty (via LS state):', 'check-below');

// ---------- 6. Contacts view: filter + sort ----------
L('== CONTACTS: filter + sort ==');
await page.locator('.nav-item', { hasText: 'Contacts' }).click();
await page.waitForTimeout(120);
const totalRows = await page.locator('.data-table tbody tr').count();
L('contacts total rows:', totalRows);
await page.locator('.filter-input').fill('Grace');
await page.waitForTimeout(150);
const filteredRows = await page.locator('.data-table tbody tr').allTextContents();
L('filtered by "Grace":', JSON.stringify(filteredRows));
await shot(page, '06-contacts-filter.png');
await page.locator('.filter-input').fill('zzznotfound');
await page.waitForTimeout(150);
const noMatch = await page.locator('.data-table tbody tr').first().textContent();
L('no-match row:', noMatch.trim());
await page.locator('.filter-input').fill('');
await page.waitForTimeout(120);
// sort by Name (toggle to descending)
const firstBefore = await page.locator('.data-table tbody tr td .cell-link').first().textContent();
await page.locator('.th-sort', { hasText: 'Name' }).click();
await page.waitForTimeout(120);
const firstAfterDesc = await page.locator('.data-table tbody tr td .cell-link').first().textContent();
L('name sort: first asc=', firstBefore, ' first desc=', firstAfterDesc);
// sort by Title
await page.locator('.th-sort', { hasText: 'Title' }).click();
await page.waitForTimeout(120);
const firstByTitle = await page.locator('.data-table tbody tr').first().textContent();
L('first row sorted by Title:', firstByTitle.trim());
await shot(page, '07-contacts-sort.png');

// click a contact -> detail card
await page.locator('.cell-link').first().click();
await page.waitForTimeout(120);
const contactCard = await page.locator('.contact-card').count();
const contactEmail = await page.locator('.contact-facts dd').nth(1).textContent();
L('contact card shown:', contactCard, ' email:', contactEmail);
await shot(page, '08-contact-detail.png');

// ---------- 7. Forecast view ----------
L('== FORECAST ==');
await page.locator('.nav-item', { hasText: 'Forecast' }).click();
await page.waitForTimeout(150);
const forecastStats = await page.evaluate(() =>
  [...document.querySelectorAll('.stat-grid.wide .stat')].map((s) => ({
    label: s.querySelector('.stat-label')?.textContent, value: s.querySelector('.stat-value')?.textContent })));
L('forecast totals', JSON.stringify(forecastStats));
const bars = await page.locator('.forecast-chart rect').count();
const quarters = await page.evaluate(() =>
  [...document.querySelectorAll('.table-panel tbody tr')].map((r) =>
    [...r.querySelectorAll('th,td')].map((c) => c.textContent)));
L('chart rect count:', bars);
L('quarter table', JSON.stringify(quarters));
const probLegend = await page.evaluate(() =>
  [...document.querySelectorAll('.probability-legend li')].map((l) => l.textContent));
L('probability legend', JSON.stringify(probLegend));
await shot(page, '09-forecast.png');

// ---------- 8. Global search ----------
L('== GLOBAL SEARCH ==');
await page.locator('.search-input').fill('aer');
await page.waitForTimeout(200);
const searchHits = await page.locator('.search-result').allTextContents();
L('search "aer" hits:', JSON.stringify(searchHits));
await shot(page, '10-search.png');
// choose first hit
await page.locator('.search-result').first().click();
await page.waitForTimeout(150);
const afterSearchView = await page.locator('.account-360 h2, .content h1').first().textContent();
L('after choosing search hit, view header:', afterSearchView);
// search opportunity
await page.locator('.search-input').fill('telemetry');
await page.waitForTimeout(200);
const oppHits = await page.locator('.search-result').allTextContents();
L('search "telemetry" hits:', JSON.stringify(oppHits));
// Escape clears
await page.locator('.search-input').press('Escape');
await page.waitForTimeout(100);
const searchVal = await page.locator('.search-input').inputValue();
L('search value after Escape:', JSON.stringify(searchVal));

// ---------- 9. Persistence across reload ----------
L('== PERSISTENCE RELOAD ==');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-gallery-app-id="pipeline-crm"]');
const noteSurvives = (await readLS()).activities.find((a) => a.body === noteText);
L('note survives reload:', noteSurvives ? 'YES' : 'NO');
// navigate to accounts northwind to see it visually
await page.locator('.nav-item', { hasText: 'Accounts' }).click();
await page.waitForTimeout(100);
await page.locator('.record-item', { hasText: 'Northwind Traders' }).click();
await page.waitForTimeout(120);
const timelineAfterReload = await page.locator('.timeline-item .timeline-text').first().textContent();
L('timeline top after reload:', timelineAfterReload);
await shot(page, '11-persistence-after-reload.png');

// ---------- 10. Reset demo data ----------
L('== RESET DEMO DATA ==');
await page.locator('.reset-button').click();
await page.waitForTimeout(200);
const lsAfterReset = await readLS();
const noteAfterReset = lsAfterReset.activities.find((a) => a.body === noteText);
L('custom note after reset:', noteAfterReset ? 'STILL PRESENT (BAD)' : 'GONE (seed restored)');
L('activities count after reset:', lsAfterReset.activities.length, '(seed has 5)');
L('opportunities count after reset:', lsAfterReset.opportunities.length);
await page.locator('.nav-item', { hasText: 'Pipeline' }).click();
await page.waitForTimeout(120);
L('columns after reset', JSON.stringify(await columnData()));
await shot(page, '12-after-reset.png');

// ---------- 11. Responsive ----------
L('== RESPONSIVE ==');
await page.setViewportSize({ width: 768, height: 1024 });
await page.waitForTimeout(200);
await shot(page, '13-tablet-768.png');
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(200);
await shot(page, '14-mobile-375.png');
const mobileNavVisible = await page.locator('.nav-item').first().isVisible();
L('mobile nav visible:', mobileNavVisible);
await page.setViewportSize({ width: 1400, height: 900 });

// ---------- errors ----------
L('== ERRORS ==');
L('pageErrors:', JSON.stringify(pageErrors));
L('consoleErrors:', JSON.stringify(consoleErrors));

const fs = await import('node:fs');
fs.writeFileSync(path.join(DIR, 'drive-log.txt'), log.join('\n'));
await browser.close();
console.log('\nDONE. pageErrors=' + pageErrors.length + ' consoleErrors=' + consoleErrors.length);
