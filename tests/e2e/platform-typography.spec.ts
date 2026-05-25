import { expect, test } from '@playwright/test';

test('public platform pages use the shared typography system', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('section-hero').getByRole('heading', { name: 'E-Code' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: 'Compared with Replit, Cursor and Lovable' })).toBeVisible();
  await expect(page.getByText('Cloud Run with gVisor and GCS-backed files')).toBeVisible();

  const landingTypography = await page.locator('.vc-home-hero-copy').evaluate((element) => {
    const root = window.getComputedStyle(document.documentElement);
    const body = window.getComputedStyle(document.body);
    const heading = window.getComputedStyle(element.querySelector('h1')!);
    const paragraph = window.getComputedStyle(element.querySelector('p')!);

    return {
      interfaceFont: root.getPropertyValue('--vc-font-interface').trim(),
      interfaceSize: root.getPropertyValue('--vc-type-interface-size').trim(),
      headingSize: root.getPropertyValue('--vc-type-heading-size').trim(),
      bodyFont: body.fontFamily,
      bodySize: body.fontSize,
      bodyLineHeight: body.lineHeight,
      headingSizeActual: heading.fontSize,
      headingWeight: heading.fontWeight,
      paragraphSizeActual: paragraph.fontSize,
      paragraphLineHeight: paragraph.lineHeight,
    };
  });

  expect(landingTypography.interfaceFont).toContain('Inter');
  expect(landingTypography.interfaceSize).toBe('12px');
  expect(landingTypography.headingSize).toBe('14px');
  expect(landingTypography.bodyFont).toContain('Inter');
  expect(landingTypography.bodySize).toBe('12px');
  expect(Number.parseFloat(landingTypography.bodyLineHeight)).toBeCloseTo(17, 1);
  expect(Number.parseFloat(landingTypography.headingSizeActual)).toBeGreaterThanOrEqual(42);
  expect(landingTypography.headingWeight).toBe('800');
  expect(landingTypography.paragraphSizeActual).toBe('16px');
  expect(Number.parseFloat(landingTypography.paragraphLineHeight)).toBeCloseTo(27.2, 1);

  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

  const pricingTypography = await page.locator('main.vc-public-shell').evaluate(() => {
    const heading = window.getComputedStyle(document.querySelector('main.vc-public-shell section h1')!);
    const cardHeading = window.getComputedStyle(document.querySelector('main.vc-public-shell section h2')!);

    return {
      headingSizeActual: heading.fontSize,
      headingWeight: heading.fontWeight,
      cardHeadingSizeActual: cardHeading.fontSize,
      cardHeadingWeight: cardHeading.fontWeight,
    };
  });

  expect(pricingTypography.headingSizeActual).toBe('30px');
  expect(pricingTypography.headingWeight).toBe('600');
  expect(pricingTypography.cardHeadingSizeActual).toBe('18px');
  expect(pricingTypography.cardHeadingWeight).toBe('600');
});
