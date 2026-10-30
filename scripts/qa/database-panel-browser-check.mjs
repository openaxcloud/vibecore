/** Actual browser -> web panel proxy -> Fastify -> PostgreSQL. Local fixture only. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import pg from 'pg';

const fixture = JSON.parse(await readFile('/tmp/database-browser-fixture.json', 'utf8'));
const web = process.env.DATABASE_QA_WEB_URL ?? 'http://127.0.0.1:5174';
assert.equal(new URL(web).hostname, '127.0.0.1');
assert.equal(new URL(fixture.dataUrl).hostname, '127.0.0.1');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
await context.addCookies([{ name: 'vc_session', value: fixture.token, url: web, httpOnly: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.setDefaultTimeout(20000);
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const results = [];
const data = new pg.Client({ connectionString: fixture.dataUrl });
try {
  await data.connect();
  await data.query(`UPDATE "${fixture.schemas[0]}"."Contact List" SET "Display Name" = CASE WHEN "Id" = 1 THEN 'Synthetic A' ELSE 'Second synthetic contact' END`);
  await page.goto(`${web}/projects/${fixture.projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByTestId('db-carte').first().click({ timeout: 90000 });
  await page.getByRole('tab', { name: 'My data', exact: true }).click();
  await page.getByTestId('studio-table').first().click({ timeout: 30000 });
  await page.getByText('Synthetic A', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const field = page.locator('.bolt-database-studio-results input[value="Synthetic A"]');
  await field.fill('Browser saved');
  await field.blur();
  await page.getByRole('button', { name: 'Run statement', exact: true }).click();
  await page.getByText('1 row(s) changed', { exact: true }).waitFor();
  const persisted = await data.query(`SELECT "Display Name" FROM "${fixture.schemas[0]}"."Contact List" ORDER BY "Id"`);
  assert.deepEqual(persisted.rows.map((row) => row['Display Name']), ['Browser saved', 'Second synthetic contact']);
  const other = await data.query(`SELECT "Display Name" FROM "${fixture.schemas[1]}"."Contact List" WHERE "Id" = 1`);
  assert.equal(other.rows[0]['Display Name'], 'Synthetic B');
  await page.getByTestId('studio-table').first().click();
  await page.getByText('Browser saved', { exact: true }).waitFor();
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    if (!await page.locator('.bolt-database-studio').count()) {
      await page.getByTestId('db-carte').first().click();
      await page.getByRole('tab', { name: 'My data', exact: true }).click();
      await page.getByTestId('studio-table').first().click();
      await page.getByText('Browser saved', { exact: true }).waitFor();
    }
    await page.locator('.bolt-database-studio-results[aria-busy="false"]').waitFor();
    const metrics = await page.locator('.bolt-database-studio').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const sql = node.querySelector('textarea').getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth, sqlWidth: sql.width, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    await page.screenshot({ path: `docs/reprise/2026-10-30-database-preuves/${name}.png`, fullPage: true });
    await page.getByText('Browser saved', { exact: true }).scrollIntoViewIfNeeded();
    const row = await page.getByText('Browser saved', { exact: true }).boundingBox();
    assert.ok(row && row.y >= 0 && row.y + row.height < height - 70, `${name}: data row obscured`);
    await page.screenshot({ path: `docs/reprise/2026-10-30-database-preuves/${name}-data.png`, fullPage: true });
    results.push({ name, viewportWidth: width, height, ...metrics, dataRowVisible: true });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Reopening goes through a fresh panel request, not the old query result.
  await page.getByTestId('db-carte').first().click({ timeout: 30000 });
  await page.getByRole('tab', { name: 'My data', exact: true }).click();
  await page.getByTestId('studio-table').first().click();
  await page.getByText('Browser saved', { exact: true }).waitFor();
  await writeFile('docs/reprise/2026-10-30-database-preuves/browser.json', JSON.stringify({ realPostgresWrite: true, otherRowUnchanged: true, otherSchemaUnchanged: true, reopenedRead: true, pageErrors, viewports: results }, null, 2));
  assert.deepEqual(pageErrors, []);
  for (const result of results) assert.ok(!result.pageOverflow && result.right <= result.viewport + 1 && result.left >= 0 && result.sqlWidth > 100, JSON.stringify(result));
  console.log('PASS: browser write, independent PostgreSQL read, reopen, and three viewport bounds');
} finally {
  await data.end();
  await browser.close();
}
