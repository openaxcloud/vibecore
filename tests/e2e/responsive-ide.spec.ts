import { expect, test } from '@playwright/test';

async function authenticate(page: import('@playwright/test').Page) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `responsive-${suffix}@local.test`;
  const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email,
      password: 'Password123!',
      name: 'Responsive E2E',
      organizationName: `Responsive E2E Organization ${suffix}`,
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as { token: string; organization: { id: string } };

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return payload;
}

async function createTestProject(page: import('@playwright/test').Page, name: string) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const auth = await authenticate(page);
  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  return (await createProject.json()).project.id as string;
}

test.describe('responsive IDE shell', () => {
  test('desktop keeps the full IDE workspace available', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only assertion');

    const projectId = await createTestProject(page, 'Responsive desktop project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Running|Building|Stopped|Crashed/ })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="responsive-code-editor"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="ide-agent-panel"]').first()).toBeVisible();

    const agentBox = await page.locator('[data-testid="ide-agent-panel"]').first().boundingBox();
    const viewport = page.viewportSize();
    expect(agentBox?.width).toBeGreaterThan(260);
    expect(agentBox?.width).toBeLessThan((viewport?.width ?? 1200) * 0.46);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  });

  test('desktop can collapse and restore the right preview panel', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only assertion');

    const projectId = await createTestProject(page, 'Responsive files toggle project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Running|Building|Stopped|Crashed/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toBeVisible({ timeout: 15000 });

    const filesToggle = page.getByTestId('ide-files-panel-toggle');
    await expect(filesToggle).toBeVisible();
    await expect(filesToggle).toHaveAttribute('aria-label', 'Close right panel');
    await filesToggle.click();
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toHaveCount(0);
    await expect(page.locator('[data-testid="ide-agent-panel"]').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Editor and preview' })).toBeVisible();

    await expect(filesToggle).toHaveAttribute('aria-label', 'Open right panel');
    await filesToggle.click();
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toBeVisible({ timeout: 15000 });
  });

  test('desktop opens terminal as a workspace panel from the panel URL', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only assertion');

    const projectId = await createTestProject(page, 'Responsive terminal panel project');

    await page.goto(`/projects/${projectId}/ide?panel=terminal`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /Terminal/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Bolt Terminal')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/panel=terminal/);
  });

  test('mobile exposes tab navigation for core IDE panels', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

    const projectId = await createTestProject(page, 'Responsive mobile project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });

    for (const panel of ['Chat', 'Files', 'Editor', 'Terminal', 'Preview', 'Deploy']) {
      await expect(mobileNav.getByRole('button', { name: panel, exact: true })).toBeVisible();
    }

    await mobileNav.getByRole('button', { name: 'Editor', exact: true }).tap();
    await expect(page.locator('[data-testid="responsive-code-editor"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="codemirror"]').first()).toBeVisible({
      timeout: 15000,
    });

    await mobileNav.getByRole('button', { name: 'Terminal', exact: true }).tap();
    await expect(page.getByText('Bolt Terminal')).toBeVisible({ timeout: 15000 });
  });

  test('mobile editor accepts edits and exposes save without Monaco', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

    const projectId = await createTestProject(page, 'Responsive mobile editor project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });
    await mobileNav.getByRole('button', { name: 'Editor', exact: true }).tap();

    const codeMirror = page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="codemirror"]').first();
    await expect(codeMirror).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="monaco"]')).toHaveCount(0);

    const editorContent = page.locator('.cm-content').first();
    await editorContent.tap();
    await page.keyboard.insertText('\n// mobile editor save path');
    await expect(page.getByRole('button', { name: /Save/ })).toBeVisible({ timeout: 15000 });
  });

  test('tablet landscape sizes the agent panel fluidly without horizontal overflow', async ({ page, isMobile }) => {
    test.skip(isMobile, 'tablet landscape assertion');
    await page.setViewportSize({ width: 1024, height: 768 });

    const projectId = await createTestProject(page, 'Responsive tablet project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Running|Building|Stopped|Crashed/ })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="ide-agent-panel"]').first()).toBeVisible({ timeout: 15000 });

    const agentBox = await page.locator('[data-testid="ide-agent-panel"]').first().boundingBox();
    expect(agentBox?.width).toBeGreaterThan(220);
    expect(agentBox?.width).toBeLessThan(460);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  });
});
