import { expect, test } from '@playwright/test';

test('public platform pages use the shared typography system', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Bolt IDE|Ship AI-built/ }).first()).toBeVisible({ timeout: 30_000 });

  const landingTypography = await page.locator('main').evaluate((element) => {
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
  expect(landingTypography.interfaceSize).toBe('13px');
  expect(landingTypography.headingSize).toBe('15px');
  expect(landingTypography.bodyFont).toContain('Inter');
  expect(landingTypography.bodySize).toBe('13px');
  expect(Number.parseFloat(landingTypography.bodyLineHeight)).toBeCloseTo(19.5, 1);
  expect(landingTypography.headingSizeActual).toBe('15px');
  expect(landingTypography.headingWeight).toBe('600');
  expect(landingTypography.paragraphSizeActual).toBe('13px');
  expect(Number.parseFloat(landingTypography.paragraphLineHeight)).toBeCloseTo(19.5, 1);

  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

  const pricingTypography = await page.locator('main').evaluate((element) => {
    const heading = window.getComputedStyle(element.querySelector('h1')!);
    const cardHeading = window.getComputedStyle(element.querySelector('h2')!);

    return {
      headingSizeActual: heading.fontSize,
      headingWeight: heading.fontWeight,
      cardHeadingSizeActual: cardHeading.fontSize,
      cardHeadingWeight: cardHeading.fontWeight,
    };
  });

  expect(pricingTypography.headingSizeActual).toBe('15px');
  expect(pricingTypography.headingWeight).toBe('600');
  expect(pricingTypography.cardHeadingSizeActual).toBe('15px');
  expect(pricingTypography.cardHeadingWeight).toBe('600');
});
