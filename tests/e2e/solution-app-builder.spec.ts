import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { MARKETING_SHELL_COPY } from '~/components/marketing/ecode-exact/marketing-shell.copy';
import { APP_BUILDER_COPY } from '~/components/marketing/solutions/app-builder.copy';
import {
  APP_BUILDER_VISUAL_ASSETS,
  resolveAppBuilderVisualLanguage,
} from '~/components/marketing/solutions/app-builder.visuals';
import type { SupportedLanguage } from '~/lib/i18n/language';

const ROUTE = '/solutions/app-builder';
const CANONICAL_URL = 'https://e-code.ai/solutions/app-builder';

const FRENCH_PROMPT =
  'Crée une app de réservation pour mon salon de coiffure, avec agenda, comptes clients et rappels par email.';

const COPY = APP_BUILDER_COPY.fr;

function actionAccessibleName(action: Readonly<{ label: string; ariaLabel: string }>) {
  return `${action.label}. ${action.ariaLabel}`;
}

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

const THEMES = ['light', 'dark'] as const;
const LANGUAGES = ['en', 'fr', 'es', 'ar'] as const satisfies readonly SupportedLanguage[];
const CAPTURE_LANGUAGES = ['en', 'fr'] as const satisfies readonly SupportedLanguage[];

const BANNED_PAGE_LANGUAGE =
  /(?:\bshould be\b|\bcan be\b|\bis designed to\b|trusted by|built for fortune 500|99[.,]99\s*%|4[ ,.]*500\+|10[ ,.]*000|18 global regions|soc\s*2|iso\s*27001|hipaa|customer testimonial|client testimonial)/i;

const LARGE_SOCIAL_PROOF_NUMBER = /\b\d{1,3}(?:[ ,.']\d{3})+\+?\b/;

type Theme = (typeof THEMES)[number];
type Viewport = (typeof VIEWPORTS)[number];

function expectedVisuals(copy: (typeof APP_BUILDER_COPY)[SupportedLanguage], language: SupportedLanguage) {
  const visualLanguage = resolveAppBuilderVisualLanguage(language);
  const assets = APP_BUILDER_VISUAL_ASSETS[visualLanguage];

  return [
    {
      testId: 'app-builder-visual-hero',
      ...assets.hero,
      alt: copy.visuals.system.alt,
      disclaimer: copy.visuals.disclaimer,
      loading: 'eager',
      fetchPriority: 'high',
    },
    {
      testId: 'app-builder-visual-booking',
      ...assets.booking,
      alt: copy.visuals.items[0].alt,
      disclaimer: copy.visuals.disclaimer,
      loading: 'lazy',
      fetchPriority: 'low',
    },
    {
      testId: 'app-builder-visual-schedule',
      ...assets.schedule,
      alt: copy.visuals.items[1].alt,
      disclaimer: copy.visuals.disclaimer,
      loading: 'lazy',
      fetchPriority: 'low',
    },
    {
      testId: 'app-builder-visual-reminder',
      ...assets.reminder,
      alt: copy.visuals.items[2].alt,
      disclaimer: copy.visuals.disclaimer,
      loading: 'lazy',
      fetchPriority: 'low',
    },
    {
      testId: 'app-builder-visual-ide-preview',
      ...assets.idePreview,
      alt: copy.proof.preview.alt,
      disclaimer: copy.proof.disclaimer,
      loading: 'lazy',
      fetchPriority: 'low',
    },
    {
      testId: 'app-builder-visual-ide-iteration',
      ...assets.ideIteration,
      alt: copy.proof.iteration.alt,
      disclaimer: copy.proof.disclaimer,
      loading: 'lazy',
      fetchPriority: 'low',
    },
  ] as const;
}

function runtimeBaseUrl(testBaseUrl: string | undefined) {
  return testBaseUrl ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
}

async function configureLocalizedTheme(page: Page, baseURL: string, theme: Theme, language: SupportedLanguage = 'fr') {
  await page.context().addCookies([
    { name: 'ecode_theme', value: theme, url: baseURL },
    { name: 'vibecore-lang', value: language, url: baseURL },
  ]);
  await page.addInitScript(
    ({ nextLanguage, nextTheme }) => {
      localStorage.setItem('bolt_theme', nextTheme);
      localStorage.setItem('vibecore:user-language', nextLanguage);
    },
    { nextLanguage: language, nextTheme: theme },
  );
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
}

async function expectNoHorizontalOverflow(page: Page, viewport: Viewport) {
  const measurements = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  expect(measurements.innerWidth, 'CSS viewport width').toBe(viewport.width);
  expect(measurements.documentScrollWidth, 'document horizontal overflow').toBeLessThanOrEqual(viewport.width + 1);
  expect(measurements.bodyScrollWidth, 'body horizontal overflow').toBeLessThanOrEqual(viewport.width + 1);
}

async function expectVisibleTargetsAreTouchable(page: Page) {
  const undersizedTargets = await page
    .locator('a[href], button, summary, input, select, textarea')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const target = element as HTMLElement;

        const style = window.getComputedStyle(target);
        const rect = target.getBoundingClientRect();

        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0;

        if (!visible || (rect.width >= 44 && rect.height >= 44)) {
          return [];
        }

        return [
          {
            label:
              target.getAttribute('aria-label') ??
              target.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) ??
              target.tagName,
            tag: target.tagName,
            width: rect.width,
            height: rect.height,
          },
        ];
      }),
    );

  expect(undersizedTargets, 'all visible interactive targets must measure at least 44×44 CSS pixels').toEqual([]);
}

async function expectKeyboardFocusIsVisible(page: Page) {
  let focusedAction: Locator | null = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await page.keyboard.press('Tab');

    const candidate = page.locator(':focus');

    if (await candidate.evaluate((element) => element.classList.contains('app-builder-action')).catch(() => false)) {
      focusedAction = candidate;
      break;
    }
  }

  expect(focusedAction, 'keyboard navigation must reach an App Builder CTA').not.toBeNull();

  const focusStyle = await focusedAction!.evaluate((element) => {
    const style = window.getComputedStyle(element);

    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
      boxShadow: style.boxShadow,
    };
  });

  expect(
    (focusStyle.outlineStyle !== 'none' && focusStyle.outlineWidth >= 2) || focusStyle.boxShadow !== 'none',
    'focused CTA must expose a visible outline or focus ring',
  ).toBe(true);
}

async function expectImagesAreValid(page: Page, copy = COPY, language: SupportedLanguage = 'fr') {
  const root = page.getByTestId('app-builder-page');
  const images = root.locator('img');
  const visuals = expectedVisuals(copy, language);

  await expect(images).toHaveCount(visuals.length);

  const initialGeometry = await images.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();

      return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
    }),
  );

  for (const [index, visual] of visuals.entries()) {
    const figure = page.getByTestId(visual.testId);
    const image = figure.locator('img');

    await expect(figure.locator('figcaption')).toContainText(visual.disclaimer);
    await expect(figure).toHaveAttribute('data-visual-language', visual.language);
    await expect(image).toHaveAttribute('alt', visual.alt);
    await expect(image).toHaveAttribute('src', visual.src);
    await expect(image).toHaveAttribute('width', String(visual.width));
    await expect(image).toHaveAttribute('height', String(visual.height));
    await expect(image).toHaveAttribute('loading', visual.loading);
    await expect(image).toHaveAttribute('fetchpriority', visual.fetchPriority);
    await expect(image).toHaveAttribute('decoding', 'async');

    expect(initialGeometry[index].width, `${visual.testId} must render with visible width`).toBeGreaterThan(0);
    expect(initialGeometry[index].left, `${visual.testId} left edge`).toBeGreaterThanOrEqual(-1);
    expect(initialGeometry[index].right, `${visual.testId} right edge`).toBeLessThanOrEqual(
      (await page.evaluate(() => window.innerWidth)) + 1,
    );

    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          image.evaluate((element) => {
            const htmlImage = element as HTMLImageElement;

            return htmlImage.complete ? [htmlImage.naturalWidth, htmlImage.naturalHeight] : [0, 0];
          }),
        { message: `${visual.testId} must finish loading with non-zero intrinsic dimensions` },
      )
      .toEqual([visual.width, visual.height]);

    await image.evaluate(async (element) => {
      await (element as HTMLImageElement).decode();
      await new Promise<void>((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
      });
    });
  }

  const fullSizeProofs = [
    {
      testId: 'app-builder-visual-ide-preview',
      src: APP_BUILDER_VISUAL_ASSETS[resolveAppBuilderVisualLanguage(language)].idePreview.src,
      title: copy.proof.preview.title,
    },
    {
      testId: 'app-builder-visual-ide-iteration',
      src: APP_BUILDER_VISUAL_ASSETS[resolveAppBuilderVisualLanguage(language)].ideIteration.src,
      title: copy.proof.iteration.title,
    },
  ] as const;

  await expect(root.locator('.app-builder-product-visual__full-size')).toHaveCount(fullSizeProofs.length);

  for (const proof of fullSizeProofs) {
    const control = page.getByTestId(`${proof.testId}-open-full-size`);

    await expect(control).toHaveText(copy.proof.openFullSizeLabel);
    await expect(control).toHaveAccessibleName(`${copy.proof.openFullSizeLabel}: ${proof.title}`);
    await expect(control).toHaveAttribute('href', proof.src);
    await expect(control).toHaveAttribute('target', '_blank');
    await expect(control).toHaveAttribute('rel', 'noopener');

    const targetSize = await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();

      return { height: rect.height, width: rect.width };
    });

    expect(targetSize.width, `${proof.testId} full-size control width`).toBeGreaterThanOrEqual(44);
    expect(targetSize.height, `${proof.testId} full-size control height`).toBeGreaterThanOrEqual(44);
  }
}

async function prepareFullPageCapture(page: Page) {
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>('[data-testid="app-builder-page"] img')];

    for (const image of images) {
      image.loading = 'eager';
      await image.decode();
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    window.scrollTo(0, 0);
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    });
  });

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

async function expectLocalizedSeo(page: Page, copy = COPY, language: SupportedLanguage = 'fr') {
  await expect(page).toHaveTitle(copy.seo.title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', copy.seo.description);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', CANONICAL_URL);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', copy.seo.title);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', copy.seo.description);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', CANONICAL_URL);

  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(ogImage, 'OG image must be absolute').toBeTruthy();
  expect(new URL(ogImage!).pathname).toBe(
    `/assets/og/solutions/app-builder-${resolveAppBuilderVisualLanguage(language)}.png`,
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', copy.aria.demoLabel);
}

async function expectDenseSalesContent(page: Page, language: 'en' | 'fr') {
  const copy = APP_BUILDER_COPY[language];
  const root = page.getByTestId('app-builder-page');

  await expect(root).toBeVisible({ timeout: 30_000 });
  await expect(root).toHaveAttribute('lang', language);
  await expect(root).toHaveAttribute('dir', 'ltr');
  await expect(page.getByTestId('app-builder-hero').getByRole('heading', { level: 1 })).toHaveText(copy.hero.title);
  await expect(page.getByRole('link', { name: actionAccessibleName(copy.hero.primaryCta) })).toBeVisible();
  await expect(page.getByRole('link', { name: actionAccessibleName(copy.hero.secondaryCta) })).toBeVisible();

  await expect(page.getByTestId('app-builder-problem').locator('article')).toHaveCount(3);
  await expect(page.getByTestId('app-builder-prompt').locator('blockquote')).toHaveText(copy.prompt.text);
  await expect(page.getByTestId('app-builder-prompt').locator('.app-builder-output-grid > li')).toHaveCount(4);
  await expect(page.getByTestId('app-builder-visual-hero')).toBeVisible();
  await expect(page.getByTestId('app-builder-visual-gallery').locator('figure')).toHaveCount(2);
  await expect(page.getByTestId('app-builder-ide-proof').locator('.app-builder-proof-steps > li')).toHaveCount(3);
  await expect(page.getByTestId('app-builder-ide-proof').locator('figure')).toHaveCount(2);
  await expect(page.getByTestId('app-builder-visual-ide-preview')).toBeVisible();
  await expect(page.getByTestId('app-builder-visual-ide-iteration')).toBeVisible();
  await expect(page.getByTestId('app-builder-features').getByTestId('app-builder-visual-reminder')).toBeVisible();
  await expect(page.getByTestId('app-builder-deliverables').locator('article')).toHaveCount(6);
  await expect(page.getByTestId('app-builder-features').locator('article')).toHaveCount(6);
  await expect(page.getByTestId('app-builder-use-cases').locator('article')).toHaveCount(4);
  await expect(page.getByTestId('app-builder-final-cta')).toBeVisible();

  const faq = page.getByTestId('app-builder-faq');
  const details = faq.locator('details');
  await expect(details).toHaveCount(6);

  for (const [index, item] of copy.faq.items.entries()) {
    const entry = details.nth(index);
    const summary = entry.locator('summary');

    await expect(summary).toContainText(item.question);

    if ((await entry.getAttribute('open')) === null) {
      await summary.click();
    }

    await expect(entry).toHaveAttribute('open', '');
    await expect(entry.getByText(item.answer, { exact: true })).toBeVisible();

    if (index > 0) {
      await summary.click();
      await expect(entry).not.toHaveAttribute('open', '');
    }
  }

  const visibleText = await page.locator('body').innerText();
  expect(visibleText, 'page and shared marketing shell must not expose banned copy or unverified claims').not.toMatch(
    BANNED_PAGE_LANGUAGE,
  );
  expect(
    visibleText,
    'page and shared marketing shell must not expose a fabricated large social-proof number',
  ).not.toMatch(LARGE_SOCIAL_PROOF_NUMBER);
}

test.describe('App Builder solution sales page', () => {
  test('server renders localized sales content and document language before JavaScript', async ({ request }) => {
    const response = await request.get(ROUTE, {
      headers: { Cookie: 'vibecore-lang=fr' },
    });

    const html = await response.text();

    expect(response.ok()).toBe(true);
    expect(response.headers()['content-language']).toBe('fr');
    expect(html).toContain('<html lang="fr" dir="ltr"');
    expect(html).toContain(COPY.hero.title);
    expect(html).toContain(FRENCH_PROMPT);
    expect(html).toContain('/assets/solutions/app-builder/fr/live-booking-app.png');
    expect(html).toContain('/assets/solutions/app-builder/fr/mobile-booking.png');
    expect(html).toContain('/assets/solutions/app-builder/fr/ide-agent-preview.png');
    expect(html).toContain('/assets/solutions/app-builder/fr/ide-agent-iteration.png');
    expect(html).toContain(COPY.visuals.system.alt);
    expect(html).toContain(COPY.visuals.items[2].alt);
    expect(html).toContain(COPY.proof.preview.alt);
    expect(html).toContain(COPY.proof.iteration.alt);
    expect(html).not.toContain('bolt-app-boot-fallback');
  });

  test('mobile full-size controls open each IDE proof asset in a new window', async ({ page }, testInfo) => {
    test.setTimeout(90_000);

    const baseURL = runtimeBaseUrl(testInfo.project.use.baseURL?.toString());
    const assets = APP_BUILDER_VISUAL_ASSETS.en;

    await page.setViewportSize(VIEWPORTS[0]);
    await configureLocalizedTheme(page, baseURL, 'dark', 'en');
    await page.goto(`${ROUTE}?lang=en`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-ecode-hydrated', 'true', { timeout: 60_000 });

    for (const proof of [
      { testId: 'app-builder-visual-ide-preview', src: assets.idePreview.src },
      { testId: 'app-builder-visual-ide-iteration', src: assets.ideIteration.src },
    ] as const) {
      const control = page.getByTestId(`${proof.testId}-open-full-size`);

      await control.focus();
      await expect(control).toBeFocused();

      const focusStyle = await control.evaluate((element) => {
        const style = window.getComputedStyle(element);

        return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) || 0 };
      });

      expect(focusStyle.outlineStyle).not.toBe('none');
      expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);

      const popupPromise = page.waitForEvent('popup');

      await control.click();

      const popup = await popupPromise;

      await popup.waitForLoadState('domcontentloaded');
      expect(new URL(popup.url()).pathname).toBe(proof.src);
      await popup.close();
    }
  });

  for (const language of LANGUAGES) {
    test(`${language} hydrates with localized content, metadata, and direction`, async ({ page }, testInfo) => {
      const copy = APP_BUILDER_COPY[language];
      const shellCopy = MARKETING_SHELL_COPY[language];
      const direction = language === 'ar' ? 'rtl' : 'ltr';
      const viewport = VIEWPORTS[0];
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const baseURL = runtimeBaseUrl(testInfo.project.use.baseURL?.toString());

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.setViewportSize(viewport);
      await configureLocalizedTheme(page, baseURL, 'dark', language);
      await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });

      await expect(page.locator('html')).toHaveAttribute('data-ecode-hydrated', 'true');
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('html')).toHaveAttribute('dir', direction);
      await expect(page.getByTestId('app-builder-page')).toHaveAttribute('lang', language);
      await expect(page.getByTestId('app-builder-page')).toHaveAttribute('dir', direction);
      await expect(page.getByTestId('app-builder-hero').getByRole('heading', { level: 1 })).toHaveText(copy.hero.title);
      await expect(page.getByTestId('app-builder-prompt').locator('blockquote')).toHaveText(copy.prompt.text);
      await expectImagesAreValid(page, copy, language);
      await expect(page.getByRole('link', { name: shellCopy.a11y.skipToContent })).toBeAttached();
      await expect(page.getByRole('navigation', { name: shellCopy.a11y.mainNavigation })).toBeVisible();
      await expect(page.getByTestId('link-login')).toHaveAccessibleName(shellCopy.navigation.logIn);
      await expect(page.getByTestId('button-theme-toggle')).toHaveAccessibleName(
        `${shellCopy.theme.dark}. ${shellCopy.theme.switchToLight}`,
      );
      await expect(page.getByRole('contentinfo', { name: shellCopy.a11y.siteFooter })).toContainText(
        shellCopy.footer.title,
      );
      await expectLocalizedSeo(page, copy, language);
      await expectNoHorizontalOverflow(page, viewport);

      await page.getByRole('button', { name: shellCopy.a11y.openMobileMenu }).click();

      const mobileDialog = page.getByRole('dialog');

      await expect(mobileDialog).toHaveAttribute('dir', direction);
      await expect(mobileDialog.getByRole('heading', { name: shellCopy.a11y.mobileMenuTitle })).toBeAttached();
      await expect(mobileDialog.getByText(shellCopy.navigation.items.appBuilder.title, { exact: true })).toBeVisible();

      if (language === 'ar') {
        const drawerPosition = await mobileDialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();

          return { left: rect.left, right: rect.right };
        });

        expect(drawerPosition.left).toBeLessThanOrEqual(1);
        expect(drawerPosition.right).toBeLessThanOrEqual(viewport.width + 1);
      }

      await mobileDialog.getByRole('button', { name: shellCopy.a11y.closeMobileMenu }).click();
      await expect(mobileDialog).toBeHidden();

      if (language === 'ar') {
        const arrowTransforms = await page
          .locator('.app-builder-action svg, .app-builder-bridge svg, .app-builder-prompt-card__command svg')
          .evaluateAll((arrows) => arrows.map((arrow) => window.getComputedStyle(arrow).transform));

        expect(arrowTransforms.length).toBeGreaterThan(0);
        expect(arrowTransforms.every((transform) => transform !== 'none')).toBe(true);
      }

      expect(consoleErrors, `${language} browser console errors`).toEqual([]);
      expect(pageErrors, `${language} uncaught page errors`).toEqual([]);
    });
  }

  test('the single global header language switch completes a real English-French round trip', async ({
    page,
  }, testInfo) => {
    const baseURL = runtimeBaseUrl(testInfo.project.use.baseURL?.toString());

    await configureLocalizedTheme(page, baseURL, 'light', 'en');
    await page.goto(`${ROUTE}?lang=en`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-ecode-hydrated', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('app-builder-visual-hero')).toHaveAttribute('data-visual-language', 'en');

    const globalLanguageSwitch = page.locator('header').getByTestId('language-switch');

    await expect(page.getByTestId('language-switch')).toHaveCount(1);
    await expect(globalLanguageSwitch).toBeVisible();
    await expect(globalLanguageSwitch).toHaveAccessibleName('Choose display language');
    await expect(page.getByTestId('app-builder-hero').getByTestId('language-switch')).toHaveCount(0);

    const activeEnglishButton = globalLanguageSwitch.getByRole('button', { name: 'Current language: English' });
    const frenchButton = globalLanguageSwitch.getByRole('button', { name: 'French' });

    await expect(activeEnglishButton).toHaveText('EN');
    await expect(activeEnglishButton).toHaveAttribute('aria-pressed', 'true');
    await expect(frenchButton).toHaveText('FR');
    await expect(frenchButton).toHaveAttribute('aria-pressed', 'false');
    await frenchButton.click();

    await expect(page).toHaveURL(new URL(`${ROUTE}?lang=fr`, baseURL).toString(), { timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('data-ecode-hydrated', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByTestId('app-builder-visual-hero')).toHaveAttribute('data-visual-language', 'fr');
    await expect(page.getByTestId('app-builder-visual-hero').locator('img')).toHaveAttribute(
      'src',
      APP_BUILDER_VISUAL_ASSETS.fr.hero.src,
    );

    await expect(page.getByTestId('language-switch')).toHaveCount(1);
    await expect(globalLanguageSwitch).toHaveAccessibleName("Choisir la langue d'affichage");

    const englishButton = globalLanguageSwitch.getByRole('button', { name: 'Anglais' });
    const activeFrenchButton = globalLanguageSwitch.getByRole('button', { name: 'Langue actuelle : Français' });

    await expect(englishButton).toHaveText('EN');
    await expect(englishButton).toHaveAttribute('aria-pressed', 'false');
    await expect(activeFrenchButton).toHaveText('FR');
    await expect(activeFrenchButton).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(
        async () => (await page.context().cookies(baseURL)).find((cookie) => cookie.name === 'vibecore-lang')?.value,
      )
      .toBe('fr');
    await englishButton.click();

    await expect(page).toHaveURL(new URL(`${ROUTE}?lang=en`, baseURL).toString(), { timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('data-ecode-hydrated', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('app-builder-visual-hero')).toHaveAttribute('data-visual-language', 'en');
    await expect(page.getByTestId('app-builder-visual-hero').locator('img')).toHaveAttribute(
      'src',
      APP_BUILDER_VISUAL_ASSETS.en.hero.src,
    );
    await expect(page.getByTestId('language-switch')).toHaveCount(1);
    await expect
      .poll(
        async () => (await page.context().cookies(baseURL)).find((cookie) => cookie.name === 'vibecore-lang')?.value,
      )
      .toBe('en');
  });

  for (const language of CAPTURE_LANGUAGES) {
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        test(`${language} ${theme} ${viewport.width}x${viewport.height} is complete, accessible, responsive, and captured`, async ({
          page,
        }, testInfo) => {
          const copy = APP_BUILDER_COPY[language];
          const consoleErrors: string[] = [];
          const pageErrors: string[] = [];
          const baseURL = runtimeBaseUrl(testInfo.project.use.baseURL?.toString());

          page.on('console', (message) => {
            if (message.type() === 'error') {
              consoleErrors.push(message.text());
            }
          });
          page.on('pageerror', (error) => pageErrors.push(error.message));

          await page.setViewportSize(viewport);
          await configureLocalizedTheme(page, baseURL, theme, language);
          await page.goto(`${ROUTE}?lang=${language}`, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('html')).toHaveAttribute('data-ecode-hydrated', 'true');
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(page.locator('html')).toHaveAttribute('lang', language);
          await expect(page.getByTestId('branded-route-loader')).toHaveAttribute('aria-hidden', 'true');
          await expect
            .poll(() =>
              page.getByTestId('branded-route-loader').evaluate((element) => window.getComputedStyle(element).opacity),
            )
            .toBe('0');
          await page.evaluate(async () => {
            await document.fonts.ready;
          });

          await expectDenseSalesContent(page, language);
          await expectLocalizedSeo(page, copy, language);

          const h1Typography = await page
            .getByTestId('app-builder-hero')
            .getByRole('heading', { level: 1 })
            .evaluate((heading) => {
              const style = window.getComputedStyle(heading);

              return { fontFamily: style.fontFamily, fontSize: style.fontSize };
            });
          expect(h1Typography.fontSize).toBe(viewport.width === 390 ? '28px' : '32px');
          expect(h1Typography.fontFamily).toContain('IBM Plex Sans');

          await expectNoHorizontalOverflow(page, viewport);
          await expectVisibleTargetsAreTouchable(page);
          await expectKeyboardFocusIsVisible(page);
          await expectImagesAreValid(page, copy, language);
          await prepareFullPageCapture(page);

          const screenshotPath = resolve(
            process.cwd(),
            'outputs/solutions/app-builder',
            language,
            theme,
            `${viewport.width}x${viewport.height}.png`,
          );
          await mkdir(dirname(screenshotPath), { recursive: true });
          await page.screenshot({
            path: screenshotPath,
            animations: 'disabled',
            caret: 'hide',
            fullPage: true,
            scale: 'css',
          });

          expect(consoleErrors, 'browser console errors').toEqual([]);
          expect(pageErrors, 'uncaught page errors').toEqual([]);
        });
      }
    }
  }
});
