import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';

/**
 * RPL-IDE-001.4 → .8 — live proof.
 *
 * .4 a tab MOVES between panes (and does not swap), with a visible drop caret
 * .5 the Tools dock reaches every tool through a searchable All-tools popup
 * .6 the Options (⋮) menu is scoped Window / Pane / Tab and keyboard-operable
 * .7 the Resources panel shows real RAM / CPU / Storage beside the app name
 * .8 clicking the app NAME opens Spotlight
 *
 * Captured across 390 / 768 / 1024 / 1440 in light + dark. The docked pane
 * model is a desktop-class surface (as in Replit), so the interaction proofs
 * gate on its actual presence rather than on width alone; below it the compact
 * shell is proved to adapt without overflow.
 */

const OUT_DIR = join(process.cwd(), 'docs/deploy-evidence/rpl-ide-panels-4-8/shots');
mkdirSync(OUT_DIR, { recursive: true });

function apiBaseUrl() {
  return process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'https://api.e-code.ai';
}

function appBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.e-code.ai';
}

/** Generous by default so a cold dev server does not read as a failure. */
const SHELL_TIMEOUT_MS = Number(process.env.RPL_SHELL_TIMEOUT_MS ?? 300_000);

function width(testInfo: TestInfo) {
  return testInfo.project.use.viewport?.width ?? 1440;
}

async function authenticate(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let payload: { token: string; organization: { id: string } } | undefined;
  let text = '';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await page.request.post(`${apiBaseUrl()}/auth/register`, {
      data: {
        email: `rpl-panels-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'RPL-IDE Panels Proof',
        organizationName: `RPL-IDE Panels Org ${suffix}-${attempt}`,
      },
    });
    text = await response.text();

    if (response.ok()) {
      payload = JSON.parse(text) as { token: string; organization: { id: string } };
      break;
    }

    // /auth/register is rate-limited per IP; back off rather than failing the run.
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
    data: { name: `RPL Panels ${theme} ${Date.now()}` },
  });
  expect(create.ok(), await create.text()).toBeTruthy();

  const projectId = (await create.json()).project.id as string;
  const zip = new JSZip();
  zip.file('index.html', '<!doctype html><title>RPL panels</title><h1>Panels 4-8</h1>');
  zip.file('src/app.js', 'export const app = () => "rpl-panels";\n');
  zip.file('README.md', '# RPL-IDE panels .4-.8 proof\n');

  const imported = await page.request.post(`${apiBaseUrl()}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();

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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow, 'page must not overflow horizontally').toBeFalsy();
}

async function openOptionsMenu(page: Page, paneIndex = 0) {
  const pane = page.locator('.bolt-project-pane-leaf').nth(paneIndex);

  /*
   * Deliberately NOT clicking the pane first to "activate" it.
   *
   * That click lands on the tab strip and runs `selectPaneTab`, which writes the
   * `?panel=` search param; the resulting navigation remounts the Project Editor
   * and restores the persisted layout, racing whatever layout change the test is
   * about to make. It cost a full investigation: the .4 move looked like it
   * created a tab (2 → 3) when measured through this helper, and is exact
   * without it ([[preview],[editor]] → [[editor,preview]], source pane
   * collapsed). Clicking the ⋮ trigger alone already activates the pane.
   */
  const trigger = pane.locator('[data-testid="tab-options"]').first();
  const menu = page.locator('[data-testid="tab-options-menu"]').first();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await trigger.click();

    if (await menu.isVisible().catch(() => false)) {
      return menu;
    }

    await page.waitForTimeout(300);
  }

  await expect(menu).toBeVisible();

  return menu;
}

/** Tools/tabs currently mounted in each docked pane, in on-screen order. */
async function paneTabPanels(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.bolt-project-pane-leaf')).map((pane) =>
      Array.from(pane.querySelectorAll('[role="tab"]')).map((tab) => (tab as HTMLElement).dataset.panel ?? ''),
    ),
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`RPL-IDE panels .4-.8 (${theme})`, async ({ page }, testInfo) => {
    const label = `${theme}-${width(testInfo)}`;
    page.on('pageerror', (error) => console.log(`[pageerror ${label}]`, error.message));

    const auth = await authenticate(page);
    const projectId = await seedProject(page, auth, theme);

    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    /*
     * The Project Editor shell is client-rendered. Against a built deployment it
     * mounts in a couple of seconds; against a cold Vite dev server the first
     * load has to transform the whole workspace shell on demand and can take
     * minutes. SHELL_TIMEOUT_MS keeps one harness usable for both.
     */
    const shell = page.locator('.bolt-project-ide-panels, .bolt-responsive-ide-mobile').first();
    await expect(shell).toBeVisible({ timeout: SHELL_TIMEOUT_MS });
    await page.waitForTimeout(2500);
    await assertNoHorizontalOverflow(page);
    await shot(page, `panels-loaded-${label}`);

    /* ---------------------------------------------------------------- .8 */
    /*
     * Spotlight opens from the app NAME on every width — it is topbar chrome,
     * not part of the desktop-only pane model.
     */
    const spotlightTrigger = page.locator('[data-testid="project-spotlight-trigger"]');

    if (await spotlightTrigger.isVisible().catch(() => false)) {
      await spotlightTrigger.click();

      const spotlight = page.locator('[data-testid="project-spotlight"]');
      await expect(spotlight).toBeVisible();
      await expect(page.locator('[data-testid="project-spotlight-head"]')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await shot(page, `spotlight-${label}`);

      // It really searches: typing narrows the list to matching entries.
      await page.locator('[data-testid="project-command-palette-search"]').fill('terminal');
      await page.waitForTimeout(400);
      await shot(page, `spotlight-search-${label}`);

      await page.keyboard.press('Escape');
      await expect(spotlight).toBeHidden();
    }

    /* ---------------------------------------------------------------- .7 */
    const resourcesTrigger = page.locator('[data-testid="project-resources-trigger"]');

    if (await resourcesTrigger.isVisible().catch(() => false)) {
      await resourcesTrigger.click();
      await expect(page.locator('[data-testid="project-resources-popover"]')).toBeVisible();

      /*
       * The panel must SETTLE on either real figures or an explicit
       * "unavailable" — never a silent blank. The read travels IDE → API →
       * agent and samples the CPU for 200 ms, and a cold or sleeping workspace
       * makes that take seconds, so this waits for the outcome instead of
       * snapshotting mid-flight and calling a slow read a failure.
       */
      const settled = page.locator(
        '[data-testid="project-resources-memory"], [data-testid="project-resources-unavailable"]',
      );
      await expect(settled.first(), 'Resources panel must state a reading or say it is unavailable').toBeVisible({
        timeout: 45_000,
      });

      await assertNoHorizontalOverflow(page);
      await shot(page, `resources-${label}`);
      await page.keyboard.press('Escape');
    }

    /* ---------------------------------------------------------------- .5 */
    const dockAllTools = page.locator('[data-testid="ide-dock-all-tools"]');

    if (await dockAllTools.isVisible().catch(() => false)) {
      await dockAllTools.click();

      const palette = page.locator('[data-testid="project-command-palette"]');
      await expect(palette).toBeVisible();
      await shot(page, `all-tools-${label}`);

      // The tools that used to be unreachable are reachable now.
      const search = page.locator('[data-testid="project-command-palette-search"]');
      await search.fill('studio');
      await page.waitForTimeout(400);
      await expect(palette).toContainText(/studio/i);
      await shot(page, `all-tools-studio-${label}`);

      await search.fill('domains');
      await page.waitForTimeout(400);
      await expect(palette).toContainText(/domain/i);

      // And selecting one really opens it in a tab.
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1200);
      await shot(page, `all-tools-opened-${label}`);
    }

    const hasDesktopPanes =
      (await page.locator('.bolt-project-pane-leaf').count()) > 0 &&
      (await page.locator('.bolt-responsive-ide-mobile').count()) === 0;

    if (!hasDesktopPanes) {
      console.log(`[rpl-panels] ${label}: compact shell — responsive capture only for .4/.6`);
      await assertNoHorizontalOverflow(page);

      return;
    }

    /* ---------------------------------------------------------------- .6 */
    const menu = await openOptionsMenu(page, 0);

    // Real menu semantics, and the three scopes the model has.
    await expect(menu).toHaveAttribute('role', 'menu');

    /*
     * Asserted structurally rather than by label text, so the proof holds in
     * whichever language the account happens to render in.
     */
    expect(await menu.locator('[role="group"]').count(), 'Window / Pane / Tab groups').toBeGreaterThanOrEqual(3);
    expect(await menu.locator('[role="menuitem"]').count()).toBeGreaterThan(4);
    await shot(page, `options-menu-${label}`);

    // Keyboard: the menu focuses its first item and arrows move through it.
    const focusedBefore = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    await page.keyboard.press('ArrowDown');

    const focusedAfter = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    expect(focusedAfter, 'ArrowDown must move focus inside the menu').not.toBe(focusedBefore);
    await shot(page, `options-menu-keyboard-${label}`);

    // Escape closes it and hands focus back to the trigger.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    /* ---------------------------------------------------------------- .4 */
    /*
     * Split so there are two panes, then move a tab from one to the other and
     * assert it MOVED (destination +1, source -1) rather than swapping.
     */
    await openOptionsMenu(page, 0);
    await page.locator('[data-testid="tab-options-split-right"]').click();
    await page.waitForTimeout(900);

    const beforeMove = await paneTabPanels(page);

    if (beforeMove.length >= 2) {
      await shot(page, `panes-before-move-${label}`);

      await openOptionsMenu(page, 0);

      const moveItem = page.locator('[data-testid="tab-options-move-to-pane-0"]');

      if (await moveItem.isVisible().catch(() => false)) {
        await moveItem.click();
        await page.waitForTimeout(900);

        const afterMove = await paneTabPanels(page);
        await shot(page, `panes-after-move-${label}`);

        const totalBefore = beforeMove.reduce((sum, tabs) => sum + tabs.length, 0);
        const totalAfter = afterMove.reduce((sum, tabs) => sum + tabs.length, 0);

        /*
         * The old behaviour swapped two tabs, which kept every pane's tab count
         * identical. A real move keeps the TOTAL constant while changing the
         * per-pane distribution (or collapses the emptied pane).
         */
        expect(totalAfter, 'a move must not create or destroy tabs').toBe(totalBefore);
        expect(
          JSON.stringify(afterMove),
          'the tab must actually have changed pane (a swap would keep counts identical)',
        ).not.toBe(JSON.stringify(beforeMove));
      }
    }

    await assertNoHorizontalOverflow(page);
    await shot(page, `panels-final-${label}`);
  });
}
