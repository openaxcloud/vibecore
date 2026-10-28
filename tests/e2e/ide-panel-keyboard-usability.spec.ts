import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

async function createProject(page: Page, appBase: string) {
  const api = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${api}/auth/register`, {
    data: {
      email: `panel-keyboard-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Panel keyboard audit',
      organizationName: `Panel keyboard ${suffix}`,
    },
  });
  expect(registration.ok(), `Registration HTTP ${registration.status()}`).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'Panel keyboard audit' },
  });
  expect(creation.ok(), `Project creation HTTP ${creation.status()}`).toBeTruthy();

  const projectId = ((await creation.json()) as { project: { id: string } }).project.id;
  const archive = new JSZip();
  archive.file('README.md', '# Keyboard fixture\nSynthetic local terminal menu audit.\n');

  const imported = await page.request.post(`${api}/projects/${projectId}/files/import/zip`, {
    headers,
    data: { zipBase64: await archive.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok(), `Archive import HTTP ${imported.status()}`).toBeTruthy();

  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: appBase, httpOnly: true, sameSite: 'Lax' },
    { name: 'vibecore-lang', value: 'en', url: appBase },
  ]);

  return projectId;
}

/*
 * These three cases exercise the real menus without invoking kill/restart/new-session actions.
 * Uses the same isolated API registration/project/import contract as ide-panel-visibility.
 */
for (const width of [390, 768, 1280]) {
  test.describe(`terminal menu keyboard ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 1280 });

    test('sessions and actions preserve keyboard focus and native Tab exit', async ({ page, baseURL }, info) => {
      test.setTimeout(90_000);

      const id = await createProject(page, baseURL!);

      // "terminal" is the canonical panel-registry ID; "shell" is only an alias.
      await page.goto(`/projects/${id}/ide?panel=terminal`);
      await expect(page).toHaveURL(new RegExp(`/projects/${id}/ide\\?panel=terminal`));

      const terminal = page.locator('.bolt-terminal-tabs-shell').filter({ visible: true });
      await expect(terminal).toHaveCount(1);

      const actionsTrigger = terminal.getByRole('button', { name: 'More Shell actions', exact: true });
      await expect(actionsTrigger).toBeVisible();
      await actionsTrigger.focus();
      await actionsTrigger.press('ArrowDown');

      const actions = terminal.getByRole('menu', { name: 'More Shell actions', exact: true });
      const firstAction = actions.getByRole('menuitem', { name: 'Kill Shell', exact: true });
      await expect(firstAction).toBeFocused();
      await firstAction.press('ArrowDown');

      const copy = actions.getByRole('menuitem', { name: 'Copy output', exact: true });
      await expect(copy).toBeFocused();
      await copy.press('Home');
      await expect(firstAction).toBeFocused();
      await firstAction.press('End');

      const profile = actions.getByRole('combobox', { name: 'Shell profile', exact: true });
      await expect(profile).toBeFocused();
      await profile.press('Shift+Tab');

      const lastAction = actions.getByRole('menuitem', { name: 'Close tab', exact: true });
      await expect(lastAction).toBeFocused();
      await lastAction.press('Home');
      await expect(firstAction).toBeFocused();
      await firstAction.press('Escape');
      await expect(actions).toHaveCount(0);
      await expect(actionsTrigger).toBeFocused();

      // Native Tab from the last control exits instead of trapping focus in the popup.
      await actionsTrigger.press('ArrowUp');
      await expect(profile).toBeFocused();
      await profile.press('Tab');
      await expect(actions).toHaveCount(0);
      await expect(terminal.getByRole('button', { name: 'Close tab', exact: true })).toBeFocused();

      const sessionsTrigger = terminal.getByRole('button', { name: /Open shell sessions/ });
      await sessionsTrigger.focus();
      await sessionsTrigger.press('ArrowDown');

      const sessions = terminal.getByRole('menu', { name: 'Shell sessions', exact: true });
      const firstSession = sessions.getByRole('menuitemradio').first();
      await expect(firstSession).toBeFocused();
      await firstSession.press('End');

      const newShell = sessions.getByRole('menuitem', { name: 'New Shell', exact: true });
      await expect(newShell).toBeFocused();
      await newShell.press('Home');
      await expect(firstSession).toBeFocused();
      await firstSession.press('ArrowDown');
      await expect(newShell).toBeFocused();
      await newShell.press('Escape');
      await expect(sessions).toHaveCount(0);
      await expect(sessionsTrigger).toBeFocused();
      await sessionsTrigger.press('ArrowUp');
      await expect(newShell).toBeFocused();
      await newShell.press('Tab');
      await expect(sessions).toHaveCount(0);
      await expect(terminal.getByRole('button', { name: 'Copy', exact: true })).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`/projects/${id}/ide\\?panel=terminal`));
      await page.screenshot({ path: info.outputPath('terminal-keyboard-after.png') });
    });

    test('open actions and profile focus survive startup memory hydration', async ({ page, baseURL }) => {
      test.setTimeout(90_000);

      const id = await createProject(page, baseURL!);

      let memoryRequested = false;
      let releaseMemory!: () => void;

      const gate = new Promise<void>((resolve) => {
        releaseMemory = resolve;
      });
      await page.route(`**/api/projects/${id}/ide-state`, async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }

        memoryRequested = true;
        await gate;
        await route.fulfill({ json: { ideState: { version: 1, state: {} } } });
      });

      try {
        await page.goto(`/projects/${id}/ide?panel=terminal`, { waitUntil: 'domcontentloaded' });

        const terminal = page.locator('.bolt-terminal-tabs-shell').filter({ visible: true });
        await expect(terminal).toHaveCount(1);
        await expect.poll(() => memoryRequested).toBe(true);

        const trigger = terminal.getByRole('button', { name: 'More Shell actions', exact: true });
        await trigger.focus();
        await trigger.press('ArrowUp');

        const actions = terminal.getByRole('menu', { name: 'More Shell actions', exact: true });
        const profile = actions.getByRole('combobox', { name: 'Shell profile', exact: true });
        await expect(profile).toBeFocused();

        const original = await terminal.elementHandle();
        expect(original).not.toBeNull();
        releaseMemory();
        await expect.poll(() => original!.evaluate((node) => !node.isConnected), { timeout: 30_000 }).toBe(true);
        await expect(profile).toBeFocused();
        await profile.press('Shift+Tab');

        const closeTab = actions.getByRole('menuitem', { name: 'Close tab', exact: true });
        await expect(closeTab).toBeFocused();
        await closeTab.press('Escape');
        await expect(actions).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.press('ArrowUp');
        await expect(profile).toBeFocused();
        await profile.press('Tab');
        await expect(actions).toHaveCount(0);
        await expect(terminal.getByRole('button', { name: 'Close tab', exact: true })).toBeFocused();
      } finally {
        releaseMemory();
      }
    });
  });
}
