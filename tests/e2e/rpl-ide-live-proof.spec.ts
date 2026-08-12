import { expect, test, type Page, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * RPL-IDE-001.1/.2/.3 — live proof on prod.
 * .2 split horizontal AND vertical + resizable dividers
 * .3 pane float ↔ dock (origin restore)
 * .1 open-in-new-window (multi-screen)
 * Captured across 390 / 768 / 1024 / 1440 in light + dark.
 */

const OUT_DIR = join(process.cwd(), 'docs/deploy-evidence/2026-08-02-rpl-ide/shots');
mkdirSync(OUT_DIR, { recursive: true });

function apiBaseUrl() {
  return process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'https://api.e-code.ai';
}
function appBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.e-code.ai';
}
function width(testInfo: TestInfo) {
  return testInfo.project.use.viewport?.width ?? 1440;
}
function isDesktop(testInfo: TestInfo) {
  return width(testInfo) >= 1024;
}

async function authenticate(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let payload: { token: string; organization: { id: string } } | undefined;
  let text = '';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await page.request.post(`${apiBaseUrl()}/auth/register`, {
      data: {
        email: `rpl-ide-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'RPL-IDE Proof',
        organizationName: `RPL-IDE Proof Org ${suffix}-${attempt}`,
      },
    });
    text = await response.text();

    if (response.ok()) {
      payload = JSON.parse(text) as { token: string; organization: { id: string } };
      break;
    }

    if (response.status() === 429) {
      await page.waitForTimeout(1500 * (attempt + 1));
      continue;
    }

    expect(response.ok(), text).toBeTruthy();
  }

  expect(payload, text).toBeTruthy();

  return payload!;
}

async function seedProject(page: Page, auth: { token: string; organization: { id: string } }, theme: 'light' | 'dark') {
  const create = await page.request.post(`${apiBaseUrl()}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: `RPL-IDE ${theme} ${Date.now()}` },
  });
  expect(create.ok(), await create.text()).toBeTruthy();

  const projectId = (await create.json()).project.id as string;
  const zip = new JSZip();
  zip.file('index.html', '<!doctype html><title>RPL-IDE</title><h1>Window/Panes/Tabs</h1>');
  zip.file('src/app.js', 'export const app = () => "rpl-ide";\n');
  zip.file('README.md', '# RPL-IDE live proof\n');
  const imp = await page.request.post(`${apiBaseUrl()}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });
  expect(imp.ok(), await imp.text()).toBeTruthy();

  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: appBaseUrl(), httpOnly: true, sameSite: 'Lax' },
    { name: 'ecode_theme', value: theme, url: appBaseUrl(), sameSite: 'Lax' },
  ]);

  return projectId;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(overflow, 'page must not overflow horizontally').toBeFalsy();
}

async function paneActions(page: Page, paneIndex = 0) {
  const pane = page.locator('.bolt-project-pane-leaf').nth(paneIndex);
  await pane.scrollIntoViewIfNeeded().catch(() => {});
  // Activate the pane first, then open its actions menu — retry the open a few
  // times since a click can land mid-render on a freshly-split pane.
  await pane.click({ position: { x: 30, y: 8 } }).catch(() => {});

  /*
   * RPL-IDE-001.6 — the trigger's aria-label now names the active tab
   * ("Options for Webview"), so it can no longer be matched by exact text.
   * The test id is the stable handle.
   */
  const trigger = pane.locator('[data-testid="tab-options"]').first();
  const menu = page.locator('.bolt-project-tab-actions-menu').first();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await trigger.click();

    if (await menu.isVisible().catch(() => false)) {
      return;
    }

    await page.waitForTimeout(300);
  }

  await expect(menu).toBeVisible();
}

async function clickPaneAction(page: Page, paneIndex: number, name: string) {
  await paneActions(page, paneIndex);
  const item = page.locator('.bolt-project-tab-actions-menu').getByRole('button', { name, exact: true });
  await expect(item).toBeVisible();
  await item.click();
  await page.waitForTimeout(500);
}

for (const theme of ['light', 'dark'] as const) {
  test(`RPL-IDE live proof (${theme})`, async ({ page }, testInfo) => {
    const label = `${theme}-${width(testInfo)}`;
    page.on('pageerror', (e) => console.log(`[pageerror ${label}]`, e.message));

    const auth = await authenticate(page);
    const projectId = await seedProject(page, auth, theme);

    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    // The IDE chrome must mount on every width (desktop panels or compact shell).
    const panels = page.locator('.bolt-project-ide-panels, .bolt-responsive-ide-mobile').first();
    await expect(panels).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await assertNoHorizontalOverflow(page);
    await shot(page, `ide-loaded-${label}`);

    // The docked pane model is a desktop-class surface (as in Replit). Gate the
    // interactive proof on its actual presence, not width alone.
    const hasDesktopPanes =
      (await page.locator('.bolt-project-pane-leaf').count()) > 0 &&
      (await page.locator('.bolt-responsive-ide-mobile').count()) === 0;

    if (!hasDesktopPanes) {
      // Mobile/tablet compact shell: prove the IDE adapts (no overflow, not blank).
      expect(await page.locator('.bolt-project-pane-leaf, .bolt-responsive-ide-mobile').count()).toBeGreaterThan(0);
      console.log(`[rpl-ide] ${label}: compact shell (no docked panes) — responsive capture only`);

      return;
    }

    // --- .2 Split HORIZONTAL ---
    await clickPaneAction(page, 0, 'Split active right');
    await expect(page.locator('.bolt-project-pane-split[data-direction="horizontal"]').first()).toBeVisible();
    await expect.poll(() => page.locator('.bolt-project-pane-leaf').count()).toBeGreaterThanOrEqual(2);
    await shot(page, `split-horizontal-${label}`);

    // --- .2 Split VERTICAL (on the newly active pane) ---
    const paneCountBeforeV = await page.locator('.bolt-project-pane-leaf').count();
    await clickPaneAction(page, paneCountBeforeV - 1, 'Split active down');
    await expect(page.locator('.bolt-project-pane-split[data-direction="vertical"]').first()).toBeVisible();
    await expect.poll(() => page.locator('.bolt-project-pane-leaf').count()).toBeGreaterThanOrEqual(3);
    await shot(page, `split-vertical-${label}`);

    // --- .2 Resizable divider ---
    const handle = page.locator('[data-testid^="pane-resize-"]').first();
    await expect(handle).toBeVisible();
    const before = await page.locator('.bolt-project-pane-leaf').first().boundingBox();
    const hb = await handle.boundingBox();

    if (hb) {
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      await page.mouse.move(hb.x + hb.width / 2 + 140, hb.y + hb.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }

    const after = await page.locator('.bolt-project-pane-leaf').first().boundingBox();
    expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0)), 'divider drag resizes a pane').toBeGreaterThan(20);
    await shot(page, `split-resized-${label}`);

    // --- .3 Float a pane ---
    await clickPaneAction(page, 0, 'Float pane');
    const floating = page.locator('[data-testid^="floating-pane-"]').first();
    await expect(floating).toBeVisible();
    await shot(page, `pane-floating-${label}`);

    // drag the floating frame
    const header = floating.locator('.bolt-project-floating-pane-header');
    const fb = await header.boundingBox();

    if (fb) {
      await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
      await page.mouse.down();
      await page.mouse.move(fb.x + fb.width / 2 + 90, fb.y + fb.height / 2 + 70, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }

    await shot(page, `pane-floating-moved-${label}`);

    // --- .3 Dock back to origin ---
    await floating.locator('[data-testid^="dock-floating-pane-"]').click();
    await expect(page.locator('[data-testid^="floating-pane-"]')).toHaveCount(0);
    await expect(page.locator('.bolt-project-pane-split').first()).toBeVisible();
    await shot(page, `pane-docked-${label}`);

    // --- .1 Open in new window (multi-screen) ---
    const popupPromise = page.context().waitForEvent('page', { timeout: 20_000 });
    await clickPaneAction(page, 0, 'Open in new window');
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url(), 'new window carries its own peWindow id').toContain('peWindow=');
    await expect(popup.locator('.bolt-project-ide-panels, .bolt-responsive-ide-mobile').first()).toBeVisible({
      timeout: 30_000,
    });
    await popup.waitForTimeout(1000);
    await popup.screenshot({ path: join(OUT_DIR, `open-new-window-popup-${label}.png`) });
    await shot(page, `open-new-window-opener-${label}`);
    await popup.close();
  });
}
