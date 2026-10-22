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
    /*
     * BUDGET MESURÉ, PAS ARBITRAIRE.
     *
     * Ce test échouait par intermittence sur `Test timeout of 30000ms
     * exceeded`, en bloquant sur une PRÉCONDITION — l'ouverture de la palette
     * de commandes — sans jamais atteindre ses assertions métier.
     *
     * Durées relevées le 2026-09-01 sur un même run CI :
     *     12,5 s / 19,9 s / 30,1 s (expiration)
     * contre un budget global de 30 s (`playwright.config.ts`). La marge
     * n'était que de ×1,5 : dépasser 30 s sous contention CI est
     * ATTENDU, pas exceptionnel.
     *
     * C'est la différence avec `dashboard.spec.ts` (#338), où la marge était
     * de ×10 et où gonfler le budget aurait MASQUÉ un vrai blocage. Ici le
     * budget est réellement trop serré pour le travail effectué, et le
     * relever est la correction mesurée.
     *
     * Aucune assertion n'est touchée : seul le temps alloué change.
     */
    test.setTimeout(90_000);

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

      /*
       * Attente EXPLICITE du champ de recherche, avec son propre message.
       *
       * `fill()` attend déjà l'élément, mais son échec sort en
       * « locator.fill: Test timeout of 30000ms exceeded » — qui ne dit ni
       * QUEL élément manquait, ni que la palette, elle, s'était bien ouverte.
       * C'est ce message opaque qui a fait chercher la cause du mauvais côté.
       *
       * La palette est visible à ce stade (assertion juste au-dessus) ; son
       * champ se monte un instant après. On attend donc ce montage
       * explicitement, et une absence RÉELLE échoue en le nommant.
       */
      await expect(search, 'la palette est ouverte mais son champ de recherche ne se monte pas').toBeVisible({
        timeout: 15_000,
      });

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

      const tabIdsBefore = await page
        .locator('.bolt-project-pane-leaf [role="tab"]')
        .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-tab-id')).sort());
      await openOptionsMenu(page, 0);
      expect(await paneTabPanels(page), 'focusing a pane menu must not reopen the URL tool').toEqual(beforeMove);

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

        const tabIdsAfter = await page
          .locator('.bolt-project-pane-leaf [role="tab"]')
          .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-tab-id')).sort());
        expect(tabIdsAfter, 'moving and restoring focus must preserve the existing tab identities').toEqual(
          tabIdsBefore,
        );
        expect(
          JSON.stringify(afterMove),
          'the tab must actually have changed pane (a swap would keep counts identical)',
        ).not.toBe(JSON.stringify(beforeMove));
      }
    }

    await assertNoHorizontalOverflow(page);
    await shot(page, `panels-final-${label}`);

    // Explicit tool requests still target the pane most recently focused.
    const targetPane = page.locator('.bolt-project-pane-leaf').last();
    const targetPaneId = await targetPane.getAttribute('data-pane-id');
    await targetPane.locator('[role="tab"]').first().click();
    await dockAllTools.click();

    const toolSearch = page.locator('[data-testid="project-command-palette-search"]');
    await expect(toolSearch).toBeVisible();
    await toolSearch.fill('terminal');
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-pane-id="${targetPaneId}"] [role="tab"][data-panel="terminal"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // A genuine URL request must still open/select its tool after focus changes.
    await page.goto(`/projects/${projectId}/ide?panel=git`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="git"][aria-selected="true"]'),
    ).toHaveCount(1);
    await shot(page, `panels-url-navigation-${label}`);
  });
}

test('interrupted move navigation cannot swallow a later browser Back', async ({ page }, testInfo) => {
  test.setTimeout(90_000);

  const auth = await authenticate(page);
  const projectId = await seedProject(page, auth, 'light');
  await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"][aria-selected="true"]'),
  ).toHaveCount(1);
  await page.getByTestId('ide-dock-deployments').click();
  await expect(page).toHaveURL(/panel=deployments/);
  await openOptionsMenu(page, 0);
  await page.locator('[data-testid="tab-options-split-right"]').click();
  await expect(page.locator('.bolt-project-pane-leaf')).toHaveCount(2);

  const preview = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"]');
  const previewId = await preview.getAttribute('data-tab-id');
  const before = await paneTabPanels(page);

  let release!: () => void;
  let observed!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    observed = resolve;
  });

  const failed: { url: string; error: string | null }[] = [];
  page.on('requestfailed', (request) => {
    if (request.url().includes('.data') && new URL(request.url()).searchParams.get('panel') === 'preview') {
      failed.push({
        url: new URL(request.url()).pathname + new URL(request.url()).search,
        error: request.failure()?.errorText ?? null,
      });
    }
  });
  await page.route('**/*.data?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('panel') !== 'preview') {
      await route.continue();
      return;
    }

    observed();
    await gate;

    try {
      await route.continue();
    } catch (error) {
      if (failed.length === 0) {
        throw error;
      }
    }
  });

  try {
    await openOptionsMenu(page, 0);
    await page.locator('[data-testid="tab-options-move-to-pane-0"]').click();
    await seen;

    const deployment = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="deployments"]');
    await deployment.locator('.bolt-project-tab-main').click();
    await expect(deployment).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/panel=deployments/);
    await expect
      .poll(() => failed.length, { message: 'preview navigation must actually be aborted' })
      .toBeGreaterThan(0);
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await testInfo.attach('interruption.json', {
      body: JSON.stringify({ before, after: await paneTabPanels(page), failed, previewId }),
      contentType: 'application/json',
    });
    await page.goBack({ waitUntil: 'domcontentloaded' });

    if (new URL(page.url()).searchParams.get('panel') === 'deployments') {
      await page.goBack({ waitUntil: 'domcontentloaded' });
    }

    await expect(page).toHaveURL(/panel=preview/);
    await expect(page.locator(`[data-tab-id="${previewId}"]`)).toHaveAttribute('aria-selected', 'true');
    await shot(page, 'interrupted-back-preview');
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/panel=deployments/);
    await expect(deployment).toHaveAttribute('aria-selected', 'true');
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

const panes = (page: Page) => page.locator('.bolt-project-pane-leaf');
const tabs = (page: Page) => panes(page).locator('[role="tab"]');
const tabById = (page: Page, id: string) => page.locator(`.bolt-project-pane-leaf [role="tab"][data-tab-id="${id}"]`);

const tabIds = (page: Page) =>
  tabs(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tab-id')).sort());

async function openTool(page: Page, query: string) {
  await page.getByTestId('ide-dock-all-tools').click();

  const search = page.getByTestId('project-command-palette-search');
  await expect(search).toBeVisible();
  await search.fill(query);
  await page.keyboard.press('Enter');
}

async function redundantMove(page: Page) {
  const auth = await authenticate(page);
  const projectId = await seedProject(page, auth, 'light');
  await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"][aria-selected="true"]'),
  ).toHaveCount(1);
  await page.getByTestId('ide-dock-deployments').click();
  await expect(page).toHaveURL(/panel=deployments/);
  await openOptionsMenu(page, 0);
  await page.getByTestId('tab-options-split-right').click();
  await expect(panes(page)).toHaveCount(2);

  const preview = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"]');
  await expect(preview).toHaveCount(1);

  const previewId = await preview.getAttribute('data-tab-id');
  expect(previewId).toBeTruthy();
  await preview.locator('.bolt-project-tab-main').click();
  await expect(page).toHaveURL(/panel=preview/);
  await expect(preview).toHaveAttribute('aria-selected', 'true');

  const before = await tabIds(page);
  const targetId = await panes(page).nth(1).getAttribute('data-pane-id');
  expect(targetId).toBeTruthy();
  await openOptionsMenu(page, 0);
  await page.getByTestId('tab-options-move-to-pane-0').click();
  await expect(panes(page).nth(0).locator(`[data-tab-id="${previewId}"]`)).toHaveCount(0);
  await expect(panes(page).nth(1).locator(`[data-tab-id="${previewId}"]`)).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => tabIds(page)).toEqual(before);
  await expect(page).toHaveURL(/panel=preview/);

  return { projectId, previewId: previewId!, targetId: targetId!, before };
}

test('redundant move preserves real browser Back and Forward selection', async ({ page }, info) => {
  test.setTimeout(90_000);

  const state = await redundantMove(page);
  const deployment = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="deployments"]');
  await deployment.locator('.bolt-project-tab-main').click();
  await expect(page).toHaveURL(/panel=deployments/);
  await expect(deployment).toHaveAttribute('aria-selected', 'true');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/panel=preview/);
  await expect(tabById(page, state.previewId)).toHaveAttribute('aria-selected', 'true');
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/panel=deployments/);
  await expect(deployment).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => tabIds(page)).toEqual(state.before);
  await info.attach('navigation-basic.json', {
    body: JSON.stringify({ scenario: 'back-forward', before: state.before, after: await tabIds(page) }),
    contentType: 'application/json',
  });
  await shot(page, 'back-forward');
});

test('closing moved tab invalidates its receipt before a browser Back request', async ({ page }, info) => {
  test.setTimeout(90_000);

  const state = await redundantMove(page);
  const moved = tabById(page, state.previewId);

  if ((await moved.getAttribute('data-pinned')) === 'true') {
    await openOptionsMenu(page, 1);
    await page.getByTestId('tab-options-pin').click();
    await expect(moved).not.toHaveAttribute('data-pinned', 'true');
  }

  await moved.locator('button.bolt-project-tab-close').click();
  await expect(moved).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(state.before.length - 1);
  await expect(page).not.toHaveURL(/panel=preview/);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/panel=preview/);

  const reopened = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"]');
  await expect(reopened).toHaveCount(1);
  await expect(reopened).toHaveAttribute('aria-selected', 'true');
  expect(await reopened.getAttribute('data-tab-id')).not.toBe(state.previewId);
  await expect(moved).toHaveCount(0);
  await info.attach('navigation-basic.json', {
    body: JSON.stringify({
      scenario: 'close-tab',
      closed: state.previewId,
      reopened: await reopened.getAttribute('data-tab-id'),
    }),
    contentType: 'application/json',
  });
  await shot(page, 'closed-tab-back');
});

test('closing destination pane cannot swallow a later browser Back request', async ({ page }, info) => {
  test.setTimeout(90_000);

  const state = await redundantMove(page);
  const destination = page.locator(`.bolt-project-pane-leaf[data-pane-id="${state.targetId}"]`);

  const removed = await destination
    .locator('[role="tab"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tab-id')));
  await openOptionsMenu(page, 1);
  await page.getByTestId('tab-options-close-pane').click();
  await expect(destination).toHaveCount(0);
  await expect(panes(page)).toHaveCount(1);

  for (const id of removed) {
    await expect(tabById(page, id!)).toHaveCount(0);
  }
  await openTool(page, 'terminal');
  await expect(page).toHaveURL(/panel=terminal/);
  await expect(
    page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="terminal"][aria-selected="true"]'),
  ).toHaveCount(1);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/panel=preview/);
  await expect(
    page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"][aria-selected="true"]'),
  ).toHaveCount(1);

  for (const id of removed) {
    await expect(tabById(page, id!)).toHaveCount(0);
  }
  await info.attach('navigation-basic.json', {
    body: JSON.stringify({ scenario: 'close-pane', removed, after: await tabIds(page) }),
    contentType: 'application/json',
  });
  await shot(page, 'closed-pane-back');
});

test('two moves during one pending panel navigation preserve tab identities', async ({ page }, testInfo) => {
  test.setTimeout(90_000);

  const auth = await authenticate(page);
  const projectId = await seedProject(page, auth, 'light');
  await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"][aria-selected="true"]'),
  ).toHaveCount(1);
  await page.getByTestId('ide-dock-deployments').click();
  await expect(page).toHaveURL(/panel=deployments/);
  await openOptionsMenu(page, 0);
  await page.getByTestId('tab-options-split-right').click();

  const panes = page.locator('.bolt-project-pane-leaf');
  await expect(panes).toHaveCount(2);

  const preview = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"]');
  await expect(preview).toHaveCount(1);

  const previewId = await preview.getAttribute('data-tab-id');
  expect(previewId).toBeTruthy();

  const ids = () =>
    panes.locator('[role="tab"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tab-id')).sort());

  const beforeIds = await ids();
  const before = await paneTabPanels(page);

  let release!: () => void;
  let observed!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    observed = resolve;
  });

  const requests: { path: string; result: string }[] = [];

  let afterFirst: string[][] | undefined;
  let afterSecond: string[][] | undefined;
  await page.route('**/*.data?*', async (route) => {
    const url = new URL(route.request().url());

    if (url.searchParams.get('panel') !== 'preview') {
      await route.continue();
      return;
    }

    requests.push({ path: url.pathname + url.search, result: 'held pending real continuation' });
    observed();
    await gate;

    try {
      await route.continue();
    } catch {
      requests.push({ path: url.pathname + url.search, result: 'continuation unavailable after cancellation' });
    }
  });

  try {
    // First move: URL remains Q while the actual P request is held in flight.
    await openOptionsMenu(page, 0);
    await page.getByTestId('tab-options-move-to-pane-0').click();
    await seen;
    await expect(panes.nth(1).locator(`[data-tab-id="${previewId}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(panes.nth(0).locator(`[data-tab-id="${previewId}"]`)).toHaveCount(0);
    await expect(page).toHaveURL(/panel=deployments/);
    afterFirst = await paneTabPanels(page);

    // Second move uses the destination menu, without another tab-selection request.
    await openOptionsMenu(page, 1);
    await page.getByTestId('tab-options-move-to-pane-0').click();
    await expect(panes.nth(0).locator(`[data-tab-id="${previewId}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(panes.nth(1).locator(`[data-tab-id="${previewId}"]`)).toHaveCount(0);
    await expect.poll(ids).toEqual(beforeIds);
    await expect(page).toHaveURL(/panel=deployments/);
    afterSecond = await paneTabPanels(page);
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page).toHaveURL(/panel=preview/);
    await shot(page, 'double-move-after-navigation');
    await expect(panes.locator('[role="tab"]')).toHaveCount(beforeIds.length);
    await expect.poll(ids).toEqual(beforeIds);
    await expect(panes.nth(0).locator(`[data-tab-id="${previewId}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(panes.nth(1).locator(`[data-tab-id="${previewId}"]`)).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await testInfo.attach('double-move.json', {
      body: JSON.stringify(
        {
          beforeIds,
          before,
          afterFirst,
          afterSecond,
          afterNavigation: await paneTabPanels(page),
          afterIds: await ids(),
          requests,
          previewId,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  }
});

test('normal click navigation followed by a move preserves tab identities', async ({ page }, testInfo) => {
  test.setTimeout(90_000);

  const auth = await authenticate(page);
  const projectId = await seedProject(page, auth, 'light');
  await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"][aria-selected="true"]'),
  ).toHaveCount(1);
  await page.getByTestId('ide-dock-deployments').click();
  await expect(page).toHaveURL(/panel=deployments/);
  await openOptionsMenu(page, 0);
  await page.getByTestId('tab-options-split-right').click();

  const panes = page.locator('.bolt-project-pane-leaf');
  await expect(panes).toHaveCount(2);

  const preview = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="preview"]');
  await expect(preview).toHaveCount(1);

  const previewId = await preview.getAttribute('data-tab-id');
  expect(previewId).toBeTruthy();

  const ids = () =>
    panes.locator('[role="tab"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tab-id')).sort());

  const beforeIds = await ids();
  const before = await paneTabPanels(page);

  let release!: () => void;
  let observed!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    observed = resolve;
  });

  const requests: { path: string; result: string }[] = [];

  let afterFirst: string[][] | undefined;
  let afterSecond: string[][] | undefined;
  await page.route('**/*.data?*', async (route) => {
    const url = new URL(route.request().url());

    if (url.searchParams.get('panel') !== 'preview') {
      await route.continue();
      return;
    }

    requests.push({ path: url.pathname + url.search, result: 'held pending real continuation' });
    observed();
    await gate;

    try {
      await route.continue();
    } catch {
      requests.push({ path: url.pathname + url.search, result: 'continuation unavailable after cancellation' });
    }
  });

  try {
    // Begin an ordinary tab selection: its URL navigation has no move receipt.
    await preview.locator('.bolt-project-tab-main').click();
    await seen;
    await expect(panes.nth(0).locator(`[data-tab-id="${previewId}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/panel=deployments/);
    afterFirst = await paneTabPanels(page);

    // Move that selected tab before its actual URL request is released.
    await openOptionsMenu(page, 0);
    await page.getByTestId('tab-options-move-to-pane-0').click();
    await expect(panes.nth(1).locator(`[data-tab-id="${previewId}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(panes.nth(0).locator(`[data-tab-id="${previewId}"]`)).toHaveCount(0);
    await expect.poll(ids).toEqual(beforeIds);
    await expect(page).toHaveURL(/panel=deployments/);
    afterSecond = await paneTabPanels(page);
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page).toHaveURL(/panel=preview/);
    await shot(page, 'normal-click-move-after-navigation');
    await expect(panes.locator('[role="tab"]')).toHaveCount(beforeIds.length);
    await expect.poll(ids).toEqual(beforeIds);
    await expect(panes.nth(1).locator(`[data-tab-id="${previewId}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(panes.nth(0).locator(`[data-tab-id="${previewId}"]`)).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await testInfo.attach('double-move.json', {
      body: JSON.stringify(
        {
          beforeIds,
          before,
          afterFirst,
          afterSecond,
          afterNavigation: await paneTabPanels(page),
          afterIds: await ids(),
          requests,
          previewId,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  }
});

test('an interrupted Back move cannot swallow a later Back to the same history entry', async ({ page }, info) => {
  test.setTimeout(90_000);

  const state = await redundantMove(page);
  const preview = tabById(page, state.previewId);
  const previewHistoryKey = await page.evaluate(() => window.history.state?.key);
  const deployment = page.locator('.bolt-project-pane-leaf [role="tab"][data-panel="deployments"]');
  await deployment.locator('.bolt-project-tab-main').click();
  await expect(page).toHaveURL(/panel=deployments/);
  await openOptionsMenu(page, 1);
  await page.getByTestId('tab-options-move-to-pane-0').click();
  await expect(panes(page).nth(0).locator('[role="tab"][data-panel="deployments"]')).toHaveCount(1);
  await expect(preview).toHaveAttribute('aria-selected', 'true');

  let release!: () => void;
  let observed!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const failed: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.url().includes('.data') && new URL(request.url()).searchParams.get('panel') === 'preview') {
      failed.push(request.failure()?.errorText ?? 'unknown');
    }
  });
  await page.route('**/*.data?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('panel') !== 'preview') {
      await route.continue();
      return;
    }

    observed();
    await gate;

    try {
      await route.continue();
    } catch (error) {
      if (!failed.length) {
        throw error;
      }
    }
  });

  try {
    const back = page.goBack({ waitUntil: 'domcontentloaded' });
    await seen;
    await expect.poll(() => page.evaluate(() => window.history.state?.key)).toBe(previewHistoryKey);
    await openOptionsMenu(page, 1);
    await page.getByTestId('tab-options-move-to-pane-0').click();
    await expect(panes(page).nth(0).locator(`[data-tab-id="${state.previewId}"]`)).toHaveCount(1);
    await expect.poll(() => tabIds(page)).toEqual(state.before);

    // Cancel the POP by returning to the still-applied entry, without adding an entry.
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/panel=deployments/);
    await expect.poll(() => failed.length).toBeGreaterThan(0);
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await back;
    await deployment.locator('.bolt-project-tab-main').click();
    await expect(deployment).toHaveAttribute('aria-selected', 'true');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/panel=preview/);
    await expect.poll(() => page.evaluate(() => window.history.state?.key)).toBe(previewHistoryKey);
    await expect(preview).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => tabIds(page)).toEqual(state.before);
    await shot(page, 'interrupted-pop-back');
    await info.attach('interrupted-pop.json', {
      body: JSON.stringify({ before: state.before, after: await tabIds(page), previewHistoryKey, failed }),
      contentType: 'application/json',
    });
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
