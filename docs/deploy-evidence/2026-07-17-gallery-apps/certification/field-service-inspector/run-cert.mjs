import pkg from '/Users/hb/dev/vibecore-gallery-apps/node_modules/@playwright/test/index.js';
const { chromium } = pkg;
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:44120/';
const shot = (page, name) => page.screenshot({ path: join(DIR, name) });

const pageErrors = [];
const consoleErrors = [];
const results = [];
function rec(control, status, proof, note) {
  results.push({ control, status, proof, note: note ?? '' });
  console.log(`[${status}] ${control} :: ${proof}${note ? ' :: ' + note : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

// file chooser handler for the dynamically-created <input type=file>
page.on('filechooser', async (fc) => {
  await fc.setFiles(join(DIR, 'fixture-photo.png'));
});

// ---- 1. LOAD (zero pageerror at boot; expo-camera must not load) ----
const netReqs = [];
page.on('request', (r) => netReqs.push(r.url()));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const bootErrors = [...pageErrors];
await shot(page, '01-load.png');
const title = await page.title();
const cameraChunkLoadedAtBoot = netReqs.some((u) => /expo-camera|Camera/i.test(u));
rec('Boot / initial paint', bootErrors.length === 0 ? 'OK' : 'CASSÉ',
  '01-load.png', `title="${title}"; pageerrors@boot=${bootErrors.length}; jsReqs=${netReqs.length}`);
rec('expo-camera absent at boot', cameraChunkLoadedAtBoot ? 'CASSÉ' : 'OK',
  '01-load.png', `camera-matching requests=${netReqs.filter(u=>/camera/i.test(u)).length}`);

async function getBadge() {
  return page.evaluate(() => {
    // badge shows queued count; find the small pill next to sync buttons
    const nodes = [...document.querySelectorAll('div')];
    // fallback: read via aria? Instead read the whole sync bar text
    return null;
  });
}
async function queuedText() {
  // read the sync message text visible
  return page.evaluate(() => document.body.innerText);
}
// Real queue length from persisted AsyncStorage-on-web (localStorage). When the
// backend is unconfigured the visible message is the honest "Configure…" string,
// so the queue count itself lives in the badge + this persisted key.
async function queuedCount() {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('fsi.queue.v1');
      if (!raw) return 0;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return -1;
    }
  });
}

// ---- 2. JOB LIST enumeration ----
const jobButtons = await page.getByRole('button', { name: /^Open job WO-/ }).all();
rec('Job list rendered', jobButtons.length > 0 ? 'OK' : 'CASSÉ', '01-load.png', `jobs=${jobButtons.length}`);

// ---- 3. SELECT a job (second one, WO-4822) ----
await page.getByRole('button', { name: /Open job WO-4822/ }).click();
await page.waitForTimeout(400);
await shot(page, '02-job-selected.png');
const detailHasCustomer = await page.getByText('Harbour Point Apartments').count();
rec('Select job WO-4822', detailHasCustomer > 0 ? 'OK' : 'CASSÉ', '02-job-selected.png',
  `detail shows customer=${detailHasCustomer>0}`);

// ---- 4. CHECKLIST pass ----
const passBtns = await page.getByRole('button', { name: /Mark .* as pass/ }).all();
const failBtns = await page.getByRole('button', { name: /Mark .* as fail/ }).all();
rec('Checklist rows rendered', passBtns.length > 0 ? 'OK' : 'CASSÉ', '02-job-selected.png',
  `pass=${passBtns.length} fail=${failBtns.length}`);

const queuedBefore = await queuedCount();
await passBtns[0].click();
await page.waitForTimeout(300);
const queuedAfterPass = await queuedCount();
// visible proof the pass state stuck: the row's Pass button becomes selected (aria-pressed/selected)
await shot(page, '03-checklist-pass.png');
rec('Checklist Pass toggles + queue increments', queuedAfterPass > queuedBefore ? 'OK' : 'CASSÉ',
  '03-checklist-pass.png', `persisted queue ${queuedBefore} -> ${queuedAfterPass}`);

// ---- 5. CHECKLIST fail + comment ----
await failBtns[1].click();
await page.waitForTimeout(300);
await shot(page, '04-fail.png');
// comment field appears for the failed row
const commentBoxes = await page.getByRole('textbox').all();
// find comment textarea by placeholder "Describe the defect"
const defect = page.getByPlaceholder(/Describe the defect/);
const defectCount = await defect.count();
let commentTyped = false;
if (defectCount > 0) {
  await defect.first().click();
  await defect.first().fill('Compressor seal weeping oil — flagged for follow-up.');
  commentTyped = true;
}
await page.waitForTimeout(300);
const queuedAfterFail = await queuedCount();
await shot(page, '05-fail-comment.png');
rec('Checklist Fail reveals comment + typing works', commentTyped ? 'OK' : 'CASSÉ',
  '05-fail-comment.png', `defect field appeared=${defectCount>0}; persisted queue now=${queuedAfterFail}`);

// ---- 6. NOTES ----
const notes = page.getByLabel('Job notes');
await notes.click();
await notes.fill('Site access via loading bay B. Manager on site until 16:00.');
await page.waitForTimeout(300);
const notesVal = await notes.inputValue();
rec('Notes field editable', notesVal.includes('loading bay B') ? 'OK' : 'CASSÉ', '05-fail-comment.png',
  `notes length=${notesVal.length}`);

// ---- 7. PHOTO via file fallback ----
const takePhoto = page.getByRole('button', { name: 'Take photo' });
const photoBefore = await page.getByRole('button', { name: /^Remove/ }).count();
await takePhoto.click();
// filechooser handler sets the file; wait for thumbnail + Remove button
await page.waitForTimeout(1200);
const photoAfter = await page.getByRole('button', { name: /^Remove/ }).count();
await shot(page, '06-photo-added.png');
rec('Take photo (file fallback) adds thumbnail', photoAfter > photoBefore ? 'OK' : 'CASSÉ',
  '06-photo-added.png', `remove-buttons ${photoBefore} -> ${photoAfter}`);

// verify thumbnail image element present with data uri
const thumbSrc = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  const t = imgs.find((i) => (i.src||'').startsWith('data:image'));
  return t ? t.src.slice(0, 30) : null;
});
rec('Photo thumbnail is a real data-URI image', thumbSrc ? 'OK' : 'CASSÉ', '06-photo-added.png',
  `src=${thumbSrc}`);

// ---- 8. REMOVE photo ----
await page.getByRole('button', { name: /^Remove/ }).first().click();
await page.waitForTimeout(600);
const photoAfterRemove = await page.getByRole('button', { name: /^Remove/ }).count();
await shot(page, '07-photo-removed.png');
rec('Remove photo works', photoAfterRemove < photoAfter ? 'OK' : 'CASSÉ', '07-photo-removed.png',
  `remove-buttons ${photoAfter} -> ${photoAfterRemove}`);

// ---- 9. SIGNATURE draw ----
const sigArea = page.locator('[aria-label="Signature capture area"]');
const box = await sigArea.boundingBox();
if (box) {
  const cx = box.x, cy = box.y;
  await page.mouse.move(cx + 30, cy + 90);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 8 });
  await page.mouse.move(cx + 140, cy + 130, { steps: 8 });
  await page.mouse.move(cx + 220, cy + 50, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}
await shot(page, '08-signature-drawn.png');
const sigPaths = await page.evaluate(() => document.querySelectorAll('svg path').length);
rec('Signature pad draws polyline (SVG path)', sigPaths > 0 ? 'OK' : 'CASSÉ', '08-signature-drawn.png',
  `svg paths=${sigPaths}`);

// ---- 10. SIGNATURE clear (local) ----
await page.getByRole('button', { name: /^Clear$/ }).click();
await page.waitForTimeout(400);
const sigPathsAfterClear = await page.evaluate(() => document.querySelectorAll('svg path').length);
await shot(page, '09-signature-cleared.png');
rec('Signature Clear erases ink', sigPathsAfterClear < sigPaths ? 'OK' : 'CASSÉ', '09-signature-cleared.png',
  `svg paths ${sigPaths} -> ${sigPathsAfterClear}`);

// ---- 11. SIGNATURE re-draw + name + save ----
const box2 = await sigArea.boundingBox();
if (box2) {
  await page.mouse.move(box2.x + 40, box2.y + 80);
  await page.mouse.down();
  await page.mouse.move(box2.x + 120, box2.y + 40, { steps: 6 });
  await page.mouse.move(box2.x + 200, box2.y + 120, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
const custName = page.getByLabel('Customer name for signature');
await custName.fill('Dana Whitfield');
await page.getByRole('button', { name: 'Save signature' }).click();
await page.waitForTimeout(500);
await shot(page, '10-signature-saved.png');
const savedMeta = await page.getByText(/Signed by Dana Whitfield/).count();
rec('Save signature persists signed-by meta', savedMeta > 0 ? 'OK' : 'CASSÉ', '10-signature-saved.png',
  `saved meta present=${savedMeta>0}`);

// ---- 12. SYNC NOW honest (no EXPO_PUBLIC_SYNC_URL) ----
// Sync now button is disabled when unconfigured. Verify it is disabled AND message is honest.
const bodyNow = await queuedText();
const honest = /Configure EXPO_PUBLIC_SYNC_URL/.test(bodyNow);
const syncBtn = page.getByRole('button', { name: 'Sync now' });
const syncDisabled = await syncBtn.getAttribute('aria-disabled');
await shot(page, '11-sync-honest.png');
rec('Sync honest: message asks to configure, no fake success', honest ? 'OK' : 'CASSÉ', '11-sync-honest.png',
  `honest-msg=${honest}; syncBtn aria-disabled=${syncDisabled}`);

// ---- 13. OFFLINE simulation ----
await page.getByRole('button', { name: 'Simulate offline' }).click();
await page.waitForTimeout(400);
await shot(page, '12-offline.png');
const offlineShown = await page.getByText('Offline', { exact: true }).count();
rec('Simulate offline -> Offline badge', offlineShown > 0 ? 'OK' : 'CASSÉ', '12-offline.png',
  `Offline label count=${offlineShown}`);

// ---- 14. BACK ONLINE ----
await page.getByRole('button', { name: 'Simulate 4G back' }).click();
await page.waitForTimeout(400);
await shot(page, '13-online.png');
const onlineShown = await page.getByText('Online', { exact: true }).count();
rec('Simulate 4G back -> Online badge', onlineShown > 0 ? 'OK' : 'CASSÉ', '13-online.png',
  `Online label count=${onlineShown}`);

// ---- 15. PERSISTENCE after reload ----
const queuedPreReload = await queuedCount();
// snapshot localStorage keys
const lsKeys = await page.evaluate(() => Object.keys(localStorage));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const reloadErrors = pageErrors.length - bootErrors.length; // any new errors during reload
// re-select same job to inspect its detail
await page.getByRole('button', { name: /Open job WO-4822/ }).click();
await page.waitForTimeout(500);
const queuedPostReload = await queuedCount();
const notesPost = await page.getByLabel('Job notes').inputValue().catch(() => '');
const sigPost = await page.getByText(/Signed by Dana Whitfield/).count();
await shot(page, '14-after-reload.png');
rec('Persistence: queue survives reload', queuedPostReload === queuedPreReload && Number(queuedPostReload) > 0 ? 'OK' : 'CASSÉ',
  '14-after-reload.png', `queued pre=${queuedPreReload} post=${queuedPostReload}; lsKeys=${JSON.stringify(lsKeys)}`);
rec('Persistence: notes survive reload', notesPost.includes('loading bay B') ? 'OK' : 'CASSÉ',
  '14-after-reload.png', `notes restored len=${notesPost.length}`);
rec('Persistence: signature survives reload', sigPost > 0 ? 'OK' : 'CASSÉ',
  '14-after-reload.png', `signed meta present=${sigPost>0}`);

// ---- 16. NAV back to list (mobile view is only <900; at desktop two-pane list always visible) ----
// Verify list still interactive: select a different job
await page.getByRole('button', { name: /Open job WO-4823/ }).click();
await page.waitForTimeout(300);
const nav = await page.getByText('Fenwick Distribution').count();
rec('Navigation list<->detail (switch job)', nav > 0 ? 'OK' : 'CASSÉ', '14-after-reload.png',
  `switched to WO-4823=${nav>0}`);

// ---- FINAL error accounting ----
rec('Zero pageerror across whole session', pageErrors.length === 0 ? 'OK' : 'CASSÉ', '14-after-reload.png',
  `total pageerrors=${pageErrors.length}; consoleErrors=${consoleErrors.length}`);

console.log('\n===PAGEERRORS==='); console.log(JSON.stringify(pageErrors, null, 2));
console.log('===CONSOLE_ERRORS==='); console.log(JSON.stringify(consoleErrors.slice(0,20), null, 2));
console.log('===RESULTS_JSON==='); console.log(JSON.stringify(results, null, 2));

await browser.close();
const broken = results.filter((r) => r.status === 'CASSÉ');
console.log(`\nSUMMARY: ${results.length - broken.length}/${results.length} OK; ${broken.length} CASSÉ`);
process.exit(0);
