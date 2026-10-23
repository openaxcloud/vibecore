import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

async function createProject(page: Page, appBase: string) {
  const api = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${api}/auth/register`, {
    data: {
      email: `panel-visibility-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Panel visibility audit',
      organizationName: `Panel visibility ${suffix}`,
    },
  });
  expect(registration.ok(), `Registration HTTP ${registration.status()}`).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'Panel visibility audit' },
  });
  expect(creation.ok(), `Project creation HTTP ${creation.status()}`).toBeTruthy();

  const projectId = ((await creation.json()) as { project: { id: string } }).project.id;
  const archive = new JSZip();
  archive.file(
    'README.md',
    '# Panel visibility fixture\n' +
      Array.from({ length: 240 }, (_, i) => `Line ${i}: preserved fixture content`).join('\n'),
  );

  for (let n = 0; n < 60; n++)
    archive.file(`src/fixture-${String(n).padStart(3, '0')}.ts`, `export const fixture = ${n};\n`);

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

async function openTool(page: Page, id: string) {
  await page.getByTestId('mobile-bottom-navigation').getByTestId('button-add-tab').click();
  await page.getByTestId(`tool-item-${id}`).click();
  await expect(page.getByTestId('tools-sheet')).toHaveCount(0);
}

for (const width of [390, 1180]) {
  test.describe(`panel visibility ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 757 }, hasTouch: width === 390 });
    for (const overlay of ['panels', 'tabs'] as const) {
      test(`${overlay} closes with Escape and restores focus`, async ({ page, baseURL }, info) => {
        test.setTimeout(90_000);
        const id = await createProject(page, baseURL!);
        await page.goto(`/projects/${id}/ide?panel=editor`);
        const trigger =
          overlay === 'panels'
            ? page.getByTestId('mobile-ide-header').getByTestId('button-more')
            : page.getByTestId('mobile-bottom-navigation').getByTestId('button-tab-switcher');
        const sheet = page.getByTestId(overlay === 'panels' ? 'mobile-more-menu-sheet' : 'mobile-tab-switcher');
        for (let cycle = 0; cycle < 2; cycle++) {
          await trigger.focus();
          await trigger.press('Enter');
          await expect(sheet).toBeVisible();
          const focused =
            overlay === 'panels' ? sheet.getByTestId('mobile-more-menu-close') : page.getByTestId('input-search-tabs');
          await focused.focus();
          await expect(focused).toBeFocused();
          if (overlay === 'tabs') await focused.fill('Editor');
          await focused.press('Escape');
          await page.screenshot({ path: info.outputPath(`${overlay}-escape-${cycle}.png`) });
          await expect(sheet).toHaveCount(0);
          await expect(trigger).toBeFocused();
        }
        // Closing via the existing visible button remains independently usable.
        await trigger.click();
        await sheet.getByTestId(overlay === 'panels' ? 'mobile-more-menu-close' : 'button-close-switcher').click();
        await expect(sheet).toHaveCount(0);
      });
    }

    test('repeated Files Editor Problems Shell Webview transitions keep toolbars reachable', async ({
      page,
      baseURL,
    }, info) => {
      test.setTimeout(90_000);
      const id = await createProject(page, baseURL!);
      await page.goto(`/projects/${id}/ide?panel=editor`);
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const tool of ['files', 'editor', 'problems', 'terminal', 'preview']) {
          await openTool(page, tool);
          if (tool === 'files')
            await page.getByTestId('mobile-files-panel').getByText('README.md', { exact: true }).click();
          if (tool === 'editor') {
            const editor = page.locator('.cm-content[contenteditable="true"]').filter({ visible: true });
            await editor.click();
            await editor.press('ControlOrMeta+End');
            await expect(editor).toContainText('Line 239: preserved fixture content');
          }
          if (tool !== 'terminal' && tool !== 'preview') continue;
          if (tool === 'terminal') await page.getByTestId('mobile-terminal-panel').locator('textarea').first().focus();
          const shell = page.getByTestId('mobile-workbench-keepalive');
          await expect(shell).toHaveAttribute('data-active', 'true');
          const measures = await shell.evaluate((root) => {
            const viewport = root.querySelector<HTMLElement>('.relative.flex-1')!;
            return {
              top: viewport.getBoundingClientRect().top,
              scrollTop: viewport.scrollTop,
              height: viewport.clientHeight,
              scrollHeight: viewport.scrollHeight,
              children: Array.from(viewport.children).map((c) => ({
                top: c.getBoundingClientRect().top,
                height: c.getBoundingClientRect().height,
              })),
            };
          });
          await info.attach(`${cycle}-${tool}`, { contentType: 'application/json', body: JSON.stringify(measures) });
          await page.screenshot({ path: info.outputPath(`${cycle}-${tool}.png`) });
          expect(measures.scrollTop).toBe(0);
          expect(measures.children.every((c) => c.top >= 48)).toBe(true);
          const action =
            tool === 'terminal'
              ? page.getByTestId('mobile-terminal-panel').getByRole('button', { name: /find in shell/i })
              : width === 390
                ? shell.getByRole('button', { name: 'Select preview port', exact: true })
                : shell.locator('.bolt-preview-toolbar-button[aria-pressed]').filter({ visible: true }).first();
          await expect(action).toBeVisible();
          expect(
            await action.evaluate((node) => {
              const rect = node.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
              return hit === node || node.contains(hit);
            }),
            'Toolbar action must not be covered by the header',
          ).toBe(true);
          if (width === 390) await action.tap();
          else await action.click();
          if (tool === 'terminal') {
            const search = page.getByTestId('mobile-terminal-panel').getByRole('search');
            await expect(search).toBeVisible();
            await search.locator('input').press('Escape');
            await expect(search).toHaveCount(0);
          } else {
            const state = width === 390 ? 'aria-expanded' : 'aria-pressed';
            await expect(action).toHaveAttribute(state, 'true');
            if (width === 390) await action.tap();
            else await action.click();
            await expect(action).toHaveAttribute(state, 'false');
            await openTool(page, 'editor');
            const editor = page.locator('.cm-content[contenteditable="true"]').filter({ visible: true });
            await editor.click();
            await editor.press('ControlOrMeta+End');
            await expect(editor).toContainText('Line 239: preserved fixture content');
          }
        }
      }
    });
  });
}

test.describe('desktop 1280px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test('desktop panel tools remain usable without mobile sheets', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const id = await createProject(page, baseURL!);
    await page.goto(`/projects/${id}/ide?panel=editor`);
    await expect(page.getByTestId('mobile-ide-header')).toHaveCount(0);
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.getByTestId('ide-dock-all-tools').click();
      const palette = page.locator('.bolt-project-command-palette').filter({ visible: true });
      await expect(palette).toBeVisible();
      await palette.getByRole('combobox').fill('Webview');
      await palette.getByRole('option').first().click();
      const action = page.locator('.bolt-preview-toolbar-button[aria-pressed]').filter({ visible: true }).first();
      await action.click();
      await expect(action).toHaveAttribute('aria-pressed', 'true');
      await action.click();
      await expect(action).toHaveAttribute('aria-pressed', 'false');
    }
  });
});
