import { expect, test } from '@playwright/test';

test('admin console applies the platform typography system', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    const code = document.createElement('code');
    code.textContent = 'const audited = true;';
    code.setAttribute('data-testid', 'admin-typography-code');
    document.body.appendChild(code);

    const label = document.createElement('div');
    label.className = 'uppercase';
    label.textContent = 'AUDIT LABEL';
    label.setAttribute('data-testid', 'admin-typography-label');
    document.body.appendChild(label);
  });

  const typography = await page.locator('.app').evaluate((element) => {
    const root = window.getComputedStyle(document.documentElement);
    const body = window.getComputedStyle(document.body);
    const heading = window.getComputedStyle(element.querySelector('.brand h1')!);
    const code = window.getComputedStyle(document.querySelector('[data-testid="admin-typography-code"]')!);
    const label = window.getComputedStyle(document.querySelector('[data-testid="admin-typography-label"]')!);

    return {
      interfaceFont: root.getPropertyValue('--vc-font-interface').trim(),
      codeFont: root.getPropertyValue('--vc-font-code').trim(),
      interfaceSize: root.getPropertyValue('--vc-type-interface-size').trim(),
      codeSize: root.getPropertyValue('--vc-type-code-size').trim(),
      headingSize: root.getPropertyValue('--vc-type-heading-size').trim(),
      labelSize: root.getPropertyValue('--vc-type-label-size').trim(),
      labelTracking: root.getPropertyValue('--vc-type-label-letter-spacing').trim(),
      bodyFont: body.fontFamily,
      bodySize: body.fontSize,
      bodyLineHeight: body.lineHeight,
      headingSizeActual: heading.fontSize,
      headingWeight: heading.fontWeight,
      codeFontActual: code.fontFamily,
      codeSizeActual: code.fontSize,
      codeLigaturesActual: code.fontVariantLigatures,
      labelSizeActual: label.fontSize,
      labelWeight: label.fontWeight,
      labelTrackingActual: label.letterSpacing,
    };
  });

  expect(typography.interfaceFont).toContain('Inter');
  expect(typography.codeFont).toContain('JetBrains Mono');
  expect(typography.interfaceSize).toBe('13px');
  expect(typography.codeSize).toBe('13px');
  expect(typography.headingSize).toBe('15px');
  expect(typography.labelSize).toBe('11px');
  expect(typography.labelTracking).toBe('0.4px');
  expect(typography.bodyFont).toContain('Inter');
  expect(typography.bodySize).toBe('13px');
  expect(Number.parseFloat(typography.bodyLineHeight)).toBeCloseTo(19.5, 1);
  expect(typography.headingSizeActual).toBe('15px');
  expect(typography.headingWeight).toBe('600');
  expect(typography.codeFontActual).toContain('JetBrains Mono');
  expect(typography.codeSizeActual).toBe('13px');
  expect(typography.codeLigaturesActual).toContain('common-ligatures');
  expect(typography.labelSizeActual).toBe('11px');
  expect(typography.labelWeight).toBe('500');
  expect(typography.labelTrackingActual).toBe('0.4px');
});
