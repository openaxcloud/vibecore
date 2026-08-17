import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function authenticate(page: import('@playwright/test').Page) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseText = '';
  let payload: { token: string; organization: { id: string } } | undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `preview-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Preview E2E',
        organizationName: `Preview E2E Organization ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      payload = JSON.parse(responseText) as { token: string; organization: { id: string } };
      break;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    expect(response.ok(), responseText).toBeTruthy();
  }

  expect(payload, responseText).toBeTruthy();

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload!.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return payload!;
}

async function createZipBase64(files: Record<string, string>) {
  const zip = new JSZip();

  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'base64' });
}

async function expectPreviewIframe(page: import('@playwright/test').Page, timeout = 90_000) {
  const previewIframe = page.locator('iframe[title="preview"]').first();
  await expect(previewIframe).toBeVisible({ timeout });

  return previewIframe;
}

async function expectWorkspaceRunning(page: import('@playwright/test').Page, timeout = 90_000) {
  await expect(page.getByRole('button', { name: /Workspace:\s*running/i })).toBeVisible({ timeout });
}

async function expectProjectCreationForm(page: import('@playwright/test').Page) {
  const promptField = page.getByLabel('Describe your idea');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/projects/new', { waitUntil: 'domcontentloaded' });

    try {
      await expect(promptField).toBeVisible({ timeout: 30_000 });

      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }
  }
}

test('project preview boots a real app and renders inside the webview', { tag: '@runtime' }, async ({ page }) => {
  test.setTimeout(240_000);

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Preview runtime project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  const zipBase64 = await createZipBase64({
    'index.html': `<!doctype html>
<html>
  <head><title>Preview runtime smoke</title></head>
  <body>
    <main id="app">VibeCore preview runtime smoke</main>
  </body>
</html>`,
  });

  const importFiles = await page.request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64, replaceExisting: true },
  });

  expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expectWorkspaceRunning(page, 180_000);
  await page.getByRole('button', { name: 'Webview' }).click();

  await expectPreviewIframe(page, 180_000);
  await expect(page.frameLocator('iframe[title="preview"]').locator('#app')).toContainText(
    'VibeCore preview runtime smoke',
    { timeout: 180_000 },
  );
});

test(
  'project preview boots a package-script Vite app and renders inside the webview',
  { tag: '@runtime' },
  async ({ page }) => {
    test.setTimeout(300_000);

    const auth = await authenticate(page);
    const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

    const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
      headers: { authorization: `Bearer ${auth.token}` },
      data: { name: 'Preview Vite runtime project' },
    });

    expect(createProject.ok(), await createProject.text()).toBeTruthy();

    const projectId = (await createProject.json()).project.id as string;

    const zipBase64 = await createZipBase64({
      'package.json': JSON.stringify(
        {
          private: true,
          type: 'module',
          scripts: { dev: 'vite' },
          devDependencies: { vite: '^5.4.19' },
        },
        null,
        2,
      ),
      'index.html':
        '<!doctype html><html><body><main id="app"></main><script type="module" src="/src/main.js"></script></body></html>',
      'src/main.js': [
        "const root = document.querySelector('#app');",
        "root.textContent = 'VibeCore package preview runtime smoke';",
        "root.setAttribute('data-preview-runtime', 'vite-package');",
      ].join('\n'),
    });

    const importFiles = await page.request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
      headers: { authorization: `Bearer ${auth.token}` },
      data: { zipBase64, replaceExisting: true },
    });

    expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expectWorkspaceRunning(page, 180_000);
    await page.getByRole('button', { name: 'Webview' }).click();

    await expectPreviewIframe(page, 180_000);
    await expect(
      page.frameLocator('iframe[title="preview"]').locator('[data-preview-runtime="vite-package"]'),
    ).toContainText('VibeCore package preview runtime smoke', { timeout: 180_000 });
  },
);

test(
  'template-created project boots and renders the generated app in preview',
  { tag: '@runtime' },
  async ({ page }) => {
    test.setTimeout(240_000);

    await authenticate(page);

    await page.goto('/dashboard/templates', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Use template' }).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/ide$/, { timeout: 120_000 });
    await expectWorkspaceRunning(page, 180_000);

    await page.getByRole('button', { name: 'Webview' }).click();

    await expectPreviewIframe(page, 120_000);
    await expect(page.frameLocator('iframe[title="preview"]').getByRole('heading', { name: 'React SaaS' })).toBeVisible(
      {
        timeout: 180_000,
      },
    );
    await expect(
      page.frameLocator('iframe[title="preview"]').getByText('Created from Bolt template react-saas.'),
    ).toBeVisible();
  },
);

test('AI-created project starts the agent with a valid default model', async ({ page }) => {
  test.setTimeout(240_000);

  await authenticate(page);

  const prompt = 'Build a realtime kanban board with analytics';
  await expectProjectCreationForm(page);

  const providerDropdown = page.getByTestId('agent-provider-dropdown');
  const modelDropdown = page.getByTestId('agent-model-dropdown');
  await expect(providerDropdown.getByRole('combobox', { name: 'AI provider' })).toContainText('Anthropic', {
    timeout: 30_000,
  });
  await expect(modelDropdown.getByRole('combobox', { name: 'AI model' })).not.toContainText('No option available');
  await page.getByLabel('Describe your idea').fill(prompt);
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/\/projects\/[^/]+\/ide(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByText('Invalid model selected')).toHaveCount(0);
  await expect(page.getByText(prompt, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Realtime Kanban Board|Generating Response|Response Generated/).first()).toBeVisible({
    timeout: 120_000,
  });
});

test(
  'preview window options stay readable and interactive in light theme',
  { tag: '@runtime' },
  async ({ page, isMobile }) => {
    test.skip(isMobile, 'Preview toolbar window menu is part of the desktop/tablet IDE shell.');
    test.setTimeout(240_000);

    const auth = await authenticate(page);
    const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

    const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
      headers: { authorization: `Bearer ${auth.token}` },
      data: { name: 'Preview window options project' },
    });

    expect(createProject.ok(), await createProject.text()).toBeTruthy();

    const projectId = (await createProject.json()).project.id as string;

    const zipBase64 = await createZipBase64({
      'index.html': '<!doctype html><html><body><main id="app">Window options smoke</main></body></html>',
    });

    const importFiles = await page.request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
      headers: { authorization: `Bearer ${auth.token}` },
      data: { zipBase64, replaceExisting: true },
    });

    expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expectWorkspaceRunning(page, 180_000);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.getByRole('button', { name: 'Webview' }).click();
    await expectPreviewIframe(page, 180_000);

    const toolbar = page.locator('.bolt-project-webview-toolbar').first();
    await expect(toolbar.getByRole('combobox', { name: 'Preview device' })).toBeVisible();
    await toolbar.getByRole('button', { name: 'Preview window options' }).click();

    const menu = page.locator('.bolt-preview-window-menu').first();
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Responsive presets')).toBeVisible();
    await expect(menu.getByRole('button', { name: /Show device frame/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(menu.getByRole('button', { name: /Landscape mode/ })).toHaveAttribute('aria-pressed', 'false');

    const metrics = await menu.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const previewFrame = document.querySelector('.bolt-project-webview-frame') as HTMLElement;
      const previewViewport = document.querySelector('.bolt-project-webview-viewport') as HTMLElement;
      const frameStyle = window.getComputedStyle(previewFrame);
      const viewportStyle = window.getComputedStyle(previewViewport);
      const label = element.querySelector('.bolt-preview-window-menu-label') as HTMLElement;
      const labelStyle = window.getComputedStyle(label);
      const showFrame = element.querySelector('.bolt-preview-window-menu-toggle') as HTMLElement;
      const showFrameText = showFrame.querySelector('span:first-child') as HTMLElement;
      const switchElement = showFrame.querySelector('.bolt-preview-window-switch') as HTMLElement;
      const firstPreset = element.querySelector('.bolt-preview-window-size') as HTMLElement;
      const firstPresetStyle = window.getComputedStyle(firstPreset);
      const presetText = firstPreset.querySelector('div')!.getBoundingClientRect();
      const presetRect = firstPreset.getBoundingClientRect();
      const switchRect = switchElement.getBoundingClientRect();
      const textRect = showFrameText.getBoundingClientRect();

      return {
        background: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
        labelTextAlign: labelStyle.textAlign,
        labelPaddingLeft: labelStyle.paddingLeft,
        labelBackground: labelStyle.backgroundColor,
        labelColor: labelStyle.color,
        frameBackground: frameStyle.backgroundColor,
        viewportBackground: viewportStyle.backgroundColor,
        viewportBorderColor: viewportStyle.borderColor,
        switchWidth: Math.round(switchRect.width),
        switchHeight: Math.round(switchRect.height),
        textSwitchGap: Math.round(switchRect.left - textRect.right),
        presetDisplay: firstPresetStyle.display,
        presetGridColumns: firstPresetStyle.gridTemplateColumns,
        presetTextLeft: Math.round(presetText.left - presetRect.left),
        presetBackground: firstPresetStyle.backgroundColor,
      };
    });

    expect(metrics).toMatchObject({
      background: 'rgb(255, 255, 255)',
      color: 'rgb(17, 24, 39)',
      borderColor: 'rgb(154, 168, 187)',
      labelTextAlign: 'start',
      labelPaddingLeft: '12px',
      labelBackground: 'rgb(255, 255, 255)',
      labelColor: 'rgb(71, 85, 105)',
      frameBackground: 'rgb(246, 248, 251)',
      viewportBackground: 'rgb(255, 255, 255)',
      viewportBorderColor: 'rgb(154, 168, 187)',
      switchWidth: 34,
      switchHeight: 18,
      presetDisplay: 'grid',
      presetBackground: 'rgba(0, 0, 0, 0)',
    });
    expect(metrics.textSwitchGap).toBeGreaterThanOrEqual(8);
    expect(metrics.presetGridColumns).toContain('18px');
    expect(metrics.presetTextLeft).toBeGreaterThanOrEqual(26);

    await menu.getByRole('button', { name: /Show device frame/ }).click();
    await expect(menu.getByRole('button', { name: /Show device frame/ })).toHaveAttribute('aria-pressed', 'false');
    await menu.getByRole('button', { name: /Landscape mode/ }).click();
    await expect(menu.getByRole('button', { name: /Landscape mode/ })).toHaveAttribute('aria-pressed', 'true');
  },
);
