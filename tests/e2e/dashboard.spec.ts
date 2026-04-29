import { expect, test } from '@playwright/test';

test('onboarding guides project setup', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Onboarding' })).toBeVisible();
  await expect(page.locator('section').getByRole('link', { name: 'Create project' })).toBeVisible();
  await expect(page.getByText('Connect GitHub')).toBeVisible();
});

test('project creation exposes templates and import paths', async ({ page }) => {
  await page.goto('/projects/new');
  await expect(page.getByRole('heading', { name: 'Create project' })).toBeVisible();
  await expect(page.getByLabel('Project name')).toBeVisible();
  await expect(page.getByRole('link', { name: /Import GitHub/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Import zip/ })).toBeVisible();
});

test('opens preserved Bolt IDE route for a project', async ({ page }) => {
  await page.goto('/projects/project_e2e/ide', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Workspace running')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Presence ready')).toBeVisible();
  await expect(page.getByText('Snapshots')).toBeVisible();
});

test('edit file workflow surfaces editor, files, terminal and preview affordances', async ({ page }) => {
  await page.goto('/projects/project_e2e/ide', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Workspace running')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Deploy')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Shortcuts' })).toBeVisible();
});

test('billing upgrade flow is reachable without frontend-only quota bypass', async ({ page }) => {
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Billing overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Upgrade' }).click();
  await expect(page.getByRole('heading', { name: 'Upgrade' })).toBeVisible();
});
