import { expect, test } from '@playwright/test';

test('public E-Code pages use the imported static stylesheet', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'E-code' })).toBeVisible({ timeout: 30_000 });

  const heroStyles = await page.locator('.hero').evaluate((element) => {
    const styles = window.getComputedStyle(element);
    const heading = window.getComputedStyle(element.querySelector('h1')!);

    return {
      backgroundImage: styles.backgroundImage,
      minHeight: styles.minHeight,
      color: styles.color,
      headingSize: heading.fontSize,
      headingLineHeight: heading.lineHeight,
    };
  });

  expect(heroStyles.backgroundImage).toContain('data:image/svg+xml');
  expect(heroStyles.color).toBe('rgb(255, 255, 255)');
  expect(Number.parseFloat(heroStyles.headingSize)).toBeGreaterThanOrEqual(48);
  expect(Number.parseFloat(heroStyles.headingLineHeight)).toBeGreaterThan(40);

  await page.goto('/pricing.html', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible();
  await expect(page.locator('section.pricing .card')).toHaveCount(4);

  const cardStyles = await page
    .locator('section.pricing .card')
    .first()
    .evaluate((element) => {
      const styles = window.getComputedStyle(element);

      return {
        borderRadius: styles.borderRadius,
        padding: styles.padding,
      };
    });

  expect(cardStyles.borderRadius).toBe('8px');
  expect(cardStyles.padding).toBe('18px');
});
