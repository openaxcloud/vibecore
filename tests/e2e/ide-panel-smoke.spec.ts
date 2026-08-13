import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import JSZip from 'jszip';

type AuthPayload = { token: string; organization: { id: string } };

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const ideServicePanels = [
  'overview',
  'database',
  'object-storage',
  'packages',
  'monitoring',
  'extensions',
  'integrations',
  'workflows',
  'debugger',
  'deployments',
  'security',
  'env',
  'secrets',
  'git',
  'activity',
  'terminal',
  'logs',
  'collaborators',
  'domains',
  'snapshots',
  'settings',
] as const;

type IdePanel = 'editor' | 'preview' | 'files' | 'search' | 'locks' | (typeof ideServicePanels)[number];

const allIdePanels: IdePanel[] = ['editor', 'preview', 'files', 'search', 'locks', ...ideServicePanels];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function authenticate(request: APIRequestContext): Promise<AuthPayload> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseText = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `ide-panel-smoke-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'IDE Panel Smoke E2E',
        organizationName: `IDE Panel Smoke E2E ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      return JSON.parse(responseText) as AuthPayload;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    expect(response.ok(), responseText).toBeTruthy();
  }

  throw new Error(responseText || 'Unable to authenticate IDE panel smoke user');
}

async function createSeededProject(request: APIRequestContext, auth: AuthPayload) {
  const createProject = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE panel smoke project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;
  const zip = new JSZip();

  zip.file('index.html', '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n');
  zip.file(
    'src/main.tsx',
    [
      "import './styles.css';",
      "import { App } from './App';",
      '',
      "document.querySelector('#root')!.innerHTML = App();",
      '',
    ].join('\n'),
  );
  zip.file(
    'src/App.tsx',
    [
      "import { Header } from './components/Header';",
      "import './components/Header.css';",
      "import { useThemeStore } from './store/themeStore';",
      '',
      'export function App() {',
      '  const { theme } = useThemeStore();',
      '  return `<main data-theme="${theme}">${Header()}<section>IDE panel smoke app</section></main>`;',
      '}',
      '',
    ].join('\n'),
  );
  zip.file(
    'src/components/Header.tsx',
    [
      'export function Header() {',
      '  return `<header class="app-header">Production import graph</header>`;',
      '}',
      '',
    ].join('\n'),
  );
  zip.file('src/store/themeStore.ts', 'export function useThemeStore() { return { theme: "dark" as const }; }\n');
  zip.file('src/styles.css', 'body { margin: 0; font-family: system-ui, sans-serif; }\n');
  zip.file('src/components/Header.css', '.app-header { padding: 12px; font-weight: 700; }\n');

  const importFiles = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });

  expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

  return projectId;
}

async function assertServicePanelBackend(page: Page, projectId: string, panel: (typeof ideServicePanels)[number]) {
  const response = await page.request.get(`${appBaseUrl}/api/projects/${projectId}/ide-panel/${panel}`);
  const responseText = await response.text();

  expect(response.ok(), `${panel} HTTP ${response.status()}: ${responseText}`).toBeTruthy();

  const envelope = JSON.parse(responseText) as {
    panel?: string;
    project?: unknown;
    status?: string;
    data?: unknown;
    error?: unknown;
  };

  expect(envelope.panel, `${panel} envelope.panel`).toBe(panel);
  expect(envelope.project, `${panel} envelope.project`).toBeTruthy();
  expect(['ok', 'empty']).toContain(envelope.status);
  expect(envelope).toHaveProperty('data');
  expect(envelope.error, `${panel} backend error`).toBeUndefined();
}

async function assertPanelRendered(page: Page, projectId: string, panel: IdePanel) {
  const expectedUrl =
    panel === 'editor'
      ? new RegExp(`/projects/${escapeRegExp(projectId)}/ide(?:\\?panel=editor)?$`)
      : new RegExp(`/projects/${escapeRegExp(projectId)}/ide\\?panel=${escapeRegExp(panel)}`);

  await expect(page).toHaveURL(expectedUrl, { timeout: 45_000 });
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Application Error|Unexpected Application Error|Route Error/i)).toHaveCount(0);
  await expect(page.getByText(/Missing import in .*does not resolve to a generated or existing file/i)).toHaveCount(0);
  await expect(page.getByText(/AI patch (?:failed|blocked): .*Missing import/i)).toHaveCount(0);

  if (panel === 'editor') {
    await expect(page.getByTestId('responsive-code-editor').first()).toBeVisible({ timeout: 45_000 });
    return;
  }

  if (panel === 'preview') {
    await expect(page.locator('.bolt-project-webview-tool').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.bolt-project-webview-toolbar').first()).toBeVisible({ timeout: 45_000 });
    return;
  }

  if (panel === 'files') {
    await expect(page.getByRole('complementary', { name: 'Project library panel' })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.bolt-project-files-tool').first()).toBeVisible({ timeout: 45_000 });
    return;
  }

  if (panel === 'search') {
    await expect(page.getByPlaceholder('Search files')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByPlaceholder('Replace')).toBeVisible({ timeout: 45_000 });
    return;
  }

  if (panel === 'locks') {
    await expect(page.getByText('No locked items found')).toBeVisible({ timeout: 45_000 });
    return;
  }

  if (panel === 'terminal') {
    await assertServicePanelBackend(page, projectId, panel);
    await expect(page.getByRole('region', { name: 'Interactive terminal' })).toBeVisible({ timeout: 45_000 });
    return;
  }

  await assertServicePanelBackend(page, projectId, panel);

  const servicePanel = page.locator(`[data-testid="ide-service-panel"][data-panel="${panel}"]`).first();

  await expect(servicePanel).toBeVisible({ timeout: 45_000 });
  await expect(servicePanel.getByText(/Loading .* from backend/i)).toHaveCount(0, { timeout: 45_000 });
  await expect(servicePanel.getByRole('alert')).toHaveCount(0);
}

test('desktop IDE renders every panel in-place without stale missing-import errors or full reloads', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop-only full panel smoke');
  test.setTimeout(240_000);

  const auth = await authenticate(request);
  const projectId = await createSeededProject(request, auth);

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: auth.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  await page.goto(`/projects/${projectId}/ide?panel=deployments`, { waitUntil: 'domcontentloaded' });
  await assertPanelRendered(page, projectId, 'deployments');

  const reloadMarker = `ide-smoke-${Date.now()}`;

  await page.evaluate((marker) => {
    (window as typeof window & { __vibecoreIdePanelSmokeMarker?: string }).__vibecoreIdePanelSmokeMarker = marker;
  }, reloadMarker);

  for (const panel of allIdePanels) {
    await test.step(`open ${panel}`, async () => {
      await page.evaluate((nextPanel) => {
        window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: nextPanel } }));
      }, panel);

      await assertPanelRendered(page, projectId, panel);

      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as typeof window & { __vibecoreIdePanelSmokeMarker?: string }).__vibecoreIdePanelSmokeMarker,
            ),
          {
            message: `${panel} should switch in-place without a document reload`,
            timeout: 10_000,
          },
        )
        .toBe(reloadMarker);
    });
  }
});
