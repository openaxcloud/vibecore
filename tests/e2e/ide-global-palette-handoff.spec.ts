import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

const apiBaseUrl = () => process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const appBaseUrl = () => process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

async function authenticate(page: Pick<Page, 'request'>) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2);

  const r = await page.request.post(apiBaseUrl() + '/auth/register', {
    data: {
      email: 'palette-desktop-' + id + '@local.test',
      password: 'Password123!',
      name: 'Synthetic desktop palette',
      organizationName: 'Synthetic palette ' + id,
    },
  });
  expect(r.status()).toBe(201);

  return await r.json();
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

for (const width of [1440, 1024]) {
  test.describe(`global palette desktop ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, isMobile: false, hasTouch: false });
    test('preserves search through shell replacement, restores focus and opens Database', async ({ page }, info) => {
      test.setTimeout(90_000);

      const auth = await authenticate(page);
      const projectId = await seedProject(page, auth, 'dark');
      await page.context().addCookies([{ name: 'vibecore-lang', value: 'en', url: appBaseUrl() }]);

      let release!: () => void;
      let observed = false;

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/api/projects/*/ide-state', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }

        observed = true;
        await gate;
        await route.continue();
      });

      try {
        await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
        await expect.poll(() => observed).toBe(true);

        const trigger =
          width >= 1200
            ? page.getByTestId('ide-dock-all-tools')
            : page.getByRole('button', { name: 'Search tools and files', exact: true });
        await expect(trigger).toBeVisible();
        await trigger.focus();

        if (width >= 1200) {
          await page.keyboard.press('Enter');
        } else {
          await page.keyboard.press('Control+Shift+P');
        }

        const search = page.getByTestId('project-command-palette-search');
        await expect(search).toBeVisible();
        await search.fill('Database');
        await expect(search).toHaveValue('Database');
        await trigger.evaluate((node) => node.setAttribute('data-global-palette-shell-witness', 'true'));
        await page.screenshot({ path: info.outputPath('before-handoff.png') });
        release();
        await page.unrouteAll({ behavior: 'wait' });
        await expect(page.locator('[data-global-palette-shell-witness]')).toHaveCount(0);
        await expect(search).toBeVisible();
        await expect(search).toHaveValue('Database');
        await expect(search).toBeFocused();
        await page.screenshot({ path: info.outputPath('after-handoff.png') });
        await page.keyboard.press('Escape');
        await expect(search).toBeHidden();
        await expect(trigger).toBeFocused();
        await page.keyboard.press('Control+Shift+P');
        await expect(search).toBeVisible();
        await search.fill('Database');
        await page.keyboard.press('Enter');
        await expect(search).toBeHidden();
        await expect(page).toHaveURL(/panel=database/);
        await expect(page.getByRole('heading', { name: 'All databases', exact: true })).toBeVisible();
        await page.screenshot({ path: info.outputPath('database-open.png') });
      } finally {
        release();
        await page.unrouteAll({ behavior: 'wait' });
      }
    });
  });
}

async function prepareSettledPalette(page: Page, width: number, auth: { token: string; organization: { id: string } }) {
  const projectId = await seedProject(page, auth, 'dark');
  const headers = { authorization: `Bearer ${auth.token}` };

  const created = await page.request.post(`${apiBaseUrl()}/projects/${projectId}/ai/conversations`, {
    headers,
    data: { title: 'Synthetic palette focus audit' },
  });
  expect(created.ok()).toBe(true);

  const { conversation } = await created.json();

  const saved = await page.request.put(
    `${apiBaseUrl()}/projects/${projectId}/ai/conversations/${conversation.id}/transcript`,
    {
      headers,
      data: { messages: [{ clientId: 'palette-focus-user', role: 'user', content: 'Synthetic palette focus audit' }] },
    },
  );
  expect(saved.ok()).toBe(true);

  const state = await page.request.put(`${apiBaseUrl()}/projects/${projectId}/ide-state`, {
    headers,
    data: { state: { chat: { metadata: { aiConversationId: conversation.id } } } },
  });
  expect(state.ok()).toBe(true);
  await page.context().addCookies([{ name: 'vibecore-lang', value: 'en', url: appBaseUrl() }]);
  await page.goto(`/projects/${projectId}/ide?panel=agent&lang=en`);
  await expect(
    page.locator('.bolt-user-message-bubble').filter({ hasText: 'Synthetic palette focus audit' }).first(),
  ).toBeVisible();

  return width >= 1200 ? page.getByTestId('ide-dock-all-tools') : page.getByTestId('mobile-header-title-search');
}

test.describe('global palette repeated opening fixtures', () => {
  const identities = new Map<number, { token: string; organization: { id: string } }>();

  // Share only identities by width: each test creates its own project and browser context.
  test.beforeAll(async ({ request }) => {
    test.setTimeout(30_000);

    for (const width of [1440, 1024]) {
      identities.set(width, await authenticate({ request }));
    }
  });

  for (const width of [1440, 1024]) {
    test.describe(`global palette repeated opening ${width}`, () => {
      test.use({ viewport: { width, height: 900 }, isMobile: false, hasTouch: false });
      test('repeated keyboard opening preserves the original return focus', async ({ page }, info) => {
        test.setTimeout(90_000);

        const trigger = await prepareSettledPalette(page, width, identities.get(width)!);
        const search = page.getByTestId('project-command-palette-search');
        await trigger.focus();
        await expect(trigger).toBeFocused();
        await page.keyboard.press('Control+Shift+P');
        await expect(search).toBeFocused();
        await search.fill('Database');
        await page.keyboard.press('Control+Shift+P');
        await expect(search).toBeVisible();
        await page.screenshot({ path: info.outputPath('repeated-keyboard-open.png') });
        await page.keyboard.press('Escape');
        await expect(search).toBeHidden();
        await expect(trigger).toBeFocused();
        await page.screenshot({ path: info.outputPath('repeated-keyboard-closed.png') });
      });
      test(
        width >= 1200
          ? 'repeated pointer opening restores focus'
          : 'compact backdrop dismissal allows pointer reopening and focus return',
        async ({ page }, info) => {
          test.setTimeout(90_000);

          const trigger = await prepareSettledPalette(page, width, identities.get(width)!);
          const search = page.getByTestId('project-command-palette-search');
          await trigger.click();
          await expect(search).toBeVisible();
          await search.fill('Database');

          if (width < 1200) {
            // The compact palette is modal: close its backdrop before clicking the covered trigger.
            await page.getByTestId('command-palette-backdrop').click({ position: { x: 8, y: 8 } });
            await expect(search).toBeHidden();
          }

          await trigger.click();
          await expect(search).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(search).toBeHidden();
          await expect(trigger).toBeFocused();
          await page.screenshot({ path: info.outputPath('pointer-reopened-closed.png') });
        },
      );
      test('Back navigation while the reopened palette is visible preserves search and return focus', async ({
        page,
      }, info) => {
        test.setTimeout(90_000);

        const trigger = await prepareSettledPalette(page, width, identities.get(width)!);
        const search = page.getByTestId('project-command-palette-search');
        const previewUrl = new URL(page.url());
        previewUrl.searchParams.set('panel', 'preview');
        await page.goto(previewUrl.toString());
        await trigger.focus();
        await page.keyboard.press('Control+Shift+P');
        await expect(search).toBeVisible();
        await search.fill('Database');
        await page.keyboard.press('Enter');
        await expect(search).toBeHidden();
        await expect(page).toHaveURL(/panel=database/);
        await expect(page.getByRole('heading', { name: 'All databases', exact: true })).toBeVisible();
        await trigger.focus();
        await page.keyboard.press('Control+Shift+P');
        await expect(search).toBeFocused();
        await search.fill('Logs');
        await page.goBack({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/panel=preview/);
        await expect(search).toBeVisible();
        await expect(search).toHaveValue('Logs');
        await page.keyboard.press('Escape');
        await expect(search).toBeHidden();
        await expect(trigger).toBeFocused();
        await page.screenshot({ path: info.outputPath('database-fresh-focus-cycle.png') });
      });
    });
  }
});
