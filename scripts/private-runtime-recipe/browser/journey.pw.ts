import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';
// eslint-disable-next-line no-restricted-imports -- Node CLI uses repository modules without the web-only ~/ alias.
import { assertRecipeClusterName } from '../checks.js';
import { browserFixtureArchive, editedMarker, fixtureHtml, originalMarker } from './fixture.js';

function passed(phase: string) {
  mkdirSync('private-runtime-evidence', { recursive: true });
  appendFileSync('private-runtime-evidence/browser-progress.jsonl', JSON.stringify({ phase, status: 'passed' }) + '\n');
}

async function restrictBrowser(context: BrowserContext, attemptedAI: string[]) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (/^\/api\/(chat|generate|agent\/run)(\/|$)/.test(url.pathname)) {
      attemptedAI.push(url.pathname);
      await route.abort('blockedbyclient');

      return;
    }

    if (!['http://127.0.0.1:5173', 'http://127.0.0.1:3001'].includes(url.origin)) {
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });
}

test('real UI registration, login, ZIP project, saved file and private preview', async ({ page, browser, baseURL }) => {
  assert.equal(process.env.PRIVATE_RUNTIME_BROWSER_RECIPE, '1');
  assertRecipeClusterName(process.env.PRIVATE_RUNTIME_RECIPE_ID ?? '');
  assert.equal(baseURL, 'http://127.0.0.1:5173');

  const suffix = randomBytes(8).toString('hex');
  const email = `browser-${suffix}@local.test`;
  const password = `Browser-${randomBytes(16).toString('hex')}!`;
  const attemptedAI: string[] = [];

  let realRuntimeResponses = 0;
  await restrictBrowser(page.context(), attemptedAI);

  await page.goto('/register?lang=en');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  passed('registration-ui');

  // A new browser session proves the login form; no token/cookie injection.
  const loginContext = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1440, height: 1000 } });

  try {
    await restrictBrowser(loginContext, attemptedAI);
    loginContext.on('response', (response) => {
      const url = new URL(response.url());

      if (
        url.origin === 'http://127.0.0.1:3001' &&
        url.pathname.startsWith('/api/runtime/workspaces') &&
        response.ok()
      ) {
        realRuntimeResponses += 1;
      }
    });

    const app = await loginContext.newPage();
    await app.goto('/login?lang=en');
    await app.locator('input[name="email"]').fill(email);
    await app.locator('input[name="password"]').fill(password);
    await app.locator('button[type="submit"]').click();
    await expect(app).toHaveURL(/\/dashboard(?:\?|$)/);
    passed('login-ui-fresh-session');

    await app.goto('/import-zip?lang=en');
    await app.locator('input[type="file"]').setInputFiles({
      name: 'private-browser.zip',
      mimeType: 'application/zip',
      buffer: await browserFixtureArchive(),
    });
    await app.locator('input[name="name"]').fill(`Private browser ${suffix}`);
    await app.locator('button[type="submit"]').click();
    await expect(app).toHaveURL(/\/ide(?:\?|$)/, { timeout: 120_000 });
    passed('project-created-by-zip-ui');

    const ide = new URL(app.url());
    ide.searchParams.set('panel', 'files');
    await app.goto(ide.toString());
    await expect(app.getByRole('button', { name: /Workspace:\s*running/i })).toBeVisible({ timeout: 180_000 });

    // Existing file-tree nodes put the text on the named span itself.
    const indexFile = app
      .getByText('index.html', { exact: true })
      .and(app.locator('.bolt-file-tree-name'))
      .filter({ visible: true });
    await indexFile.click();

    const editor = app.locator('.monaco-editor').filter({ visible: true }).first();
    await expect(editor.locator('.view-lines')).toContainText(originalMarker);

    const persisted = app.waitForResponse(
      (response) =>
        response.request().method() !== 'GET' &&
        /\/api\/(runtime\/workspaces\/[^/]+\/files|projects\/[^/]+\/files)/.test(new URL(response.url()).pathname) &&
        response.ok(),
    );
    await editor.locator('textarea.inputarea').focus();
    await app.keyboard.press('Control+A');
    await app.keyboard.insertText(fixtureHtml(editedMarker));
    await app.keyboard.press('Control+S');
    await persisted;
    await expect(editor.locator('.view-lines')).toContainText(editedMarker);
    passed('file-edited-and-saved-in-monaco');
    await app.reload({ waitUntil: 'domcontentloaded' });
    await indexFile.click();
    await expect(app.locator('.monaco-editor .view-lines').filter({ visible: true }).first()).toContainText(
      editedMarker,
    );
    passed('saved-file-survives-ui-reload');

    await app.getByRole('button', { name: 'Webview', exact: true }).click();
    await expect(app.locator('iframe[title="preview"]').first()).toBeVisible({ timeout: 180_000 });
    await expect(app.frameLocator('iframe[title="preview"]').locator('#proof')).toHaveText(editedMarker, {
      timeout: 180_000,
    });
    expect(attemptedAI).toEqual([]);
    expect(realRuntimeResponses).toBeGreaterThan(0);
    passed('real-private-preview-content');
    await app.screenshot({ path: 'private-runtime-evidence/browser-preview.png' });
  } finally {
    await loginContext.close();
  }
});
