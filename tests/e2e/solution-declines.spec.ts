import { expect, test, type Page } from '@playwright/test';

import { CHATBOT_BUILDER_COPY } from '~/components/marketing/solutions/chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from '~/components/marketing/solutions/dashboard-builder.copy';
import { FREELANCERS_COPY } from '~/components/marketing/solutions/freelancers.copy';
import { GAME_BUILDER_COPY } from '~/components/marketing/solutions/game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from '~/components/marketing/solutions/internal-ai-builder.copy';
import type { SolutionCopyByLanguage } from '~/components/marketing/solutions/solution-copy';
import {
  getSolutionProofVisuals,
  SOLUTION_PROOF_VISUAL_SLOTS,
  type CapturedSolutionProofVisualSlug,
  type SolutionProofVisualAsset,
  type SolutionProofVisualTheme,
} from '~/components/marketing/solutions/solution-proof.visuals';
import { STARTUPS_COPY } from '~/components/marketing/solutions/startups.copy';
import { WEBSITE_BUILDER_COPY } from '~/components/marketing/solutions/website-builder.copy';

const SOLUTIONS = [
  { slug: 'website-builder', copy: WEBSITE_BUILDER_COPY },
  { slug: 'game-builder', copy: GAME_BUILDER_COPY },
  { slug: 'dashboard-builder', copy: DASHBOARD_BUILDER_COPY },
  { slug: 'chatbot-builder', copy: CHATBOT_BUILDER_COPY },
  { slug: 'internal-ai-builder', copy: INTERNAL_AI_BUILDER_COPY },
  { slug: 'startups', copy: STARTUPS_COPY },
  { slug: 'freelancers', copy: FREELANCERS_COPY },
] as const satisfies ReadonlyArray<{ slug: CapturedSolutionProofVisualSlug; copy: SolutionCopyByLanguage }>;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

const THEMES = ['light', 'dark'] as const;
const LANGUAGES = ['en', 'fr'] as const;

const HERO_VISUAL_SIZES = '(min-width: 1200px) 560px, (min-width: 900px) 48vw, calc(100vw - 32px)';
const CARD_VISUAL_SIZES = '(min-width: 1200px) 540px, (min-width: 768px) calc(100vw - 64px), calc(100vw - 32px)';

function actionAccessibleName(action: Readonly<{ label: string; ariaLabel?: string }>): string {
  return action.ariaLabel?.trim() || action.label;
}

function runtimeBaseUrl(testBaseUrl: string | undefined): string {
  return testBaseUrl ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
}

async function configureTheme(page: Page, baseURL: string, theme: SolutionProofVisualTheme) {
  await page.context().addCookies([{ name: 'ecode_theme', value: theme, url: baseURL }]);
  await page.addInitScript((nextTheme) => localStorage.setItem('bolt_theme', nextTheme), theme);
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

async function expectResponsiveSourcesLoad(page: Page, asset: SolutionProofVisualAsset) {
  const loadedSources = await page.evaluate(async (sources) => {
    return Promise.all(
      sources.map(
        (source) =>
          new Promise<{ height: number; pathname: string; width: number }>((resolveSource, rejectSource) => {
            const image = new Image();

            image.onload = () => {
              resolveSource({
                height: image.naturalHeight,
                pathname: new URL(image.currentSrc || image.src, window.location.href).pathname,
                width: image.naturalWidth,
              });
            };
            image.onerror = () => rejectSource(new Error(`Unable to load responsive source ${source.src}`));
            image.src = source.src;
          }),
      ),
    );
  }, asset.sources);

  expect(loadedSources).toEqual(
    asset.sources.map((source) => ({ height: source.height, pathname: source.src, width: source.width })),
  );
}

async function expectProofImages(
  page: Page,
  slug: CapturedSolutionProofVisualSlug,
  language: (typeof LANGUAGES)[number],
  theme: SolutionProofVisualTheme,
) {
  const assets = getSolutionProofVisuals(slug, language, theme);

  const figures = page.locator('[data-real-solution-proof="true"]');
  const images = figures.locator('img');

  await expect(images).toHaveCount(SOLUTION_PROOF_VISUAL_SLOTS.length);

  for (const [index, slot] of SOLUTION_PROOF_VISUAL_SLOTS.entries()) {
    const asset = assets[slot];
    const image = images.nth(index);
    const sizes = index === 0 ? HERO_VISUAL_SIZES : CARD_VISUAL_SIZES;

    await expect(image).toHaveAttribute('src', asset.src);
    await expect(image).toHaveAttribute('srcset', asset.srcSet);
    await expect(image).toHaveAttribute('sizes', sizes);
    await expect(image).toHaveAttribute('width', '1440');
    await expect(image).toHaveAttribute('height', '900');
    await expect(image).toHaveAttribute('loading', index === 0 ? 'eager' : 'lazy');
    await expect(image).toHaveAttribute('fetchpriority', index === 0 ? 'high' : 'low');
    await expect(image).toHaveAttribute('decoding', 'async');
    await expect(figures.nth(index)).toHaveAttribute('data-visual-solution', slug);
    await expect(figures.nth(index)).toHaveAttribute('data-visual-slot', slot);
    await expect(figures.nth(index)).toHaveAttribute('data-visual-language', language);
    await expect(figures.nth(index)).toHaveAttribute('data-visual-theme', theme);

    const alt = await image.getAttribute('alt');

    expect(alt?.trim().length).toBeGreaterThan(20);
    expect(asset.sources.map((source) => source.width)).toEqual([720, 1440]);
    expect(asset.sources.map((source) => source.height)).toEqual([450, 900]);
    expect(asset.sources.every((source) => source.src.endsWith(`-${source.width}.webp`))).toBe(true);

    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          image.evaluate((element) => {
            const htmlImage = element as HTMLImageElement;

            return htmlImage.complete && htmlImage.naturalWidth > 0 && htmlImage.naturalHeight > 0;
          }),
        { message: `${slug}/${language}/${theme}/${slot} must load a non-zero responsive image` },
      )
      .toBe(true);

    const selectedSource = await image.evaluate((element) => {
      const htmlImage = element as HTMLImageElement;

      return {
        currentPathname: new URL(htmlImage.currentSrc, window.location.href).pathname,
        naturalHeight: htmlImage.naturalHeight,
        naturalWidth: htmlImage.naturalWidth,
      };
    });

    expect(
      asset.sources.map((source) => source.src),
      `${slug}/${language}/${theme}/${slot} must select one declared responsive WebP source`,
    ).toContain(selectedSource.currentPathname);
    expect(selectedSource.naturalWidth / selectedSource.naturalHeight).toBeCloseTo(asset.width / asset.height, 2);
    await expectResponsiveSourcesLoad(page, asset);
  }
}

test.describe('declined solution sales pages', () => {
  for (const solution of SOLUTIONS) {
    for (const language of LANGUAGES) {
      for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
          test(`${solution.slug} ${language} ${theme} ${viewport.width}px`, async ({ page }, testInfo) => {
            test.setTimeout(90_000);

            const copy = solution.copy[language];
            const errors: string[] = [];
            const baseURL = runtimeBaseUrl(testInfo.project.use.baseURL?.toString());

            page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
            page.on('pageerror', (error) => errors.push(error.message));

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

            const primaryCta = page
              .getByTestId('solution-hero')
              .getByRole('link', { name: actionAccessibleName(copy.hero.primaryCta), exact: true });
            const secondaryCta = page
              .getByTestId('solution-hero')
              .getByRole('link', { name: actionAccessibleName(copy.hero.secondaryCta), exact: true });

            await expect(primaryCta).toHaveAttribute('aria-label', copy.hero.primaryCta.ariaLabel);
            await expect(secondaryCta).toHaveAttribute('aria-label', copy.hero.secondaryCta.ariaLabel);
            await expect(page.getByTestId('solution-ide-prompt')).toContainText(copy.proofLink.disclaimer);
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
            await expectProofImages(page, solution.slug, language, theme);

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
          });
        }
      }
    }
  }
});
