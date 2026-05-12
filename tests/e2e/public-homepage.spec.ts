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

  test('keeps the public homepage readable in light and dark themes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop theme contrast is covered here; mobile has a separate navigation flow');

    for (const theme of ['dark', 'light'] as const) {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.evaluate((nextTheme) => {
        localStorage.setItem('bolt_theme', nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
        document.documentElement.classList.toggle('dark', nextTheme === 'dark');
      }, theme);
      await page.reload({ waitUntil: 'domcontentloaded' });

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Start building' }).first()).toBeVisible();
      await expect(page.getByTestId('button-homepage-build')).toBeVisible();

      const snapshot = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('.vc-public-shell')!;
        const heroHeading = document.querySelector<HTMLElement>('[data-testid="section-hero"] h1')!;
        const navSummary = document.querySelector<HTMLElement>('.vc-marketing-menu summary')!;
        const builderButton = document.querySelector<HTMLElement>('[data-testid="button-homepage-build"]')!;
        const startBuildingLink = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find(
          (link) => link.textContent?.trim() === 'Start building',
        )!;

        const read = (element: HTMLElement) => {
          const style = window.getComputedStyle(element);

          return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            color: style.color,
            opacity: style.opacity,
            rect: element.getBoundingClientRect().toJSON(),
            visibility: style.visibility,
          };
        };

        return {
          shell: read(shell),
          heroHeading: read(heroHeading),
          navSummary: read(navSummary),
          builderButton: read(builderButton),
          startBuildingLink: read(startBuildingLink),
          tokens: {
            text: window.getComputedStyle(shell).getPropertyValue('--vc-public-text').trim(),
            background: window.getComputedStyle(shell).getPropertyValue('--vc-public-bg').trim(),
            buttonText: window.getComputedStyle(shell).getPropertyValue('--vc-public-button-text').trim(),
          },
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });

      expect(snapshot.noHorizontalOverflow).toBeTruthy();
      expect(snapshot.builderButton.backgroundImage).toContain('linear-gradient');
      expect(snapshot.startBuildingLink.backgroundImage).toContain('linear-gradient');
      expect(snapshot.builderButton.visibility).toBe('visible');
      expect(snapshot.startBuildingLink.visibility).toBe('visible');
      expect(Number(snapshot.builderButton.opacity)).toBeGreaterThan(0.95);
      expect(Number(snapshot.startBuildingLink.opacity)).toBeGreaterThan(0.95);
      expect(contrastRatio(snapshot.heroHeading.color, snapshot.shell.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(snapshot.navSummary.color, snapshot.shell.backgroundColor)).toBeGreaterThanOrEqual(4.5);

      if (theme === 'light') {
        expect(snapshot.tokens).toMatchObject({
          text: '#0f172a',
          background: '#f8fafc',
          buttonText: '#ffffff',
        });
        expect(snapshot.builderButton.color).toBe('rgb(255, 255, 255)');
      } else {
        expect(snapshot.tokens).toMatchObject({
          text: '#f8fafc',
          background: '#080b13',
          buttonText: '#111827',
        });
        expect(snapshot.builderButton.color).toBe('rgb(17, 24, 39)');
      }
    }
  });
});
