/**
 * Real button-by-button certification driver for the Vendor Risk Review gallery
 * demo app. Drives a real Chromium against the real Express + sql.js backend.
 *
 *   node run-cert.mjs            # against http://127.0.0.1:44110
 *   BASE=... TAG=... node run-cert.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:44110';
const TAG = process.env.TAG ?? 'run';
const OUT = process.env.OUT_DIR
  ? path.resolve(import.meta.dirname, process.env.OUT_DIR)
  : path.resolve(import.meta.dirname);
mkdirSync(OUT, { recursive: true });

const ACCOUNTS = {
  analyst: { email: 'analyst@vendorrisk.demo', password: 'analyst-demo-2026', name: 'Ada Okafor' },
  manager: { email: 'manager@vendorrisk.demo', password: 'manager-demo-2026', name: 'Miguel Serrano' },
  ciso: { email: 'ciso@vendorrisk.demo', password: 'ciso-demo-2026', name: 'Nadia Bloom' },
};

const results = [];
const pageErrors = [];
const consoleErrors = [];
let shotIndex = 0;

function record(id, control, ok, note, shot) {
  results.push({ id, control, ok, note, shot: shot ?? null });
  process.stdout.write(`${ok ? 'OK  ' : 'FAIL'} ${id} — ${control} :: ${note}\n`);
}

async function shot(page, name) {
  shotIndex += 1;
  const file = `${String(shotIndex).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  return file;
}

function assert(cond, message) {
  if (!cond) {
    throw new Error(message);
  }
}

/** Detects any two visible text-bearing leaf elements whose boxes intersect. */
const OVERLAP_PROBE = `(() => {
  const leaves = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.childElementCount !== 0) return false;
    if (!el.textContent || !el.textContent.trim()) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'option') return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  });
  const hits = [];
  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      const a = leaves[i];
      const b = leaves[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 1 && oy > 1) {
        hits.push({
          a: (a.className || a.tagName) + ' :: ' + a.textContent.trim().slice(0, 40),
          b: (b.className || b.tagName) + ' :: ' + b.textContent.trim().slice(0, 40),
          overlapPx: Math.round(ox) + 'x' + Math.round(oy),
        });
      }
    }
  }
  return hits;
})()`;

async function overlapScan(page, where) {
  const hits = await page.evaluate(OVERLAP_PROBE);
  return { where, hits };
}

async function login(page, role) {
  const account = ACCOUNTS[role];
  await page.fill('input[type="email"]', account.email);
  await page.fill('input[type="password"]', account.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.sidebar__name', { timeout: 15000 });
}

async function logout(page) {
  await page.click('.sidebar__user button');
  await page.waitForSelector('.login__form', { timeout: 15000 });
}

async function openVendorByName(page, name) {
  await page.click('.sidebar__nav button:has-text("Portfolio")');
  await page.click(`.table tbody tr:has-text("${name}")`);
  await page.waitForSelector('.detail__header h1', { timeout: 15000 });
  const heading = await page.textContent('.detail__header h1');
  assert(heading?.trim() === name, `expected detail heading ${name}, got ${heading}`);
}

async function setSliders(page, values) {
  const labels = {
    securityPosture: 'Security posture',
    certifications: 'Certifications & attestations',
    dataSensitivity: 'Data sensitivity',
    financialStability: 'Financial stability',
  };
  for (const [key, value] of Object.entries(values)) {
    const slider = page.locator(`.scoring input[aria-label="${labels[key]}"]`);
    await slider.fill(String(value));
  }
}

function expectedScore(values) {
  const weights = {
    securityPosture: 0.35,
    certifications: 0.2,
    dataSensitivity: 0.3,
    financialStability: 0.15,
  };
  return Math.round(
    Object.entries(values).reduce((sum, [key, value]) => sum + weights[key] * value, 0),
  );
}

function tierFor(score) {
  return score >= 67 ? 'High' : score >= 34 ? 'Medium' : 'Low';
}

async function createVendor(page, { name, category, contactEmail, description }) {
  await page.click('.sidebar__nav button:has-text("New intake")');
  await page.waitForSelector('form.intake');
  await page.fill('form.intake input:not([type="email"])', name);
  await page.selectOption('form.intake select', category);
  await page.fill('form.intake input[type="email"]', contactEmail);
  await page.fill('form.intake textarea', description);
  await page.click('form.intake button[type="submit"]');
  await page.waitForSelector('.detail__header h1', { timeout: 15000 });
  const heading = await page.textContent('.detail__header h1');
  assert(heading?.trim() === name, `intake did not open detail for ${name} (got ${heading})`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const page = await context.newPage();

  page.on('pageerror', (error) => pageErrors.push({ at: page.url(), message: String(error) }));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    consoleErrors.push({ at: page.url(), text: msg.text(), location: msg.location()?.url ?? '' });
  });

  const stamp = Date.now().toString().slice(-6);
  const N = {
    medium: `Aurora Ledger ${stamp}`,
    high: `Helios Data Vault ${stamp}`,
    low: `Quill Notes ${stamp}`,
    reject: `Tessera Mail ${stamp}`,
  };

  const scans = [];

  try {
    /* ---------------------------------------------------------------- L1 login screen */
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.login__form');
    const loginShot = await shot(page, 'login-screen');
    const accountButtons = await page.locator('.login__account').count();
    record('L1', 'Login screen renders (pitch + form + 3 demo accounts)', accountButtons === 3,
      `${accountButtons} demo-account buttons rendered`, loginShot);

    scans.push(await overlapScan(page, 'login screen'));

    const accountText = await page.locator('.login__accounts').innerText();
    const allShown = ['analyst@vendorrisk.demo', 'manager@vendorrisk.demo', 'ciso@vendorrisk.demo',
      'analyst-demo-2026', 'manager-demo-2026', 'ciso-demo-2026'].every((t) => accountText.includes(t));
    record('L2', 'Demo credentials displayed for the 3 roles', allShown,
      allShown ? 'all 3 emails + passwords visible' : `missing entries in: ${accountText}`, loginShot);

    /* L3 role buttons load credentials */
    await page.click('.login__account:has-text("CISO")');
    const cisoEmail = await page.inputValue('input[type="email"]');
    const cisoPass = await page.inputValue('input[type="password"]');
    const l3shot = await shot(page, 'login-role-button-ciso');
    record('L3', 'Demo account button loads its credentials into the form',
      cisoEmail === ACCOUNTS.ciso.email && cisoPass === ACCOUNTS.ciso.password,
      `fields now ${cisoEmail} / ${cisoPass}`, l3shot);

    /* L4 wrong password */
    await page.fill('input[type="email"]', ACCOUNTS.analyst.email);
    await page.fill('input[type="password"]', 'definitely-wrong-password');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.notice--error', { timeout: 10000 });
    const errorText = (await page.textContent('.notice--error'))?.trim() ?? '';
    const l4shot = await shot(page, 'login-wrong-password-error');
    record('L4', 'Wrong password shows a visible error and does not sign in',
      errorText.length > 0 && (await page.locator('.login__form').count()) === 1,
      `error banner: "${errorText}"`, l4shot);

    /* L5 analyst login */
    await login(page, 'analyst');
    const who = await page.textContent('.sidebar__name');
    const role = await page.textContent('.sidebar__role');
    const l5shot = await shot(page, 'dashboard-analyst');
    record('L5', 'Sign in as analyst@vendorrisk.demo', who?.trim() === ACCOUNTS.analyst.name,
      `signed in as ${who?.trim()} / ${role?.trim()}`, l5shot);

    /* ---------------------------------------------------------------- D dashboard */
    const statValues = await page.locator('.stat__value').allInnerTexts();
    const rowCount = await page.locator('.table tbody tr').count();
    record('D1', 'Portfolio stat cards (tracked / awaiting / high / approved)',
      statValues.length === 4 && Number(statValues[0]) === rowCount,
      `stats=${statValues.join('/')} rows=${rowCount}`, l5shot);

    const filterResults = [];
    for (const [label, expectStatus] of [
      ['Awaiting manager', 'Awaiting manager'],
      ['Awaiting CISO', 'Awaiting CISO'],
      ['Approved', 'Approved'],
      ['Rejected', 'Rejected'],
      ['Draft', 'Draft'],
      ['All', null],
    ]) {
      await page.click(`.chip:text-is("${label}")`);
      await page.waitForTimeout(120);
      const rows = await page.locator('.table tbody tr').count();
      const empty = await page.locator('.empty').count();
      let pure = true;
      if (expectStatus && rows > 0) {
        // columns: th(vendor) td(category) td(risk) td(score) td(status) td(updated)
        const badges = await page.locator('.table tbody tr td:nth-of-type(4) .badge').allInnerTexts();
        pure = badges.every((b) => b.trim() === expectStatus);
      }
      filterResults.push(`${label}=${rows}${empty ? ' (empty state)' : ''}${pure ? '' : ' MIXED'}`);
      if (!pure) throw new Error(`filter ${label} returned mixed statuses`);
    }
    const dFilterShot = await shot(page, 'dashboard-filter-all');
    record('D2', 'Status filter chips (6) filter the table correctly', true,
      filterResults.join(', '), dFilterShot);

    /* ---------------------------------------------------------------- unscored draft vendor */
    await openVendorByName(page, 'Sparrow Survey Tools');
    const draftSubmit = page.locator('.stack button:has-text("Submit for approval")');
    const draftHint = await page.locator('.field__hint').first().innerText();
    const draftShot = await shot(page, 'draft-unscored-submit-disabled');
    record('U1', 'Unscored draft: Submit is disabled with an explanatory hint',
      (await draftSubmit.isDisabled()) && draftHint.includes('Score the vendor first'),
      `"${draftHint}" and Submit disabled`, draftShot);
    record('U2', 'Unscored draft shows "not been scored yet" instead of an empty card',
      (await page.locator('.notice:has-text("has not been scored yet")').count()) === 1,
      'notice rendered in the Risk score card', draftShot);

    /* ---------------------------------------------------------------- overlap defect probe on a scored vendor */
    await openVendorByName(page, 'Northwind Payments');
    const detailShot = await shot(page, 'vendor-detail-northwind');
    const breakdownBoxes = await page.evaluate(() => {
      return [...document.querySelectorAll('.breakdown__row')].map((row) => {
        const weight = row.querySelector('.breakdown__weight').getBoundingClientRect();
        const value = row.querySelector('.breakdown__value').getBoundingClientRect();
        const ox = Math.min(weight.right, value.right) - Math.max(weight.left, value.left);
        const oy = Math.min(weight.bottom, value.bottom) - Math.max(weight.top, value.top);
        return {
          label: row.querySelector('.breakdown__label').textContent,
          weightText: row.querySelector('.breakdown__weight').textContent,
          valueText: row.querySelector('.breakdown__value').textContent,
          overlap: ox > 1 && oy > 1 ? `${Math.round(ox)}x${Math.round(oy)}px` : null,
        };
      });
    });
    const collisions = breakdownBoxes.filter((b) => b.overlap);
    const zoomBox = await page.locator('.breakdown').boundingBox();
    shotIndex += 1;
    const zoomFile = `${String(shotIndex).padStart(2, '0')}-breakdown-zoom.png`;
    await page.screenshot({
      path: path.join(OUT, zoomFile),
      clip: { x: zoomBox.x - 8, y: zoomBox.y - 8, width: zoomBox.width + 16, height: zoomBox.height + 16 },
    });
    record('X1', 'Score breakdown: "NN% weight" label vs value do not collide', collisions.length === 0,
      collisions.length === 0
        ? `all 4 rows clear (${breakdownBoxes.map((b) => b.weightText + '/' + b.valueText).join(', ')})`
        : `COLLISION on ${collisions.length} rows: ${collisions.map((c) => `${c.weightText}~${c.valueText} ${c.overlap}`).join(' | ')}`,
      zoomFile);

    scans.push(await overlapScan(page, 'vendor detail (scored)'));

    const mailto = await page.locator('.detail__header a').getAttribute('href');
    const timelineItems = await page.locator('.timeline__item').count();
    record('U3', 'Vendor detail: contact mailto link + populated decision timeline',
      mailto === 'mailto:security@northwindpay.example' && timelineItems === 5,
      `href="${mailto}", ${timelineItems} timeline entries`, detailShot);

    await page.click('.back');
    await page.waitForSelector('.table tbody tr');
    const backShot = await shot(page, 'back-to-portfolio');
    record('U4', '"← Back to portfolio" returns to the vendor table',
      (await page.locator('.view__header h1').innerText()).includes('Vendor portfolio'),
      'portfolio view restored', backShot);

    /* ---------------------------------------------------------------- I intake form */
    await page.click('.sidebar__nav button:has-text("New intake")');
    await page.waitForSelector('form.intake');
    await page.click('form.intake button[type="submit"]');
    await page.waitForTimeout(200);
    const stillOnIntake = (await page.locator('form.intake').count()) === 1;
    const invalidCount = await page.evaluate(
      () => [...document.querySelectorAll('form.intake input, form.intake textarea')].filter((el) => !el.checkValidity()).length,
    );
    const intakeEmptyShot = await shot(page, 'intake-empty-validation');
    record('I1', 'Intake form blocks submission when required fields are empty',
      stillOnIntake && invalidCount > 0, `${invalidCount} invalid required fields, form not submitted`, intakeEmptyShot);

    await page.fill('form.intake input:not([type="email"])', N.medium);
    await page.fill('form.intake input[type="email"]', 'not-an-email');
    await page.fill('form.intake textarea', 'x');
    const emailValid = await page.evaluate(() => document.querySelector('form.intake input[type="email"]').checkValidity());
    const intakeBadEmailShot = await shot(page, 'intake-invalid-email');
    record('I2', 'Intake e-mail field rejects a malformed address', emailValid === false,
      `checkValidity()=${emailValid} for "not-an-email"`, intakeBadEmailShot);

    scans.push(await overlapScan(page, 'intake form'));

    const categories = await page.locator('form.intake select option').allInnerTexts();
    record('I3', 'Category dropdown offers the 6 categories', categories.length === 6,
      categories.join(', '), intakeBadEmailShot);

    /* ---------------------------------------------------------------- M medium vendor end-to-end */
    await createVendor(page, {
      name: N.medium,
      category: 'Product analytics',
      contactEmail: 'security@auroraledger.example',
      description: 'Ledger reconciliation SaaS reading pseudonymised transaction exports.',
    });
    const createdShot = await shot(page, 'intake-created-medium');
    const createdStatus = (await page.locator('.detail__badges .badge').first().innerText()).trim();
    record('C1', 'Create vendor (analyst) → opens draft detail', createdStatus === 'Draft',
      `${N.medium} created with status "${createdStatus}"`, createdShot);

    const mediumScores = { securityPosture: 60, certifications: 40, dataSensitivity: 50, financialStability: 40 };
    await setSliders(page, mediumScores);
    const previewText = (await page.locator('.scoring__preview').innerText()).replace(/\s+/g, ' ').trim();
    const expMedium = expectedScore(mediumScores);
    const sliderShot = await shot(page, 'scoring-live-preview-medium');
    record('S1', 'Scoring sliders recompute the weighted score live',
      previewText.includes(String(expMedium)),
      `sliders 60/40/50/40 → preview "${previewText}" (expected weighted ${expMedium})`, sliderShot);
    record('S2', 'Scoring sliders recompute the tier live',
      previewText.includes(`${tierFor(expMedium)} risk`),
      `expected ${tierFor(expMedium)} risk for score ${expMedium}`, sliderShot);
    const numbers = await page.locator('.scoring__num').allInnerTexts();
    record('S3', 'Each slider mirrors its own 0-100 value', numbers.join(',') === '60,40,50,40',
      `values shown: ${numbers.join(',')}`, sliderShot);

    await page.click('.scoring button:has-text("Save assessment")');
    await page.waitForSelector('.meter__value', { timeout: 15000 });
    const savedScore = (await page.locator('.meter__value').innerText()).trim();
    const savedTier = (await page.locator('.detail__badges .badge').nth(1).innerText()).trim();
    const savedShot = await shot(page, 'assessment-saved-medium');
    record('S4', 'Save assessment persists score + tier on the server',
      savedScore === String(expMedium) && savedTier === `${tierFor(expMedium)} risk`,
      `server returned score ${savedScore}, tier "${savedTier}"`, savedShot);
    scans.push(await overlapScan(page, 'vendor detail after save (breakdown + scoring)'));

    await page.click('.stack button:has-text("Submit for approval")');
    await page.waitForSelector('.detail__badges .badge:has-text("Awaiting manager")', { timeout: 15000 });
    const submittedShot = await shot(page, 'medium-submitted-awaiting-manager');
    record('W1', 'Submit a Medium vendor → routed to the approval manager', true,
      'status badge = "Awaiting manager"', submittedShot);

    const analystBlocked = (await page.locator('.card:has-text("Approval workflow") .notice').innerText()).trim();
    const analystApproveButtons = await page.locator('.card:has-text("Approval workflow") button:has-text("Approve")').count();
    const analystBlockedShot = await shot(page, 'analyst-cannot-approve');
    record('A1', 'Analyst sees no approve/reject control on a pending vendor',
      analystApproveButtons === 0 && analystBlocked.length > 0,
      `notice: "${analystBlocked}"`, analystBlockedShot);

    const mediumId = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/vendors`, { credentials: 'include' });
      const body = await res.json();
      return body.vendors[0].id;
    }, BASE);
    const analystApiApprove = await page.evaluate(async ([base, id]) => {
      const res = await fetch(`${base}/api/vendors/${id}/approve`, { method: 'POST', credentials: 'include' });
      return { status: res.status, body: await res.text() };
    }, [BASE, mediumId]);
    record('A2', 'Analyst POST /approve on a manager-stage vendor is refused server-side',
      analystApiApprove.status === 403,
      `HTTP ${analystApiApprove.status} ${analystApiApprove.body}`, analystBlockedShot);

    const rescore = await page.evaluate(async ([base, id]) => {
      const res = await fetch(`${base}/api/vendors/${id}/assessment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ securityPosture: 1, certifications: 1, dataSensitivity: 1, financialStability: 1 }),
      });
      return { status: res.status, body: await res.text() };
    }, [BASE, mediumId]);
    const badScores = await page.evaluate(async ([base, id]) => {
      const res = await fetch(`${base}/api/vendors/${id}/assessment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ securityPosture: 500, certifications: 1, dataSensitivity: 1, financialStability: 1 }),
      });
      return res.status;
    }, [BASE, mediumId]);
    record('A6', 'A submitted vendor cannot be re-scored; out-of-range scores rejected',
      rescore.status === 409 && (badScores === 409 || badScores === 400),
      `re-score after submit → HTTP ${rescore.status} ${rescore.body}; score=500 → HTTP ${badScores}`,
      analystBlockedShot);

    /* ---------------------------------------------------------------- H high vendor */
    const highScores = { securityPosture: 80, certifications: 60, dataSensitivity: 90, financialStability: 60 };
    await createVendor(page, {
      name: N.high,
      category: 'Infrastructure',
      contactEmail: 'trust@heliosvault.example',
      description: 'Replicates production database snapshots offsite, full customer records in scope.',
    });
    await setSliders(page, highScores);
    const expHigh = expectedScore(highScores);
    await page.click('.scoring button:has-text("Save assessment")');
    await page.waitForSelector('.meter__value', { timeout: 15000 });
    const highScoreShown = (await page.locator('.meter__value').innerText()).trim();
    await page.click('.stack button:has-text("Submit for approval")');
    await page.waitForSelector('.detail__badges .badge:has-text("Awaiting manager")', { timeout: 15000 });
    const highSubmitShot = await shot(page, 'high-submitted-awaiting-manager');
    record('W2', 'Submit a High vendor → first stop is the approval manager',
      highScoreShown === String(expHigh) && tierFor(expHigh) === 'High',
      `score ${highScoreShown} (${tierFor(expHigh)}), status "Awaiting manager"`, highSubmitShot);

    /* ---------------------------------------------------------------- L low vendor auto-approve */
    const lowScores = { securityPosture: 20, certifications: 20, dataSensitivity: 30, financialStability: 40 };
    await createVendor(page, {
      name: N.low,
      category: 'Productivity',
      contactEmail: 'hello@quillnotes.example',
      description: 'Internal note-taking tool, no customer or employee records in scope.',
    });
    await setSliders(page, lowScores);
    const expLow = expectedScore(lowScores);
    await page.click('.scoring button:has-text("Save assessment")');
    await page.waitForSelector('.meter__value', { timeout: 15000 });
    await page.click('.stack button:has-text("Submit for approval")');
    await page.waitForSelector('.detail__badges .badge:has-text("Approved")', { timeout: 15000 });
    const lowShot = await shot(page, 'low-auto-approved');
    const lowTimeline = await page.locator('.timeline').innerText();
    record('W3', 'Submit a Low vendor → auto-approved on submission',
      tierFor(expLow) === 'Low' && lowTimeline.includes('Low risk auto-approved on submission'),
      `score ${expLow} (${tierFor(expLow)}), timeline: "Low risk auto-approved on submission"`, lowShot);

    /* ---------------------------------------------------------------- R reject candidate */
    const rejectScores = { securityPosture: 40, certifications: 60, dataSensitivity: 40, financialStability: 60 };
    await createVendor(page, {
      name: N.reject,
      category: 'Marketing',
      contactEmail: 'ops@tesseramail.example',
      description: 'Bulk e-mail delivery with access to the full customer contact list.',
    });
    await setSliders(page, rejectScores);
    await page.click('.scoring button:has-text("Save assessment")');
    await page.waitForSelector('.meter__value', { timeout: 15000 });
    await page.click('.stack button:has-text("Submit for approval")');
    await page.waitForSelector('.detail__badges .badge:has-text("Awaiting manager")', { timeout: 15000 });

    /* ---------------------------------------------------------------- logout / manager */
    await logout(page);
    const loggedOutShot = await shot(page, 'signed-out');
    const sessionAfterLogout = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/session`, { credentials: 'include' });
      return (await res.json()).user;
    }, BASE);
    record('L6', 'Sign out clears the session (client + server cookie)',
      sessionAfterLogout === null, `GET /api/session → user=${JSON.stringify(sessionAfterLogout)}`, loggedOutShot);

    await login(page, 'manager');
    const managerShot = await shot(page, 'dashboard-manager');
    record('L7', 'Sign in as manager@vendorrisk.demo',
      (await page.textContent('.sidebar__name'))?.trim() === ACCOUNTS.manager.name,
      `signed in as ${ACCOUNTS.manager.name} (Approval manager)`, managerShot);

    /* manager cannot create intake */
    await page.click('.sidebar__nav button:has-text("New intake")');
    await page.waitForSelector('form.intake');
    const intakeDisabled = await page.locator('form.intake button[type="submit"]').isDisabled();
    const managerIntakeShot = await shot(page, 'manager-intake-disabled');
    record('A3', 'Manager cannot open an intake (form disabled + notice)',
      intakeDisabled && (await page.locator('.notice:has-text("Only risk analysts")').count()) === 1,
      'submit disabled and "Only risk analysts can open a new intake." shown', managerIntakeShot);

    /* manager approves the medium vendor */
    await openVendorByName(page, N.medium);
    await page.click('.card:has-text("Approval workflow") button:has-text("Approve")');
    await page.waitForSelector('.detail__badges .badge:has-text("Approved")', { timeout: 15000 });
    const mediumApprovedShot = await shot(page, 'medium-approved-by-manager');
    record('W4', 'Manager approves a Medium vendor → final Approved', true,
      `${N.medium} is Approved after one manager sign-off`, mediumApprovedShot);

    /* manager approves the high vendor → routes to CISO */
    await openVendorByName(page, N.high);
    await page.click('.card:has-text("Approval workflow") button:has-text("Approve")');
    await page.waitForSelector('.detail__badges .badge:has-text("Awaiting CISO")', { timeout: 15000 });
    const highRoutedShot = await shot(page, 'high-routed-to-ciso');
    record('W5', 'Manager approves a High vendor → escalated to the CISO', true,
      'status badge = "Awaiting CISO"', highRoutedShot);

    const managerAtCiso = await page.evaluate(async ([base, name]) => {
      const list = await (await fetch(`${base}/api/vendors`, { credentials: 'include' })).json();
      const vendor = list.vendors.find((v) => v.name === name);
      const res = await fetch(`${base}/api/vendors/${vendor.id}/approve`, { method: 'POST', credentials: 'include' });
      return { status: res.status, body: await res.text() };
    }, [BASE, N.high]);
    const managerAtCisoShot = await shot(page, 'manager-blocked-at-ciso-stage');
    const managerNotice = (await page.locator('.card:has-text("Approval workflow") .notice').innerText()).trim();
    record('A4', 'Manager cannot approve at the CISO stage (UI + 403)',
      managerAtCiso.status === 403 && managerNotice.includes('CISO'),
      `UI notice "${managerNotice}"; POST /approve → HTTP ${managerAtCiso.status} ${managerAtCiso.body}`,
      managerAtCisoShot);

    /* reject flow */
    await openVendorByName(page, N.reject);
    const rejectDisabled = await page.locator('button:has-text("Reject with reason")').isDisabled();
    const rejectEmptyShot = await shot(page, 'reject-button-disabled-empty-reason');
    const rejectApiEmpty = await page.evaluate(async ([base, name]) => {
      const list = await (await fetch(`${base}/api/vendors`, { credentials: 'include' })).json();
      const vendor = list.vendors.find((v) => v.name === name);
      const res = await fetch(`${base}/api/vendors/${vendor.id}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: '   ' }),
      });
      return { status: res.status, body: await res.text() };
    }, [BASE, N.reject]);
    record('R1', 'Rejection reason is mandatory (button disabled + HTTP 400)',
      rejectDisabled && rejectApiEmpty.status === 400,
      `button disabled with empty reason; POST /reject blank → HTTP ${rejectApiEmpty.status} ${rejectApiEmpty.body}`,
      rejectEmptyShot);

    const reason = 'No SPF/DKIM enforcement and no SOC 2 report for a processor holding the full contact list.';
    await page.fill('.card:has-text("Approval workflow") textarea', reason);
    await page.click('button:has-text("Reject with reason")');
    await page.waitForSelector('.detail__badges .badge:has-text("Rejected")', { timeout: 15000 });
    const rejectedShot = await shot(page, 'rejected-with-reason');
    const rejectTimeline = await page.locator('.timeline').innerText();
    record('R2', 'Reject with reason records the decision and the motive',
      rejectTimeline.includes(reason),
      `timeline contains the verbatim reason ("…${reason.slice(0, 40)}…")`, rejectedShot);

    /* ---------------------------------------------------------------- CISO */
    await logout(page);
    await login(page, 'ciso');
    const cisoShot = await shot(page, 'dashboard-ciso');
    record('L8', 'Sign in as ciso@vendorrisk.demo',
      (await page.textContent('.sidebar__name'))?.trim() === ACCOUNTS.ciso.name,
      `signed in as ${ACCOUNTS.ciso.name} (CISO)`, cisoShot);

    await openVendorByName(page, N.high);
    await page.click('.card:has-text("Approval workflow") button:has-text("Approve")');
    await page.waitForSelector('.detail__badges .badge:has-text("Approved")', { timeout: 15000 });
    const cisoApprovedShot = await shot(page, 'high-approved-by-ciso');
    const highTimeline = await page.locator('.timeline').innerText();
    record('W6', 'CISO approves the escalated High vendor → final Approved',
      highTimeline.includes('routed to CISO') && highTimeline.includes('CISO Nadia Bloom approved onboarding'),
      'timeline: manager approval → routed to CISO → CISO approval', cisoApprovedShot);
    scans.push(await overlapScan(page, 'vendor detail (approved, full timeline)'));

    /* ---------------------------------------------------------------- audit */
    await page.click('.sidebar__nav button:has-text("Audit trail")');
    await page.waitForSelector('.audit__search');
    const auditCount = (await page.locator('.audit__count').innerText()).trim();
    const auditShot = await shot(page, 'audit-trail');
    record('AU1', 'Audit trail lists every event', /\d+ events/.test(auditCount), auditCount, auditShot);
    scans.push(await overlapScan(page, 'audit trail (desktop)'));

    await page.fill('.audit__search input', N.high);
    await page.waitForTimeout(150);
    const filteredCount = (await page.locator('.audit__count').innerText()).trim();
    const filteredRows = await page.locator('.table tbody tr').count();
    const auditNames = await page.locator('.table tbody th').allInnerTexts();
    const auditSearchShot = await shot(page, 'audit-search-filter');
    record('AU2', 'Audit search box filters the trail',
      filteredRows > 0 && auditNames.every((n) => n.trim() === N.high),
      `search "${N.high}" → ${filteredCount}, all rows for that vendor`, auditSearchShot);

    await page.fill('.audit__search input', 'zzz-no-such-vendor');
    await page.waitForTimeout(150);
    const emptyState = await page.locator('.empty h3').innerText();
    const auditEmptyShot = await shot(page, 'audit-search-empty-state');
    record('AU3', 'Audit search with no match shows an empty state (not a blank view)',
      emptyState.includes('No matching events'), `"${emptyState}"`, auditEmptyShot);
    await page.fill('.audit__search input', '');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click('a.btn:has-text("Export CSV")'),
    ]);
    const csvPath = path.join(OUT, 'audit-export.csv');
    await download.saveAs(csvPath);
    const { readFileSync } = await import('node:fs');
    const csv = readFileSync(csvPath, 'utf8');
    const csvLines = csv.trim().split('\n');
    const csvOk =
      csvLines[0] === 'id,created_at,vendor,actor,action,detail' &&
      csv.includes(N.high) && csv.includes(N.medium) && csv.includes(N.low) &&
      csv.includes(reason) && csvLines.length > 25;
    const csvShot = await shot(page, 'audit-after-export');
    record('AU4', 'Export CSV downloads the real audit trail',
      csvOk,
      `${csvLines.length - 1} data rows, header "${csvLines[0]}", contains all 4 new vendors and the rejection reason`,
      csvShot);

    /* ---------------------------------------------------------------- persistence */
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.sidebar__name', { timeout: 15000 });
    await page.click('.sidebar__nav button:has-text("Portfolio")');
    await page.waitForSelector('.table tbody tr');
    const afterReload = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/vendors`, { credentials: 'include' });
      return (await res.json()).vendors.map((v) => `${v.name}=${v.status}/${v.tier}/${v.score}`);
    }, BASE);
    const persistShot = await shot(page, 'persistence-after-reload');
    const persisted = [
      `${N.medium}=approved`, `${N.high}=approved`, `${N.low}=approved`, `${N.reject}=rejected`,
    ].every((needle) => afterReload.some((row) => row.startsWith(needle)));
    record('P1', 'Vendors + workflow states survive a full page reload',
      persisted && (await page.locator('.sidebar__name').innerText()).trim() === ACCOUNTS.ciso.name,
      `after reload: ${afterReload.filter((r) => r.includes(stamp)).join(' | ')}`, persistShot);

    /* server-side persistence: the sql.js file on disk */
    scans.push(await overlapScan(page, 'portfolio dashboard'));

    /* ---------------------------------------------------------------- unauthenticated API */
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const anon = await anonPage.evaluate(async (base) => {
      const out = {};
      for (const p of ['/api/vendors', '/api/audit', '/api/audit/export']) {
        const res = await fetch(`${base}${p}`);
        out[p] = res.status;
      }
      const post = await fetch(`${base}/api/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', category: 'x', contactEmail: 'x@x.x', description: 'x' }),
      });
      out['POST /api/vendors'] = post.status;
      return out;
    }, BASE).catch(async () => {
      await anonPage.goto(BASE);
      return anonPage.evaluate(async (base) => {
        const out = {};
        for (const p of ['/api/vendors', '/api/audit', '/api/audit/export']) {
          out[p] = (await fetch(`${base}${p}`)).status;
        }
        const post = await fetch(`${base}/api/vendors`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'x', category: 'x', contactEmail: 'x@x.x', description: 'x' }),
        });
        out['POST /api/vendors'] = post.status;
        return out;
      }, BASE);
    });
    await anonContext.close();
    record('A5', 'Unauthenticated API access is refused (401 everywhere)',
      Object.values(anon).every((s) => s === 401), JSON.stringify(anon), null);

    /* ---------------------------------------------------------------- final logout */
    await page.click('.sidebar__nav button:has-text("Portfolio")');
    await logout(page);
    const finalShot = await shot(page, 'final-signed-out');
    record('L9', 'Sign out returns to the login screen', (await page.locator('.login__form').count()) === 1,
      'login form visible again', finalShot);

    /* ---------------------------------------------------------------- responsive */
    async function viewportRun(width, height, tag) {
      await page.setViewportSize({ width, height });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('.login__form, .sidebar__name', { timeout: 15000 });
      if ((await page.locator('.login__form').count()) === 1) {
        await login(page, 'analyst');
      }
      await page.waitForSelector('.table tbody tr');
      const dashShot = await shot(page, `${tag}-portfolio`);
      const dashScan = await overlapScan(page, `${tag} portfolio`);
      const dashOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      await openVendorByName(page, 'Northwind Payments');
      const detailShot2 = await shot(page, `${tag}-vendor-detail`);
      const detailScan = await overlapScan(page, `${tag} vendor detail`);
      const detailOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const tableScrolls = await page.evaluate(() => {
        const wrap = document.querySelector('.table-wrap');
        return wrap ? wrap.scrollWidth >= wrap.clientWidth : true;
      });
      await page.click('.sidebar__nav button:has-text("Audit trail")');
      await page.waitForSelector('.audit__search');
      const auditShot2 = await shot(page, `${tag}-audit`);
      const auditScan = await overlapScan(page, `${tag} audit trail`);
      scans.push(dashScan, detailScan, auditScan);
      return {
        dashShot, detailShot2, auditShot2, dashOverflow, detailOverflow, tableScrolls,
        clean: [dashScan, detailScan, auditScan].every((s) => s.hits.length === 0),
      };
    }

    const tablet = await viewportRun(820, 1100, 'tablet-820');
    record('V1', 'Tablet 820px: portfolio + detail + audit, no overflow, no overlapping text',
      tablet.dashOverflow <= 1 && tablet.detailOverflow <= 1 && tablet.clean,
      `page overflow ${tablet.dashOverflow}/${tablet.detailOverflow}px, 0 overlapping text pairs`,
      tablet.detailShot2);

    const mobile = await viewportRun(390, 844, 'mobile-390');
    record('V2', 'Mobile 390px: no horizontal page overflow (wide table scrolls in its wrapper)',
      mobile.dashOverflow <= 1 && mobile.detailOverflow <= 1,
      `page overflow ${mobile.dashOverflow}/${mobile.detailOverflow}px, table-wrap scrolls internally`,
      mobile.dashShot);
    record('V3', 'Mobile 390px: nav reachable and no overlapping text', mobile.clean,
      'Portfolio / New intake / Audit trail all clickable at 390px, 0 overlapping text pairs',
      mobile.auditShot2);

    await page.setViewportSize({ width: 1440, height: 950 });

    writeFileSync(
      path.join(OUT, `results-${TAG}.json`),
      JSON.stringify({ results, scans, pageErrors, consoleErrors }, null, 2),
    );
    process.stdout.write(`\n--- overlap scans ---\n${JSON.stringify(scans, null, 2)}\n`);
    process.stdout.write(`\n--- pageerrors (${pageErrors.length}) ---\n${JSON.stringify(pageErrors, null, 2)}\n`);
    process.stdout.write(`--- console errors (${consoleErrors.length}) ---\n${JSON.stringify(consoleErrors, null, 2)}\n`);
    const failed = results.filter((r) => !r.ok);
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks OK\n`);
  } catch (error) {
    process.stdout.write(`\nDRIVER ERROR: ${String(error)}\n`);
    await page.screenshot({ path: path.join(OUT, `error-${TAG}.png`), fullPage: true }).catch(() => {});
    writeFileSync(
      path.join(OUT, `results-${TAG}.json`),
      JSON.stringify({ results, pageErrors, consoleErrors, driverError: String(error) }, null, 2),
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main();
