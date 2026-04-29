import { expect, test } from '@playwright/test';

test.describe('responsive IDE shell', () => {
  test('desktop keeps the full IDE workspace available', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only assertion');

    await page.goto('/projects/project_responsive/ide', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Workspace running')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="responsive-code-editor"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('mobile exposes tab navigation for core IDE panels', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

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
