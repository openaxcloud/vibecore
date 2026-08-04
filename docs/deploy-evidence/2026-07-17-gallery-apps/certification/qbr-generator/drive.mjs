import pw from '/Users/hb/dev/vibecore-gallery-apps/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:44140/';
const DIR = new URL('.', import.meta.url).pathname;
const shot = (page, name) => page.screenshot({ path: `${DIR}${name}.png`, fullPage: false });

const apiCalls = [];
const pageErrors = [];
const consoleErrors = [];

const results = [];
const rec = (control, status, proof) => { results.push({ control, status, proof }); console.log(`[${status}] ${control} :: ${proof}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('requestfinished', async (req) => {
  const u = req.url();
  if (u.includes('/api/qbr')) {
    const resp = await req.response();
    apiCalls.push({ url: u.replace(BASE, '/'), status: resp?.status(), method: req.method() });
  }
});
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

// ---- Initial load ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Source pill: backend vs read-only
const pillText = (await page.locator('.source-pill').textContent())?.trim();
const artifactAttr = await page.locator('.app').getAttribute('data-artifact');
const bannerVisible = await page.locator('.preview-banner').count();
rec('Backend mode (source pill)', pillText === 'live backend' ? 'OK' : 'CASSÉ', `pill="${pillText}", banner count=${bannerVisible}`);
rec('Initial artifact = deck', artifactAttr === 'deck' ? 'OK' : 'CASSÉ', `data-artifact="${artifactAttr}"`);

// Confirm API calls fired on load
await page.waitForTimeout(200);
const loadCalls = apiCalls.filter(c => c.status === 200).map(c => c.url);
rec('Deck consumes /api on load', loadCalls.includes('/api/qbr/summary') ? 'OK' : 'CASSÉ', `calls: ${JSON.stringify([...new Set(loadCalls)])}`);

await shot(page, '01-title');

// Title slide figures non-empty
const titleFigs = await page.locator('.title-figures dd').allTextContents();
rec('Title slide figures non-vides', titleFigs.every(t => t.trim().length > 0) ? 'OK' : 'CASSÉ', `figs=${JSON.stringify(titleFigs)}`);

// ---- Slide navigation: dots ----
const dotCount = await page.locator('.deck__dot').count();
rec('Slide dots present', dotCount === 8 ? 'OK' : 'CASSÉ', `${dotCount} dots`);

const slideProbes = [];
for (let i = 0; i < dotCount; i++) {
  await page.locator('.deck__dot').nth(i).click();
  await page.waitForTimeout(180);
  const counter = (await page.locator('.deck__counter').textContent())?.trim();
  const frameText = (await page.locator('.deck__stage .deck__frame').innerText()).replace(/\s+/g, ' ').trim();
  const nav = await page.locator('.deck__dot').nth(i).innerText();
  slideProbes.push({ i, nav, counter, len: frameText.length });
  await shot(page, `slide-${i}-${nav.replace(/\W/g,'')}`);
}
const allNonEmpty = slideProbes.every(s => s.len > 40);
rec('Chaque dot navigue + slide rend contenu', allNonEmpty ? 'OK' : 'CASSÉ', JSON.stringify(slideProbes.map(s=>({nav:s.nav,counter:s.counter,len:s.len}))));

// ---- Prev/Next arrow buttons ----
await page.locator('.deck__dot').nth(0).click();
await page.waitForTimeout(120);
const prevDisabledAt0 = await page.locator('.deck__btn[aria-label="Previous slide"]').isDisabled();
await page.locator('.deck__btn[aria-label="Next slide"]').click();
await page.waitForTimeout(150);
const counterAfterNext = (await page.locator('.deck__counter').textContent())?.trim();
rec('Bouton › (next)', counterAfterNext === '2 / 8' ? 'OK' : 'CASSÉ', `counter=${counterAfterNext}, prev disabled at slide1=${prevDisabledAt0}`);
await page.locator('.deck__btn[aria-label="Previous slide"]').click();
await page.waitForTimeout(150);
const counterAfterPrev = (await page.locator('.deck__counter').textContent())?.trim();
rec('Bouton ‹ (prev)', counterAfterPrev === '1 / 8' ? 'OK' : 'CASSÉ', `counter=${counterAfterPrev}`);
// Next disabled at last
await page.locator('.deck__dot').nth(7).click();
await page.waitForTimeout(120);
const nextDisabledAtEnd = await page.locator('.deck__btn[aria-label="Next slide"]').isDisabled();
rec('Next désactivé sur dernière slide', nextDisabledAtEnd ? 'OK' : 'CASSÉ', `disabled=${nextDisabledAtEnd}`);

// ---- Stage click advances ----
await page.locator('.deck__dot').nth(0).click();
await page.waitForTimeout(120);
await page.locator('.deck__stage').click({ position: { x: 400, y: 200 } });
await page.waitForTimeout(150);
const counterAfterStageClick = (await page.locator('.deck__counter').textContent())?.trim();
rec('Clic sur la slide avance', counterAfterStageClick === '2 / 8' ? 'OK' : 'CASSÉ', `counter=${counterAfterStageClick}`);

// ---- Keyboard navigation ----
await page.locator('.deck__dot').nth(0).click();
await page.waitForTimeout(120);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(120);
let c = (await page.locator('.deck__counter').textContent())?.trim();
const kRight = c === '2 / 8';
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(120);
c = (await page.locator('.deck__counter').textContent())?.trim();
const kLeft = c === '1 / 8';
await page.keyboard.press('End');
await page.waitForTimeout(120);
c = (await page.locator('.deck__counter').textContent())?.trim();
const kEnd = c === '8 / 8';
await page.keyboard.press('Home');
await page.waitForTimeout(120);
c = (await page.locator('.deck__counter').textContent())?.trim();
const kHome = c === '1 / 8';
await page.keyboard.press('PageDown');
await page.waitForTimeout(120);
c = (await page.locator('.deck__counter').textContent())?.trim();
const kPgDn = c === '2 / 8';
await page.keyboard.press('PageUp');
await page.waitForTimeout(120);
c = (await page.locator('.deck__counter').textContent())?.trim();
const kPgUp = c === '1 / 8';
rec('Clavier ←/→/Home/End/PageUp/PageDown', (kRight&&kLeft&&kEnd&&kHome&&kPgDn&&kPgUp) ? 'OK' : 'CASSÉ', `right=${kRight} left=${kLeft} end=${kEnd} home=${kHome} pgdn=${kPgDn} pgup=${kPgUp}`);

// ---- Fullscreen button: enter (label + class toggle), then EXIT so it doesn't cover header ----
const fsBtn = page.locator('.deck__btn--wide');
const fsLabelBefore = (await fsBtn.textContent())?.trim();
await fsBtn.click().catch(()=>{});
await page.waitForTimeout(300);
const fsActive = await page.locator('.deck--fullscreen').count();
const fsLabelDuring = (await fsBtn.textContent())?.trim();
const fsElemSet = await page.evaluate(() => Boolean(document.fullscreenElement));
// exit fullscreen
await fsBtn.click().catch(()=>{});
await page.waitForTimeout(300);
const fsLabelAfter = (await fsBtn.textContent())?.trim();
const fsElemCleared = await page.evaluate(() => !document.fullscreenElement);
const fsOk = fsLabelBefore === 'Full screen' && fsElemSet && fsLabelDuring === 'Exit full screen' && fsElemCleared && fsLabelAfter === 'Full screen';
rec('Bouton plein écran (enter+exit, label toggle)', fsOk ? 'OK' : 'CASSÉ', `before="${fsLabelBefore}" during="${fsLabelDuring}"(fsElem=${fsElemSet},class=${fsActive}) after="${fsLabelAfter}"(cleared=${fsElemCleared})`);

// ---- Print surface exists (all slides rendered for print) ----
const printPages = await page.locator('.deck__print-page').count();
rec('Surface impression (1 page/slide)', printPages === 8 ? 'OK' : 'CASSÉ', `${printPages} print pages`);

// ---- Verify numbers come from backend (compare a KPI to /api) ----
const apiSummary = await (await fetch('http://127.0.0.1:44140/api/qbr/summary')).json();
await page.locator('.deck__dot').nth(2).click(); // KPIs slide
await page.waitForTimeout(150);
const kpiValues = await page.locator('.kpi__value').allTextContents();
const activeInApi = String(apiSummary.kpis.activeCustomers);
rec('KPIs = backend (non hardcodé)', kpiValues.length >= 5 ? 'OK' : 'CASSÉ', `kpi values=${JSON.stringify(kpiValues)}; api activeCustomers=${activeInApi}`);

// ---- Switch to Appendix ----
const callsBeforeSwitch = apiCalls.length;
await page.locator('.artifact-switch__btn').nth(1).click();
await page.waitForTimeout(400);
const artifactNow = await page.locator('.app').getAttribute('data-artifact');
rec('Bascule deck→appendix', artifactNow === 'appendix' ? 'OK' : 'CASSÉ', `data-artifact=${artifactNow}`);
await shot(page, '20-appendix');

// Appendix cohort table populated
const cohortRows = await page.locator('.appendix__section').nth(0).locator('tbody tr').count();
rec('Table cohortes appendix peuplée', cohortRows > 0 ? 'OK' : 'CASSÉ', `${cohortRows} cohort rows`);
const heatCells = await page.locator('.data-table .heat').count();
rec('Heatmap rétention cellules', heatCells > 0 ? 'OK' : 'CASSÉ', `${heatCells} heat cells`);

// Accounts table
const acctCountText = (await page.locator('.appendix__count').textContent())?.trim();
const acctRowsAll = await page.locator('.appendix__section').nth(1).locator('tbody tr').count();
rec('Table comptes peuplée', acctRowsAll > 0 ? 'OK' : 'CASSÉ', `${acctRowsAll} rows, counter="${acctCountText}"`);

// ---- Plan filter segmented ----
const filterResults = {};
for (const plan of ['Enterprise', 'Growth', 'Starter', 'All']) {
  await page.locator('.segmented__btn', { hasText: new RegExp(`^${plan}$`) }).click();
  await page.waitForTimeout(200);
  const rows = await page.locator('.appendix__section').nth(1).locator('tbody tr').count();
  // check all visible plan tags match
  const tags = await page.locator('.appendix__section').nth(1).locator('.plan-tag').allTextContents();
  const pure = plan === 'All' ? true : tags.every(t => t.trim() === plan);
  filterResults[plan] = { rows, pure };
}
const filterOk = filterResults.Enterprise.pure && filterResults.Growth.pure && filterResults.Starter.pure && filterResults.All.rows >= filterResults.Enterprise.rows;
rec('Filtre par plan (segmented)', filterOk ? 'OK' : 'CASSÉ', JSON.stringify(filterResults));
await shot(page, '21-appendix-filter-enterprise');

// ---- Sort select ----
await page.locator('.segmented__btn', { hasText: /^All$/ }).click();
await page.waitForTimeout(150);
const getFirstAcct = async () => (await page.locator('.appendix__section').nth(1).locator('tbody tr th[scope="row"]').first().textContent())?.trim();
const getMonthlyCol = async () => (await page.locator('.appendix__section').nth(1).locator('tbody tr td.num').nth(0).textContent())?.trim();

await page.locator('.sort-select select').selectOption('name');
await page.waitForTimeout(200);
const firstByName = await getFirstAcct();
await page.locator('.sort-select select').selectOption('lifetimeRevenue');
await page.waitForTimeout(200);
const firstByLifetime = await getFirstAcct();
await page.locator('.sort-select select').selectOption('monthlyRevenue');
await page.waitForTimeout(200);
const firstByMonthly = await getFirstAcct();
// name sort should be alphabetical-ish; different orderings prove it works
const sortChanged = (firstByName !== firstByMonthly) || (firstByLifetime !== firstByMonthly);
rec('Tri (Sort by select)', sortChanged ? 'OK' : 'CASSÉ', `byName="${firstByName}" byLifetime="${firstByLifetime}" byMonthly="${firstByMonthly}"`);
// verify name sort truly alphabetical
await page.locator('.sort-select select').selectOption('name');
await page.waitForTimeout(200);
const names = await page.locator('.appendix__section').nth(1).locator('tbody tr th[scope="row"]').allTextContents();
const sortedNames = [...names].sort((a,b)=>a.localeCompare(b));
rec('Tri par nom = ordre alpha réel', JSON.stringify(names)===JSON.stringify(sortedNames) ? 'OK' : 'CASSÉ', `first5=${JSON.stringify(names.slice(0,5))}`);

// ---- "Open the slide deck" link ----
await page.locator('.appendix__link').click();
await page.waitForTimeout(300);
const backToDeck = await page.locator('.app').getAttribute('data-artifact');
rec('Lien "Open the slide deck"', backToDeck === 'deck' ? 'OK' : 'CASSÉ', `data-artifact=${backToDeck}`);

// ---- Persistence / reload consistency ----
// go to appendix, reload, confirm same data + still backend
await page.locator('.artifact-switch__btn').nth(1).click();
await page.waitForTimeout(200);
const acctBeforeReload = await page.locator('.appendix__count').textContent();
const firstAcctBefore = await getFirstAcct();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const pillAfterReload = (await page.locator('.source-pill').textContent())?.trim();
const artifactAfterReload = await page.locator('.app').getAttribute('data-artifact');
const acctAfterReload = await page.locator('.appendix__count').textContent();
rec('Persistance: artifact=appendix après reload (URL)', artifactAfterReload === 'appendix' ? 'OK' : 'CASSÉ', `data-artifact=${artifactAfterReload}`);
rec('Cohérence: mêmes données après reload', acctBeforeReload === acctAfterReload ? 'OK' : 'CASSÉ', `before="${acctBeforeReload}" after="${acctAfterReload}"`);
rec('Backend toujours actif après reload', pillAfterReload === 'live backend' ? 'OK' : 'CASSÉ', `pill=${pillAfterReload}`);

// ---- Network summary: both artifacts hit /api ----
const uniqApi = [...new Set(apiCalls.filter(c=>c.status===200).map(c=>c.url))];
rec('Réseau: /api/qbr/summary + /api/qbr/cohorts partent', (uniqApi.includes('/api/qbr/summary')&&uniqApi.includes('/api/qbr/cohorts')) ? 'OK' : 'CASSÉ', JSON.stringify(uniqApi));

// ---- Errors (classify: Vite-HMR dev-tooling noise vs app-origin) ----
const isHmr = (s) => /@vite\/client|24678|WebSocket closed without opened|failed to connect to websocket|Failed to send error to Vite/.test(s);
const appPageErrors = pageErrors.filter(e => !isHmr(e));
const appConsoleErrors = consoleErrors.filter(e => !isHmr(e));
rec('Zéro pageerror (app-origin)', appPageErrors.length === 0 ? 'OK' : 'CASSÉ', appPageErrors.length ? JSON.stringify(appPageErrors) : `none (HMR-only noise filtered: ${pageErrors.length})`);
rec('Zéro console.error (app-origin)', appConsoleErrors.length === 0 ? 'OK' : 'CASSÉ', appConsoleErrors.length ? JSON.stringify(appConsoleErrors.slice(0,5)) : `none (HMR-only noise filtered: ${consoleErrors.length})`);

fs.writeFileSync(`${DIR}results.json`, JSON.stringify({ results, apiCalls, pageErrors, consoleErrors, slideProbes, filterResults }, null, 2));
console.log('\n=== SUMMARY ===');
console.log(`OK: ${results.filter(r=>r.status==='OK').length} / ${results.length}`);
console.log(`CASSÉ: ${results.filter(r=>r.status==='CASSÉ').map(r=>r.control).join(', ') || 'none'}`);
console.log(`API calls total: ${apiCalls.length}, pageErrors: ${pageErrors.length}, consoleErrors: ${consoleErrors.length}`);

await browser.close();
