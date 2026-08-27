import { expect, test } from '@playwright/test';

const authRoutes = [
  { route: '/login', heading: 'Welcome back' },
  { route: '/signup', heading: 'Create your account' },
  { route: '/forgot-password', heading: 'Forgot your password?' },
  { route: '/reset-password', heading: 'Reset your password' },
  { route: '/verify-email', heading: 'Confirm your email' },
] as const;

function parseRgb(value: string) {
  const [r = 0, g = 0, b = 0] = value.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];

  return { r, g, b };
}

function luminance(value: string) {
  const { r, g, b } = parseRgb(value);

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function contrastRatio(foreground: string, background: string) {
  const normalize = (channel: number) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  const colorLuminance = (color: string) => {
    const { r, g, b } = parseRgb(color);

    return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
  };

  const light = Math.max(colorLuminance(foreground), colorLuminance(background));
  const dark = Math.min(colorLuminance(foreground), colorLuminance(background));

  return (light + 0.05) / (dark + 0.05);
}

for (const theme of ['dark', 'light'] as const) {
  test(`auth routes stay readable and responsive in ${theme} theme`, async ({ page }) => {
    await page.addInitScript((nextTheme) => {
      localStorage.setItem('bolt_theme', nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    }, theme);

    for (const { route, heading } of authRoutes) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });

      expect(response?.status(), `${route} should load`).toBeLessThan(400);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();

      const snapshot = await page.locator('.vc-auth-page').evaluate((root) => {
        const pageStyle = window.getComputedStyle(root);
        const title = window.getComputedStyle(root.querySelector('.vc-auth-title')!);
        const card = window.getComputedStyle(root.querySelector('.vc-auth-card')!);
        const label = window.getComputedStyle(root.querySelector('.vc-auth-label')!);
        const input = window.getComputedStyle(root.querySelector('.vc-auth-input')!);

        const darkCardDescendants = [...root.querySelectorAll<HTMLElement>('.vc-auth-card, .vc-auth-card *')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const [r = 0, g = 0, b = 0, a = 1] = style.backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];

            return rect.width > 12 && rect.height > 12 && a !== 0 && r < 45 && g < 55 && b < 75;
          })
          .map((element) => element.className.toString());

        return {
          htmlTheme: document.documentElement.getAttribute('data-theme'),
          colorScheme: document.documentElement.style.colorScheme,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          pageBackground: pageStyle.backgroundColor,
          titleColor: title.color,
          cardBackground: card.backgroundColor,
          cardBorder: card.borderColor,
          labelColor: label.color,
          inputBackground: input.backgroundColor,
          inputColor: input.color,
          inputBorder: input.borderColor,
          darkCardDescendants,
        };
      });

      expect(snapshot.htmlTheme).toBe(theme);
      expect(snapshot.colorScheme).toBe(theme);
      expect(snapshot.documentWidth, `${route} should not overflow horizontally`).toBeLessThanOrEqual(
        snapshot.viewportWidth + 2,
      );
      expect(contrastRatio(snapshot.titleColor, snapshot.pageBackground), `${route} title contrast`).toBeGreaterThan(
        4.5,
      );
      expect(contrastRatio(snapshot.inputColor, snapshot.inputBackground), `${route} input contrast`).toBeGreaterThan(
        4.5,
      );
      expect(contrastRatio(snapshot.labelColor, snapshot.cardBackground), `${route} label contrast`).toBeGreaterThan(
        4.5,
      );

      if (theme === 'light') {
        expect(luminance(snapshot.pageBackground), `${route} page background should be light`).toBeGreaterThan(0.9);
        expect(luminance(snapshot.cardBackground), `${route} card background should be light`).toBeGreaterThan(0.9);
        expect(luminance(snapshot.inputBackground), `${route} input background should be light`).toBeGreaterThan(0.9);
        expect(snapshot.darkCardDescendants, `${route} should not keep dark card descendants in light theme`).toEqual(
          [],
        );
      } else {
        expect(luminance(snapshot.pageBackground), `${route} page background should be dark`).toBeLessThan(0.12);
        expect(luminance(snapshot.cardBackground), `${route} card background should be dark`).toBeLessThan(0.18);
        expect(luminance(snapshot.inputBackground), `${route} input background should be dark`).toBeLessThan(0.12);
      }
    }
  });
}
