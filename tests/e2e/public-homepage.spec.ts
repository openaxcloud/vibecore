import { expect, test } from '@playwright/test';

test.describe('public homepage', () => {
  test('renders Fortune-grade homepage on desktop without layout overflow', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only assertion');

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'VibeCore' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start building' }).first()).toBeVisible();
    await expect(page.getByTestId('section-hero')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Build and deploy production apps/i })).toBeVisible();
    await expect(page.getByTestId('input-homepage-prompt')).toBeVisible();
    await expect(page.getByTestId('button-homepage-build')).toBeVisible();
    await expect(page.getByTestId('section-product')).toBeVisible();
    await expect(page.getByTestId('section-solutions')).toBeVisible();
    await expect(page.getByTestId('section-templates')).toBeVisible();
    await expect(page.getByTestId('section-cta')).toBeVisible();
    await expect(page.getByRole('contentinfo', { name: 'Site footer' })).toBeVisible();

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noHorizontalOverflow).toBeTruthy();
  });

  test('keeps public navigation and primary actions usable on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible();
    await expect(page.getByLabel('Open mobile menu')).toBeVisible();
    await page.getByLabel('Open mobile menu').tap();
    await expect(page.getByRole('link', { name: 'AI Agent', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Build and deploy production apps/i })).toBeVisible();
    await expect(page.getByTestId('input-homepage-prompt')).toBeVisible();
    await expect(page.getByTestId('button-homepage-build')).toBeVisible();
    await expect(page.getByRole('contentinfo', { name: 'Site footer' })).toBeVisible();

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noHorizontalOverflow).toBeTruthy();
  });
});
