import { expect, test } from '@playwright/test';

test('E-Code marketing routes match the imported static mini-site', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('nav.nav strong')).toHaveText('E-code');
  await expect(page.locator('nav.nav a')).toHaveText(['Product', 'Pricing', 'Customers', 'Changelog', 'Legal']);
  await expect(page.getByRole('heading', { level: 1, name: 'E-code' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore product' })).toHaveAttribute('href', '/product.html');
  await expect(page.getByRole('link', { name: 'View pricing' })).toHaveAttribute('href', '/pricing.html');
  await expect(page.locator('section.band.shell.grid .card')).toHaveCount(4);
  await expect(page.getByText('E-code Inc. Privacy-first analytics. Google Cloud native.')).toBeVisible();
  await expect(page.getByText('Database and backup workflows')).toHaveCount(0);
  await expect(page.getByText('Contact sales')).toHaveCount(0);

  await page.getByRole('link', { name: 'Product', exact: true }).click();
  await expect(page).toHaveURL(/\/product\.html$/);
  await expect(page.locator('.ecode-exact-page')).toHaveCount(0);
  await expect(page.locator('link[href="/ecode-exact-host.css"]')).toHaveCount(0);
  await expect(page.locator('nav.nav a')).toHaveText(['Home', 'Pricing']);
  await expect(page.locator('main.shell.band.grid .card')).toHaveCount(6);
  await expect(page.getByText('Presence, shared editing, public projects, fork flow and moderation.')).toBeVisible();

  await page.goto('/pricing.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('nav.nav a')).toHaveText(['Home', 'Product']);
  await expect(page.locator('section.pricing .card')).toHaveCount(4);
  await expect(page.getByText('$40 per user monthly with roles, billing controls and shared secrets.')).toBeVisible();
  await expect(
    page.getByText('Annual billing receives a discount. Compute, storage and AI quotas are visible before use.'),
  ).toBeVisible();

  await page.goto('/customers.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('nav.nav')).toHaveCount(0);
  await expect(page.locator('main.shell.band .card')).toHaveCount(3);
  await expect(page.getByRole('heading', { level: 1, name: 'Customers and showcase' })).toBeVisible();

  await page.goto('/blog.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.shell.band .card')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Why Cloud Run for developer workspaces' })).toBeVisible();

  await page.goto('/changelog.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.shell.band .card')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: 'v1 platform hardening' })).toBeVisible();

  await page.goto('/privacy.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.shell.band.grid .card')).toHaveCount(4);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'DPA' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Sub-processors' })).toBeVisible();
  await expect(page.getByText('Provider keys')).toHaveCount(0);
});
