import { expect, test, type Locator, type Page } from '@playwright/test';

const SOLUTION_SLUGS = [
  'website-builder',
  'game-builder',
  'dashboard-builder',
  'chatbot-builder',
  'internal-ai-builder',
  'enterprise',
  'startups',
  'freelancers',
] as const;

const LANGUAGES = ['en', 'fr'] as const;

/**
 * The adjacent 899/900 and 959/960 widths are intentional regression probes.
 * A former 960px grid switch made the hero visual lose roughly half its size in
 * one CSS pixel. Keeping equal heights on each adjacent pair makes the geometry
 * comparison meaningful and independent of the browser's aspect ratio. The
 * 1023/1024 pair guards the proof gallery and 1119/1120 guards the wider hero.
 */
const CRITICAL_VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 834, height: 1112 },
  { width: 899, height: 1024 },
  { width: 900, height: 1024 },
  { width: 959, height: 1024 },
  { width: 960, height: 1024 },
  { width: 1023, height: 900 },
  { width: 1024, height: 900 },
  { width: 1119, height: 900 },
  { width: 1120, height: 900 },
  { width: 1440, height: 900 },
] as const;

type CriticalWidth = (typeof CRITICAL_VIEWPORTS)[number]['width'];

type AppCardGeometry = {
  card: { height: number; width: number };
  image: { height: number; width: number };
  media: { height: number; width: number };
};

type HeroGeometry = AppCardGeometry & {
  hero: { height: number; width: number };
};

function relativeDelta(first: number, second: number): number {
  return Math.abs(first - second) / Math.max(first, second, 1);
}

async function settleResponsiveLayout(page: Page, width: number) {
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));

  expect(dimensions.viewport, `${width}px: the requested viewport must be active`).toBe(width);
  expect(dimensions.body, `${width}px: body must not overflow horizontally`).toBeLessThanOrEqual(width + 1);
  expect(dimensions.document, `${width}px: document must not overflow horizontally`).toBeLessThanOrEqual(width + 1);
}

async function expectVisibleTargetsAtLeast44(locator: Locator, context: string) {
  const undersized = await locator.evaluateAll((elements) =>
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
          height: Number(bounds.height.toFixed(2)),
          label:
            target.getAttribute('aria-label') ??
            target.getAttribute('title') ??
            target.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80),
          tag: target.tagName.toLowerCase(),
          width: Number(bounds.width.toFixed(2)),
        },
      ];
    }),
  );

  expect(undersized, `${context}: every visible shell control must be at least 44×44 CSS pixels`).toEqual([]);
}

async function measureHero(page: Page): Promise<HeroGeometry> {
  return page.getByTestId('solution-hero').evaluate((heroElement) => {
    const cardElement = heroElement.querySelector<HTMLElement>('[data-testid="solution-demo"]');
    const mediaElement = cardElement?.querySelector<HTMLElement>('.sol-app-showcase__media');
    const imageElement = mediaElement?.querySelector<HTMLImageElement>('img');

    if (!cardElement || !mediaElement || !imageElement) {
      throw new Error('solution hero card, media and image must all exist');
    }

    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();

      return { height: bounds.height, width: bounds.width };
    };

    return {
      card: rect(cardElement),
      hero: rect(heroElement),
      image: rect(imageElement),
      media: rect(mediaElement),
    };
  });
}

async function measureProofCards(page: Page): Promise<AppCardGeometry[]> {
  return page
    .getByTestId('solution-ide-proof-gallery')
    .locator('.sol-app-showcase')
    .evaluateAll((cardElements) =>
      cardElements.map((cardElement) => {
        const mediaElement = cardElement.querySelector<HTMLElement>('.sol-app-showcase__media');
        const imageElement = mediaElement?.querySelector<HTMLImageElement>('img');

        if (!mediaElement || !imageElement) {
          throw new Error('solution proof card media and image must both exist');
        }

        const rect = (element: Element) => {
          const bounds = element.getBoundingClientRect();

          return { height: bounds.height, width: bounds.width };
        };

        return {
          card: rect(cardElement),
          image: rect(imageElement),
          media: rect(mediaElement),
        };
      }),
    );
}

async function expectReadableHeroTypography(page: Page, width: number) {
  const typography = await page.getByTestId('solution-hero').evaluate((heroElement) => {
    const title = heroElement.querySelector<HTMLElement>('h1');
    const subtitle = heroElement.querySelector<HTMLElement>('.sol-hero__subtitle');

    if (!title || !subtitle) {
      throw new Error('solution hero title and subtitle must exist');
    }

    const titleStyle = window.getComputedStyle(title);
    const subtitleStyle = window.getComputedStyle(subtitle);

    return {
      subtitleFontSize: Number.parseFloat(subtitleStyle.fontSize),
      subtitleLineHeight: Number.parseFloat(subtitleStyle.lineHeight),
      titleClientHeight: title.clientHeight,
      titleClientWidth: title.clientWidth,
      titleFontSize: Number.parseFloat(titleStyle.fontSize),
      titleScrollHeight: title.scrollHeight,
      titleScrollWidth: title.scrollWidth,
    };
  });

  const minimumTitleSize = width >= 1120 ? 40 : 32;

  expect(typography.titleFontSize, `${width}px: hero H1 must preserve a premium hierarchy`).toBeGreaterThanOrEqual(
    minimumTitleSize,
  );
  expect(typography.subtitleFontSize, `${width}px: hero supporting copy must remain readable`).toBeGreaterThanOrEqual(
    16,
  );
  expect(
    typography.subtitleLineHeight / typography.subtitleFontSize,
    `${width}px: hero supporting copy needs comfortable line spacing`,
  ).toBeGreaterThanOrEqual(1.4);
  expect(typography.titleScrollWidth, `${width}px: hero H1 must not be clipped horizontally`).toBeLessThanOrEqual(
    typography.titleClientWidth + 1,
  );
  expect(typography.titleScrollHeight, `${width}px: hero H1 must not be clipped vertically`).toBeLessThanOrEqual(
    typography.titleClientHeight + 1,
  );
}

function expectReasonableHeroGeometry(geometry: HeroGeometry, viewport: (typeof CRITICAL_VIEWPORTS)[number]) {
  const { width, height } = viewport;
  const mediaRatio = geometry.media.width / geometry.media.height;
  const expectedMediaRatio = 16 / 9;

  expect(
    Math.abs(mediaRatio - expectedMediaRatio) / expectedMediaRatio,
    `${width}px: the real app image viewport must remain 16:9`,
  ).toBeLessThanOrEqual(0.01);
  expect(
    relativeDelta(geometry.image.width, geometry.media.width),
    `${width}px: image must fill the media viewport horizontally`,
  ).toBeLessThanOrEqual(0.01);
  expect(
    relativeDelta(geometry.image.height, geometry.media.height),
    `${width}px: image must fill the media viewport vertically`,
  ).toBeLessThanOrEqual(0.01);

  expect(
    geometry.card.height / geometry.card.width,
    `${width}px: hero card must not become disproportionately tall`,
  ).toBeGreaterThanOrEqual(0.65);
  expect(
    geometry.card.height / geometry.card.width,
    `${width}px: hero card must not become disproportionately tall`,
  ).toBeLessThanOrEqual(1.35);

  if (width < 1120) {
    const tabletMaximum = Math.min(576, width * 0.8);

    expect(geometry.card.width, `${width}px: tablet hero card must be visually contained`).toBeLessThanOrEqual(
      tabletMaximum + 2,
    );
    expect(geometry.card.width, `${width}px: tablet hero card must remain legible`).toBeGreaterThanOrEqual(
      Math.min(480, width * 0.625) - 2,
    );
    expect(geometry.card.height, `${width}px: tablet hero card must not dominate the viewport`).toBeLessThanOrEqual(
      height * 0.84,
    );
  } else {
    expect(geometry.card.width, `${width}px: desktop hero card must not dominate the page`).toBeLessThanOrEqual(640);
    expect(geometry.card.width, `${width}px: desktop hero app must remain legible`).toBeGreaterThanOrEqual(420);
    expect(geometry.media.width / width, `${width}px: desktop image must remain below half the viewport`).toBeLessThan(
      0.47,
    );
  }

  const maximumHeroViewportRatio = width >= 1120 ? 1 : 1.18;

  expect(
    geometry.hero.height / height,
    `${width}px: hero must not consume an excessive number of screens`,
  ).toBeLessThanOrEqual(maximumHeroViewportRatio);
}

function expectAppCardImageGeometry(geometry: AppCardGeometry, context: string) {
  const mediaRatio = geometry.media.width / geometry.media.height;
  const expectedMediaRatio = 16 / 9;

  expect(
    Math.abs(mediaRatio - expectedMediaRatio) / expectedMediaRatio,
    `${context}: real app image viewport must remain 16:9`,
  ).toBeLessThanOrEqual(0.01);
  expect(
    relativeDelta(geometry.image.width, geometry.media.width),
    `${context}: image must fill its viewport horizontally`,
  ).toBeLessThanOrEqual(0.01);
  expect(
    relativeDelta(geometry.image.height, geometry.media.height),
    `${context}: image must fill its viewport vertically`,
  ).toBeLessThanOrEqual(0.01);
  expect(
    geometry.card.height / geometry.card.width,
    `${context}: app card must preserve balanced proportions`,
  ).toBeGreaterThanOrEqual(0.65);
  expect(
    geometry.card.height / geometry.card.width,
    `${context}: app card must preserve balanced proportions`,
  ).toBeLessThanOrEqual(1.4);
}

function expectContinuousLayout(
  geometries: ReadonlyMap<CriticalWidth, HeroGeometry>,
  before: CriticalWidth,
  after: CriticalWidth,
  options: { maximumHeroHeightDelta?: number } = {},
) {
  const first = geometries.get(before);
  const second = geometries.get(after);

  if (!first || !second) {
    throw new Error(`missing responsive measurements for ${before}/${after}px`);
  }

  const comparisons: Array<readonly [string, number, number]> = [
    ['card width', first.card.width, second.card.width],
    ['card height', first.card.height, second.card.height],
    ['media width', first.media.width, second.media.width],
    ['media height', first.media.height, second.media.height],
  ];

  expect(
    relativeDelta(first.hero.height, second.hero.height),
    `${before}→${after}px: hero height must not exhibit an excessive breakpoint jump`,
  ).toBeLessThanOrEqual(options.maximumHeroHeightDelta ?? 0.15);

  for (const [label, firstValue, secondValue] of comparisons) {
    expect(
      relativeDelta(firstValue, secondValue),
      `${before}→${after}px: ${label} must not jump at a one-pixel breakpoint`,
    ).toBeLessThanOrEqual(0.15);
  }
}

function expectContinuousProofCards(
  geometries: ReadonlyMap<CriticalWidth, AppCardGeometry[]>,
  before: CriticalWidth,
  after: CriticalWidth,
) {
  const firstCards = geometries.get(before);
  const secondCards = geometries.get(after);

  if (!firstCards || !secondCards || firstCards.length !== 2 || secondCards.length !== 2) {
    throw new Error(`missing proof-card measurements for ${before}/${after}px`);
  }

  for (const [index, first] of firstCards.entries()) {
    const second = secondCards[index];

    if (!second) {
      throw new Error(`missing proof card ${index + 1} at ${after}px`);
    }

    const comparisons = [
      ['card width', first.card.width, second.card.width],
      ['card height', first.card.height, second.card.height],
      ['media width', first.media.width, second.media.width],
      ['media height', first.media.height, second.media.height],
    ] as const;

    for (const [label, firstValue, secondValue] of comparisons) {
      expect(
        relativeDelta(firstValue, secondValue),
        `${before}→${after}px: proof card ${index + 1} ${label} must not jump at a one-pixel breakpoint`,
      ).toBeLessThanOrEqual(0.15);
    }
  }
}

test.describe('solution pages — Fortune 500 responsive geometry', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'manual breakpoint matrix runs once in Chromium');
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  });

  for (const slug of SOLUTION_SLUGS) {
    for (const language of LANGUAGES) {
      test(`${slug} ${language}: critical tablet and desktop breakpoints stay continuous`, async ({ page }) => {
        test.setTimeout(90_000);

        const geometries = new Map<CriticalWidth, HeroGeometry>();
        const proofGeometries = new Map<CriticalWidth, AppCardGeometry[]>();

        await page.setViewportSize(CRITICAL_VIEWPORTS[0]);
        await page.goto(`/solutions/${slug}?lang=${language}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('html')).toHaveAttribute('data-ecode-hydrated', 'true', { timeout: 30_000 });
        await expect(page.getByTestId('solution-page')).toHaveAttribute('lang', language);
        await expect(page.getByTestId('solution-demo').locator('img')).toBeVisible();

        for (const viewport of CRITICAL_VIEWPORTS) {
          await page.setViewportSize(viewport);
          await settleResponsiveLayout(page, viewport.width);
          await expectNoHorizontalOverflow(page, viewport.width);
          await expectReadableHeroTypography(page, viewport.width);

          const geometry = await measureHero(page);
          const proofCards = await measureProofCards(page);

          expectReasonableHeroGeometry(geometry, viewport);
          expect(proofCards, `${viewport.width}px: both real-app proof cards must render`).toHaveLength(2);

          for (const [index, proofCard] of proofCards.entries()) {
            expectAppCardImageGeometry(proofCard, `${slug} ${language} ${viewport.width}px proof card ${index + 1}`);
          }

          geometries.set(viewport.width, geometry);
          proofGeometries.set(viewport.width, proofCards);

          if (viewport.width <= 1024) {
            await expectVisibleTargetsAtLeast44(
              page.locator('header nav a[href], header nav button, footer a[href], footer button'),
              `${slug} ${language} ${viewport.width}px`,
            );
          }
        }

        expectContinuousLayout(geometries, 899, 900);
        expectContinuousLayout(geometries, 959, 960);

        /*
         * At 1120px the hero deliberately moves from stacked to two columns.
         * Its section height therefore changes, but the app itself must not
         * exhibit the former ~50% image-size cliff.
         */
        expectContinuousLayout(geometries, 1119, 1120, { maximumHeroHeightDelta: 0.4 });
        expectContinuousProofCards(proofGeometries, 1023, 1024);
      });
    }
  }
});
