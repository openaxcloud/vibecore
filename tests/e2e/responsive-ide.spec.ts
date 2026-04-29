import { expect, test } from '@playwright/test';

async function authenticate(page: import('@playwright/test').Page) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
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
  const payload = (await response.json()) as { token: string };

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
}

test.describe('responsive IDE shell', () => {
  test('desktop keeps the full IDE workspace available', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only assertion');

    await authenticate(page);
    await page.goto('/projects/project_responsive/ide', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Workspace running')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="responsive-code-editor"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('mobile exposes tab navigation for core IDE panels', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

    await authenticate(page);
    await page.goto('/projects/project_responsive/ide', { waitUntil: 'domcontentloaded' });
    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });

    for (const panel of ['Chat', 'Files', 'Editor', 'Terminal', 'Preview', 'Deploy']) {
      await expect(mobileNav.getByRole('button', { name: panel, exact: true })).toBeVisible();
    }

    await mobileNav.getByRole('button', { name: 'Editor', exact: true }).tap();
    await expect(page.locator('[data-testid="responsive-code-editor"]').first()).toBeVisible({ timeout: 15000 });

    await mobileNav.getByRole('button', { name: 'Terminal', exact: true }).tap();
    await expect(page.getByText('Bolt Terminal')).toBeVisible({ timeout: 15000 });
  });
});
