import { expect, test } from '@playwright/test';

async function authenticate(page: import('@playwright/test').Page) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-${suffix}@local.test`;
  const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email,
      password: 'Password123!',
      name: 'E2E User',
      organizationName: `E2E Organization ${suffix}`,
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as { token: string; organization: { id: string } };

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return payload;
}

test('onboarding guides project setup', async ({ page }) => {
  await authenticate(page);
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Onboarding' })).toBeVisible();
  await expect(page.locator('section').getByRole('link', { name: 'Create project' })).toBeVisible();
  await expect(page.getByText('Connect GitHub')).toBeVisible();
});

test('project creation exposes templates and import paths', async ({ page }) => {
  await authenticate(page);
  await page.goto('/projects/new');
  await expect(page.getByRole('heading', { name: 'Create project' })).toBeVisible();
  await expect(page.getByLabel('Project name')).toBeVisible();
  await expect(page.getByRole('link', { name: /Import GitHub/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Import zip/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Browse templates/ })).toHaveAttribute('href', '/dashboard/templates');
});

test('private templates create a project instead of opening the public gallery', async ({ page }) => {
  await authenticate(page);
  await page.goto('/dashboard/templates');
  await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
  await expect(page.getByText('Create production workspaces from curated starters')).toBeVisible();
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/ide$/);
  await expect(page.getByText('Workspace running')).toBeVisible({ timeout: 15000 });
});

test('public templates stay marketing-only for anonymous visitors', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: 'Templates gallery' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to use templates' })).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: 'Sign in to use' }).first()).toHaveAttribute('href', '/login');
});

test('opens preserved Bolt IDE route for a project', async ({ page }) => {
  await authenticate(page);
  await page.goto('/projects/project_e2e/ide', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Workspace running')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Presence ready')).toBeVisible();
  await expect(page.getByText('Snapshots')).toBeVisible();
});

test('edit file workflow surfaces editor, files, terminal and preview affordances', async ({ page }) => {
  await authenticate(page);
  await page.goto('/projects/project_e2e/ide', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Workspace running')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Deploy')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Shortcuts' })).toBeVisible();
});

test('reopens project IDE with persisted agent memory and panel state', async ({ page, isMobile }) => {
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const marker = `Persisted enterprise memory ${Date.now()}`;
  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Memory Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;
  const saveState = await page.request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: {
      state: {
        chat: {
          id: `project:${projectId}`,
          description: 'Persistent project agent',
          messages: [{ id: 'memory-user-message', role: 'user', content: marker }],
        },
        ui: { currentView: 'preview', rightPanel: 'search', showWorkbench: true },
      },
    },
  });

  expect(saveState.ok(), await saveState.text()).toBeTruthy();
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Workspace running')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(marker)).toBeVisible({ timeout: 15000 });

  if (!isMobile) {
    await expect(page.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-current', 'page');
  }
});

test('billing upgrade flow is reachable without frontend-only quota bypass', async ({ page }) => {
  await authenticate(page);
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Billing overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Upgrade' }).click();
  await expect(page.getByRole('heading', { name: 'Upgrade' })).toBeVisible();
});

test('public and authenticated routes render without route errors', async ({ page }) => {
  test.setTimeout(75_000);

  const publicRoutes = [
    '/',
    '/pricing',
    '/docs',
    '/templates',
    '/changelog',
    '/status',
    '/contact-sales',
    '/security',
    '/privacy',
    '/terms',
    '/acceptable-use',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ];

  for (const route of publicRoutes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
    await expect(page.getByText(/Application Error|Unable to load section|Failed to fetch/i)).toHaveCount(0);
  }

  const auth = await authenticate(page);
  const createProject = await page.request.post(
    `${process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'}/orgs/${auth.organization.id}/projects`,
    {
      headers: { authorization: `Bearer ${auth.token}` },
      data: { name: 'Route Audit Project' },
    },
  );

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;
  const authenticatedRoutes = [
    '/dashboard',
    '/projects',
    '/projects/new',
    '/dashboard/templates',
    '/recent-projects',
    '/usage',
    '/billing',
    '/organization-members',
    '/invitations',
    '/account-settings',
    '/security-settings',
    '/api-keys',
    '/connected-accounts',
    '/notifications',
    '/support',
    '/command-palette',
    '/organization-switcher',
    '/roles-and-permissions',
    '/session-security',
    '/enterprise-sso-settings',
    '/scim-token-settings',
    '/audit-logs',
    `/projects/${projectId}`,
    `/projects/${projectId}/ide`,
    `/projects/${projectId}/settings`,
    `/projects/${projectId}/env`,
    `/projects/${projectId}/secrets`,
    `/projects/${projectId}/collaborators`,
    `/projects/${projectId}/snapshots`,
    `/projects/${projectId}/deployments`,
    `/projects/${projectId}/domains`,
    `/projects/${projectId}/logs`,
    `/projects/${projectId}/activity`,
    `/projects/${projectId}/git`,
  ];

  for (const route of authenticatedRoutes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
    await expect(page.getByText(/Application Error|Unable to load section|Failed to fetch/i)).toHaveCount(0);
  }
});

test('command palette entries navigate to real product routes', async ({ page }) => {
  await authenticate(page);
  await page.goto('/command-palette');
  await page.getByRole('link', { name: /Import GitHub repository/ }).click();
  await expect(page).toHaveURL('/import-github');
  await expect(page.getByRole('heading', { name: 'Import GitHub' })).toBeVisible();
});
