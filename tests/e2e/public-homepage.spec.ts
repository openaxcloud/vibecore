import { expect, test } from '@playwright/test';

function parseRgb(input: string) {
  const match = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

  if (!match) {
    throw new Error(`Unsupported color format: ${input}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function luminance([r, g, b]: readonly [number, number, number]) {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = luminance(parseRgb(foreground));
  const backgroundLuminance = luminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2.1 AA: normal text needs 4.5:1, "large" text only 3:1. Large means
 * >= 24px at any weight, or >= 18.66px when bold (>= 700).
 */
function wcagAaThreshold(fontSizePx: number, fontWeight: number) {
  const isLarge = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);

  return isLarge ? 3 : 4.5;
}

/**
 * The public homepage renders the `ecode-exact` marketing shell
 * (`EcodeExactShell` + `LandingOptimized`), which replaced the former
 * `SaaSLayout` public chrome. These assertions therefore target the shell's
 * real landmarks and test ids, and check *behaviour* (named landmarks,
 * readable contrast, no horizontal overflow, a working theme toggle) rather
 * than the hard-coded `--vc-public-*` hex tokens of the retired shell.
 */
test.describe('public homepage', () => {
  test('renders Fortune-grade homepage on desktop without layout overflow', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only assertion');

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible();
    await expect(page.getByTestId('link-get-started').first()).toBeVisible();
    await expect(page.getByTestId('link-login').first()).toBeVisible();

    await expect(page.getByTestId('section-hero')).toBeVisible();
    await expect(page.getByTestId('heading-hero')).toBeVisible();
    await expect(page.getByTestId('text-hero-description')).toBeVisible();
    await expect(page.getByTestId('input-app-description')).toBeVisible();
    await expect(page.getByTestId('button-build-now')).toBeVisible();
    await expect(page.getByTestId('button-view-pricing')).toBeVisible();

    await expect(page.getByRole('contentinfo', { name: 'Site footer' })).toBeVisible();
    await expect(page.getByTestId('button-footer-start-building')).toBeVisible();

    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(noHorizontalOverflow).toBeTruthy();
  });

  test('keeps public navigation and primary actions usable on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible();
    await expect(page.getByLabel('Open mobile menu')).toBeVisible();
    await page.getByLabel('Open mobile menu').tap();

    // The compact menu is a modal dialog, not a nav landmark.
    const mobileMenu = page.getByRole('dialog', { name: 'Mobile navigation menu' });
    await expect(mobileMenu).toBeVisible();
    await expect(mobileMenu.getByRole('button', { name: /Get started/i }).first()).toBeVisible();

    await page.getByLabel('Close mobile menu').tap();
    await expect(mobileMenu).toBeHidden();

    await expect(page.getByTestId('heading-hero')).toBeVisible();
    await expect(page.getByTestId('input-app-description')).toBeVisible();
    await expect(page.getByTestId('button-build-now')).toBeVisible();
    await expect(page.getByRole('contentinfo', { name: 'Site footer' })).toBeVisible();

    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(noHorizontalOverflow).toBeTruthy();
  });

  test('keeps the public homepage readable in light and dark themes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop theme contrast is covered here; mobile has a separate navigation flow');

    for (const theme of ['dark', 'light'] as const) {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.evaluate((nextTheme) => {
        /*
         * Theme resolution order is cookie -> localStorage -> server-seeded
         * attribute, so seed the cookie too or the shared `ecode_theme` cookie
         * wins over the localStorage value we just wrote.
         */
        document.cookie = `ecode_theme=${nextTheme}; path=/; SameSite=Lax`;
        localStorage.setItem('bolt_theme', nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
        document.documentElement.classList.toggle('dark', nextTheme === 'dark');
        document.documentElement.classList.toggle('light', nextTheme === 'light');
      }, theme);
      await page.reload({ waitUntil: 'domcontentloaded' });

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible();
      await expect(page.getByTestId('button-theme-toggle')).toBeVisible();
      await expect(page.getByTestId('link-get-started').first()).toBeVisible();
      await expect(page.getByTestId('button-build-now')).toBeVisible();

      /*
       * "Build now" stays disabled (and dimmed) until the visitor describes an
       * app, so fill the prompt before asserting the enabled button's contrast.
       * The enable transition fades opacity in, so wait for it to settle rather
       * than sampling mid-animation.
       */
      await page.getByTestId('input-app-description').fill('A subscription billing dashboard');

      const buildNow = page.locator('[data-testid="button-build-now"]:visible').first();
      await expect(buildNow).toBeEnabled();
      await expect(buildNow).toHaveCSS('opacity', '1');

      const snapshot = await page.evaluate(() => {
        const read = (element: HTMLElement) => {
          const style = window.getComputedStyle(element);

          return {
            backgroundColor: style.backgroundColor,
            color: style.color,
            fontSize: Number.parseFloat(style.fontSize),
            fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
            opacity: style.opacity,
            visibility: style.visibility,
          };
        };

        const resolveBackground = (element: HTMLElement | null): string => {
          let current: HTMLElement | null = element;

          while (current) {
            const { backgroundColor } = window.getComputedStyle(current);

            if (backgroundColor && !backgroundColor.startsWith('rgba(0, 0, 0, 0')) {
              return backgroundColor;
            }

            current = current.parentElement;
          }

          return window.getComputedStyle(document.body).backgroundColor;
        };

        /*
         * The hero renders desktop and compact variants of some controls; only
         * the currently displayed one carries the styles we assert on.
         */
        const visible = (selector: string) => {
          const candidates = [...document.querySelectorAll<HTMLElement>(selector)];

          return candidates.find((element) => element.offsetParent !== null) ?? candidates[0];
        };

        const heroHeading = visible('[data-testid="heading-hero"]');
        const heroDescription = visible('[data-testid="text-hero-description"]');
        const buildButton = visible('[data-testid="button-build-now"]');

        return {
          heroHeading: read(heroHeading),
          heroDescription: read(heroDescription),
          buildButton: read(buildButton),
          pageBackground: resolveBackground(heroHeading),
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });

      expect(snapshot.noHorizontalOverflow).toBeTruthy();
      expect(snapshot.buildButton.visibility).toBe('visible');

      for (const [label, sample] of [
        ['hero heading', snapshot.heroHeading],
        ['hero description', snapshot.heroDescription],
      ] as const) {
        const ratio = contrastRatio(sample.color, snapshot.pageBackground);
        const threshold = wcagAaThreshold(sample.fontSize, sample.fontWeight);

        expect(ratio, `${theme} ${label} contrast ${ratio.toFixed(2)} < ${threshold}`).toBeGreaterThanOrEqual(
          threshold,
        );
      }
    }
  });

  test('lets users switch between polished dark and light public themes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mobile navigation coverage stays separate');

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The public marketing surface ships light-first; the IDE stays dark-first.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible();
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible();

    const readThemeSnapshot = async () =>
      page.evaluate(() => {
        const heroHeading = document.querySelector<HTMLElement>('[data-testid="heading-hero"]')!;
        const body = window.getComputedStyle(document.body);

        return {
          htmlTheme: document.documentElement.getAttribute('data-theme'),
          storedTheme: localStorage.getItem('bolt_theme'),
          bodyBackground: body.backgroundColor,
          headingColor: window.getComputedStyle(heroHeading).color,
        };
      });

    const lightSnapshot = await readThemeSnapshot();
    expect(lightSnapshot.htmlTheme).toBe('light');
    expect(contrastRatio(lightSnapshot.headingColor, lightSnapshot.bodyBackground)).toBeGreaterThanOrEqual(4.5);

    await page.getByTestId('button-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const darkSnapshot = await readThemeSnapshot();
    expect(darkSnapshot.htmlTheme).toBe('dark');
    expect(darkSnapshot.storedTheme).toBe('dark');
    expect(contrastRatio(darkSnapshot.headingColor, darkSnapshot.bodyBackground)).toBeGreaterThanOrEqual(4.5);
    expect(darkSnapshot.bodyBackground).not.toBe(lightSnapshot.bodyBackground);

    // The choice survives a reload (cookie + localStorage persistence).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
