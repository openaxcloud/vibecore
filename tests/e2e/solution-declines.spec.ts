import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { CHATBOT_BUILDER_COPY } from '~/components/marketing/solutions/chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from '~/components/marketing/solutions/dashboard-builder.copy';
import { ENTERPRISE_COPY } from '~/components/marketing/solutions/enterprise.copy';
import { FREELANCERS_COPY } from '~/components/marketing/solutions/freelancers.copy';
import { GAME_BUILDER_COPY } from '~/components/marketing/solutions/game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from '~/components/marketing/solutions/internal-ai-builder.copy';
import { SOLUTION_APP_SHOWCASES } from '~/components/marketing/solutions/solution-app-showcases';
import type { SolutionCopyByLanguage } from '~/components/marketing/solutions/solution-copy';
import { STARTUPS_COPY } from '~/components/marketing/solutions/startups.copy';
import { WEBSITE_BUILDER_COPY } from '~/components/marketing/solutions/website-builder.copy';

const SOLUTIONS = [
  { slug: 'website-builder', copy: WEBSITE_BUILDER_COPY },
  { slug: 'game-builder', copy: GAME_BUILDER_COPY },
  { slug: 'dashboard-builder', copy: DASHBOARD_BUILDER_COPY },
  { slug: 'chatbot-builder', copy: CHATBOT_BUILDER_COPY },
  { slug: 'internal-ai-builder', copy: INTERNAL_AI_BUILDER_COPY },
  { slug: 'enterprise', copy: ENTERPRISE_COPY },
  { slug: 'startups', copy: STARTUPS_COPY },
  { slug: 'freelancers', copy: FREELANCERS_COPY },
] as const satisfies ReadonlyArray<{ slug: string; copy: SolutionCopyByLanguage }>;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

const THEMES = ['light', 'dark'] as const;
const LANGUAGES = ['en', 'fr'] as const;
const SCREENSHOT_WIDTHS = new Set([390, 768, 1440]);
const screenshotDirectory = process.env.SOLUTION_SCREENSHOT_DIR?.trim();

function runtimeBaseUrl(testBaseUrl: string | undefined): string {
  return testBaseUrl ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
}

async function configureTheme(page: Page, baseURL: string, theme: (typeof THEMES)[number]) {
  await page.context().addCookies([{ name: 'ecode_theme', value: theme, url: baseURL }]);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  const sizes = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));

  expect(sizes.viewport).toBe(width);
  expect(sizes.body).toBeLessThanOrEqual(width + 1);
  expect(sizes.document).toBeLessThanOrEqual(width + 1);
}

async function expectTouchTargets(page: Page) {
  const undersized = await page.locator('.sol-sales a[href], .sol-sales summary').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const target = element as HTMLElement;
      const bounds = target.getBoundingClientRect();
      const style = window.getComputedStyle(target);

      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        bounds.width > 0 &&
        bounds.height > 0;

      if (!visible || (bounds.width >= 44 && bounds.height >= 44)) {
        return [];
      }

      return [
        {
          height: bounds.height,
          label: target.getAttribute('aria-label') ?? target.textContent?.trim().slice(0, 80),
          width: bounds.width,
        },
      ];
    }),
  );

  expect(undersized, 'every visible solution-page target must measure at least 44×44 CSS pixels').toEqual([]);
}

async function expectPreviewTouchTargets(page: Page, selector: string) {
  const undersized = await page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const target = element as HTMLElement;
      const bounds = target.getBoundingClientRect();
      const style = window.getComputedStyle(target);
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        bounds.width > 0 &&
        bounds.height > 0;

      return visible && (bounds.width < 44 || bounds.height < 44)
        ? [
            {
              height: bounds.height,
              label: target.getAttribute('aria-label') ?? target.textContent?.trim().slice(0, 80),
              width: bounds.width,
            },
          ]
        : [];
    }),
  );

  expect(undersized, 'every visible linked-demo target must measure at least 44×44 CSS pixels').toEqual([]);
}

async function expectRealAppImages(
  page: Page,
  slug: (typeof SOLUTIONS)[number]['slug'],
  language: (typeof LANGUAGES)[number],
) {
  const showcase = SOLUTION_APP_SHOWCASES[slug];
  const heroImage = page.getByTestId('solution-demo').locator('img');

  await expect(heroImage).toHaveAttribute('src', showcase.primary.thumbnailSrc);
  await expect(heroImage).toHaveAttribute('width', '1200');
  await expect(heroImage).toHaveAttribute('height', '675');
  await expect(heroImage).toHaveAttribute('loading', 'eager');
  await expect(heroImage).toHaveAttribute('alt', showcase.primary.alt[language]);

  const images = page.locator('[data-testid="solution-ide-proof-gallery"] img');
  const expectedVisuals = [showcase.supporting, showcase.related];

  await expect(images).toHaveCount(2);

  for (const [index, visual] of expectedVisuals.entries()) {
    const image = images.nth(index);

    await expect(image).toHaveAttribute('src', visual.thumbnailSrc);
    await expect(image).toHaveAttribute('width', '1200');
    await expect(image).toHaveAttribute('height', '675');
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveAttribute('decoding', 'async');
    await expect(image).toHaveAttribute('alt', visual.alt[language]);
    expect(await image.getAttribute('src')).not.toContain('/assets/solutions/app-builder/');

    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const htmlImage = element as HTMLImageElement;

          return htmlImage.complete ? [htmlImage.naturalWidth, htmlImage.naturalHeight] : [0, 0];
        }),
      )
      .toEqual([1200, 675]);
  }

  await heroImage.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      heroImage.evaluate((element) => {
        const image = element as HTMLImageElement;

        return image.complete ? [image.naturalWidth, image.naturalHeight] : [0, 0];
      }),
    )
    .toEqual([1200, 675]);

  await expect(page.locator('.sol-sales [data-testid="language-switch"]')).toHaveCount(0);
  await expect(page.getByTestId('language-switch')).toHaveCount(1);
}

test.describe('solution sales pages', () => {
  for (const solution of SOLUTIONS) {
    for (const language of LANGUAGES) {
      for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
          test(`${solution.slug} ${language} ${theme} ${viewport.width}px`, async ({ page }, testInfo) => {
            test.setTimeout(90_000);

            const copy = solution.copy[language];
            const errors: string[] = [];
            const baseURL = runtimeBaseUrl(testInfo.project.use.baseURL?.toString());
            const baseOrigin = new URL(baseURL).origin;

            page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('requestfailed', (request) => {
              if (new URL(request.url()).origin === baseOrigin) {
                errors.push(`request failed: ${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
              }
            });
            page.on('response', (response) => {
              const resourceType = response.request().resourceType();

              if (
                new URL(response.url()).origin === baseOrigin &&
                response.status() >= 400 &&
                ['document', 'script', 'stylesheet', 'image', 'font'].includes(resourceType)
              ) {
                errors.push(`resource ${response.status()}: ${response.url()}`);
              }
            });

            await page.setViewportSize(viewport);
            await configureTheme(page, baseURL, theme);
            await page.goto(`/solutions/${solution.slug}?lang=${language}`, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('html')).toHaveAttribute('data-ecode-hydrated', 'true', { timeout: 30_000 });
            await page.evaluate((nextTheme) => {
              const root = document.documentElement;

              root.setAttribute('data-theme', nextTheme);
              root.classList.toggle('dark', nextTheme === 'dark');
              root.classList.toggle('light', nextTheme === 'light');
              root.style.colorScheme = nextTheme;
            }, theme);

            const root = page.getByTestId('solution-page');

            await expect(root).toBeVisible({ timeout: 30_000 });
            await expect(root).toHaveAttribute('lang', language);
            await expect(page.locator('html')).toHaveAttribute('lang', language);
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await expect(page).toHaveTitle(copy.seo.title);
            await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', copy.seo.description);
            await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
              'content',
              `https://e-code.ai/assets/og/solutions/${solution.slug}-${language}.png`,
            );
            await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
            await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');

            await expect(root.locator(':scope > section')).toHaveCount(9);
            await expect(page.getByTestId('solution-hero').getByRole('heading', { level: 1 })).toHaveText(
              copy.hero.title,
            );
            await expect(page.getByTestId('solution-demo')).toHaveAttribute('data-visual-kind', 'working-demo-app');
            await expect(page.getByTestId('solution-demo')).toHaveAttribute(
              'data-gallery-app-id',
              SOLUTION_APP_SHOWCASES[solution.slug].primary.id,
            );
            await expect(page.getByTestId('solution-problem').locator('article')).toHaveCount(3);
            await expect(page.getByTestId('solution-build').locator('blockquote')).toHaveText(copy.build.promptText);
            await expect(page.getByTestId('solution-build').locator('.sol-output-grid > li')).toHaveCount(4);
            await expect(page.getByTestId('solution-deliverables').locator('article')).toHaveCount(6);
            await expect(page.getByTestId('solution-features').locator('article')).toHaveCount(6);
            await expect(page.getByTestId('solution-use-cases').locator('article')).toHaveCount(4);
            await expect(page.getByTestId('solution-faq').locator('details')).toHaveCount(5);
            await expect(page.getByTestId('solution-final-cta')).toBeVisible();

            const h1Style = await page
              .getByTestId('solution-hero')
              .getByRole('heading', { level: 1 })
              .evaluate((element) => {
                const style = window.getComputedStyle(element);

                return { fontFamily: style.fontFamily, fontSize: style.fontSize };
              });

            expect(h1Style.fontFamily).toContain('IBM Plex Sans');
            expect(h1Style.fontSize).toBe(viewport.width === 390 ? '28px' : '32px');

            await expectNoHorizontalOverflow(page, viewport.width);
            await expectTouchTargets(page);
            await expectRealAppImages(page, solution.slug, language);

            await page.evaluate(() => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            });

            let reachedAction = false;

            for (let attempt = 0; attempt < 80; attempt += 1) {
              await page.keyboard.press('Tab');

              reachedAction = await page
                .locator(':focus')
                .evaluate((element) => element.classList.contains('sol-action'))
                .catch(() => false);

              if (reachedAction) {
                break;
              }
            }

            expect(reachedAction, 'keyboard navigation must reach a solution CTA').toBe(true);

            const focus = await page.locator(':focus').evaluate((element) => {
              const style = window.getComputedStyle(element);

              return {
                boxShadow: style.boxShadow,
                outline: style.outlineStyle,
                width: Number.parseFloat(style.outlineWidth) || 0,
              };
            });

            expect(
              (focus.outline !== 'none' && focus.width >= 2) || focus.boxShadow !== 'none',
              'focused CTA must expose a visible outline or focus ring',
            ).toBe(true);
            expect(errors).toEqual([]);

            if (screenshotDirectory && SCREENSHOT_WIDTHS.has(viewport.width)) {
              const output = join(screenshotDirectory, solution.slug, language, theme);

              mkdirSync(output, { recursive: true });
              await page.screenshot({
                path: join(output, `${viewport.width}.png`),
                fullPage: true,
                animations: 'disabled',
              });
            }
          });
        }
      }
    }
  }
});

test.describe('linked solution demo apps', () => {
  test('Docs Copilot is functional and touch-safe on mobile and desktop', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];

    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(`${request.method()} ${request.url()}`));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/gallery-apps/docs-copilot/preview/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-gallery-app-id="docs-copilot"]')).toBeVisible();
    await expectNoHorizontalOverflow(page, 390);
    await expectPreviewTouchTargets(page, 'button, a[href], textarea, .source-toggle');

    await page.getByRole('button', { name: 'How do I invite a teammate?' }).click();
    await expect(page.getByText(/Open Settings → Members/)).toBeVisible();
    await page.getByRole('button', { name: /New conversation/ }).click();
    await expect(page.getByText(/Open Settings → Members/)).toHaveCount(0);

    await page.setViewportSize({ width: 1200, height: 675 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.source-toggle')).toHaveCount(8);
    await expectPreviewTouchTargets(page, 'button, a[href], textarea, .source-toggle, .source-toggle input');
    expect(errors).toEqual([]);
  });

  test('Neon Trivia Arena plays a real round and exposes mobile-safe controls', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];

    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(`${request.method()} ${request.url()}`));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/gallery-apps/neon-trivia-arena/preview/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-gallery-app-id="neon-trivia-arena"]')).toBeVisible();
    await expectNoHorizontalOverflow(page, 390);
    await expectPreviewTouchTargets(page, 'button, a[href]');

    await page.getByRole('button', { name: /50:50/ }).click();
    await expect(page.locator('.answer[data-state="hidden"]')).toHaveCount(2);
    await page.locator('.answer:not([data-state="hidden"])').first().click();
    await expect(page.locator('.feedback')).toBeVisible();
    await page.getByRole('button', { name: /Next question/ }).click();
    await expect(page.locator('.round-label')).toContainText('ROUND 02');
    expect(errors).toEqual([]);
  });
});
