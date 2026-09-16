import { expect, test } from '@playwright/test';

/**
 * This spec was written against the retired public shell (`.vc-home-hero-copy`,
 * `main.vc-public-shell`) and against its frozen heading pixel sizes. The
 * `ecode-exact` marketing rewrite replaced both, so the old selectors resolve to
 * nothing and the old sizes describe a shell that no longer ships.
 *
 * What still matters — and what this now asserts — is that every public page
 * inherits the *shared* typography system: the same interface font stack and
 * type-scale tokens, a body that actually uses them, and a heading hierarchy
 * that is strictly larger than body text and consistent across routes.
 */
const PUBLIC_ROUTES = ['/', '/pricing'] as const;

test('public platform pages use the shared typography system', async ({ page }) => {
  const perRoute: { route: string; interfaceFont: string; bodyFont: string; bodySize: string }[] = [];

  for (const route of PUBLIC_ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('h1').first()).toBeVisible();

    const typography = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement);
      const body = window.getComputedStyle(document.body);
      const heading = window.getComputedStyle(document.querySelector('h1')!);

      return {
        interfaceFont: root.getPropertyValue('--vc-font-interface').trim(),
        interfaceSize: root.getPropertyValue('--vc-type-interface-size').trim(),
        headingToken: root.getPropertyValue('--vc-type-heading-size').trim(),
        bodyFont: body.fontFamily,
        bodySize: body.fontSize,
        bodyLineHeight: body.lineHeight,
        headingSize: heading.fontSize,
        headingWeight: heading.fontWeight,
        headingText: document.querySelector('h1')?.textContent?.trim() ?? '',
      };
    });

    // Shared design-system tokens, identical on every public route.
    expect(typography.interfaceFont, `${route} interface font`).toContain('IBM Plex Sans');
    expect(typography.interfaceSize, `${route} interface size token`).toBe('12px');
    expect(typography.headingToken, `${route} heading size token`).toBe('14px');

    // The body actually consumes the shared stack.
    expect(typography.bodyFont, `${route} body font`).toContain('IBM Plex Sans');
    expect(Number.parseFloat(typography.bodySize), `${route} body size`).toBeGreaterThanOrEqual(14);
    expect(
      Number.parseFloat(typography.bodyLineHeight) / Number.parseFloat(typography.bodySize),
      `${route} body line-height ratio`,
    ).toBeGreaterThanOrEqual(1.35);

    // Heading hierarchy: a real, non-empty h1, clearly larger and bolder than body.
    expect(typography.headingText.length, `${route} h1 not empty`).toBeGreaterThan(0);
    expect(Number.parseFloat(typography.headingSize), `${route} h1 size`).toBeGreaterThanOrEqual(
      Number.parseFloat(typography.bodySize) * 2,
    );
    expect(Number.parseInt(typography.headingWeight, 10), `${route} h1 weight`).toBeGreaterThanOrEqual(600);

    perRoute.push({
      route,
      interfaceFont: typography.interfaceFont,
      bodyFont: typography.bodyFont,
      bodySize: typography.bodySize,
    });
  }

  // The whole point of a "shared" system: the routes agree with each other.
  const [first, ...rest] = perRoute;

  for (const entry of rest) {
    expect(entry.interfaceFont, `${entry.route} shares the interface font`).toBe(first.interfaceFont);
    expect(entry.bodyFont, `${entry.route} shares the body font`).toBe(first.bodyFont);
    expect(entry.bodySize, `${entry.route} shares the body size`).toBe(first.bodySize);
  }
});
