#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import sharp from 'sharp';

import {
  EXPECTED_MATRIX_ROWS,
  EXPECTED_SCREENSHOTS,
  buildProofMatrix,
  loadHarnessConfig,
  normalizeAssetUrl,
  parseArguments,
  solutionUrl,
  usageText,
} from './solutions-proof-harness-lib.mjs';

const IMPORTANT_RESOURCE_TYPES = new Set(['document', 'script', 'stylesheet', 'image', 'font']);

const IMPORTANT_TEXT_SELECTOR =
  'h1, h2, h3, p, a, button, summary, figcaption, blockquote, li, span, strong, small, code, label, dt, dd';

const REPORT_JSON = 'solutions-proof-results.json';
const REPORT_MARKDOWN = 'solutions-proof-report.md';

function nowIso() {
  return new Date().toISOString();
}

function uniqueBy(items, keyForItem) {
  const seen = new Set();

  return items.filter((item) => {
    const key = keyForItem(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function addIssue(result, code, message, details) {
  const serializedDetails = details === undefined ? '' : JSON.stringify(details);

  const duplicate = result.issues.some(
    (issue) =>
      issue.code === code && issue.message === message && JSON.stringify(issue.details ?? '') === serializedDetails,
  );

  if (!duplicate) {
    result.issues.push({ code, message, ...(details === undefined ? {} : { details }) });
  }
}

function emptyRowResult(row, baseUrl) {
  return {
    id: row.id,
    slug: row.slug,
    language: row.language,
    theme: row.theme,
    viewport: row.viewport,
    requestedUrl: solutionUrl(baseUrl, row.slug, row.language),
    finalUrl: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    status: 'pending',
    screenshot: row.screenshot,
    screenshotWritten: false,
    issues: [],
    evidence: {
      response: null,
      readiness: [],
      nonBlank: null,
      document: null,
      overflow: null,
      clippedContent: null,
      images: null,
      assets: null,
      languageSwitch: null,
      consoleErrors: [],
      pageErrors: [],
      networkErrors: [],
      themeAssetUnique: null,
      pageAssetUnique: null,
    },
  };
}

function mainSelectorFor(slug) {
  if (slug === 'app-builder') {
    return '[data-testid="app-builder-page"]';
  }

  return `[data-testid="solution-page"][data-solution-slug="${slug}"]`;
}

async function installDeterministicStyles(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
}

async function settlePage(page, selector, timeoutMs, { loadImages = false } = {}) {
  const failures = [];

  try {
    await page.waitForLoadState('load', { timeout: timeoutMs });
  } catch (error) {
    failures.push({ checkpoint: 'window-load', error: String(error) });
  }

  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout: timeoutMs });
  } catch (error) {
    failures.push({ checkpoint: 'solution-main-visible', error: String(error) });
  }

  try {
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-ecode-hydrated') === 'true',
      undefined,
      { timeout: timeoutMs },
    );
  } catch (error) {
    failures.push({ checkpoint: 'react-hydration', error: String(error) });
  }

  try {
    await installDeterministicStyles(page);
  } catch (error) {
    failures.push({ checkpoint: 'deterministic-styles', error: String(error) });
  }

  try {
    await page.evaluate(async (timeout) => {
      if (!document.fonts) {
        return;
      }

      let timer;

      try {
        await Promise.race([
          document.fonts.ready,
          new Promise((_, reject) => {
            timer = window.setTimeout(() => reject(new Error('Timed out waiting for document fonts')), timeout);
          }),
        ]);
      } finally {
        window.clearTimeout(timer);
      }
    }, timeoutMs);
  } catch (error) {
    failures.push({ checkpoint: 'document-fonts', error: String(error) });
  }

  if (loadImages) {
    try {
      await page.evaluate(
        async ({ mainSelector, timeout }) => {
          const main = document.querySelector(mainSelector);

          if (!main) {
            throw new Error(`Cannot settle images: missing ${mainSelector}`);
          }

          const nextPaint = () =>
            new Promise((resolvePaint) => {
              requestAnimationFrame(() => requestAnimationFrame(resolvePaint));
            });

          for (const image of main.querySelectorAll('img')) {
            const imageStyle = getComputedStyle(image);

            if (imageStyle.display === 'none' || imageStyle.visibility === 'hidden') {
              continue;
            }

            image.scrollIntoView({ block: 'center', inline: 'nearest' });
            await nextPaint();

            if (!image.complete) {
              let timer;

              try {
                await new Promise((resolveImage) => {
                  const finish = () => {
                    window.clearTimeout(timer);
                    image.removeEventListener('load', finish);
                    image.removeEventListener('error', finish);
                    resolveImage();
                  };

                  image.addEventListener('load', finish, { once: true });
                  image.addEventListener('error', finish, { once: true });
                  timer = window.setTimeout(finish, timeout);
                });
              } finally {
                window.clearTimeout(timer);
              }
            }

            if (image.complete && image.naturalWidth > 0 && typeof image.decode === 'function') {
              let decodeTimer;

              try {
                await Promise.race([
                  image.decode(),
                  new Promise((_, reject) => {
                    decodeTimer = window.setTimeout(
                      () => reject(new Error(`Timed out decoding image: ${image.currentSrc || image.src}`)),
                      timeout,
                    );
                  }),
                ]);
              } finally {
                window.clearTimeout(decodeTimer);
              }
            }
          }

          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          await nextPaint();
        },
        { mainSelector: selector, timeout: timeoutMs },
      );
    } catch (error) {
      failures.push({ checkpoint: 'solution-images', error: String(error) });
    }
  }

  return failures;
}

export function collectLightweightSnapshot({ mainSelector }) {
  const main = document.querySelector(mainSelector);
  const root = document.documentElement;

  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number.parseFloat(style.opacity || '1') > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  };

  const withinViewport = (element) => {
    const rect = element.getBoundingClientRect();
    const viewportWidth = root.clientWidth || window.innerWidth;
    const viewportHeight = root.clientHeight || window.innerHeight;
    const epsilon = 0.5;

    return (
      rect.left >= -epsilon &&
      rect.right <= viewportWidth + epsilon &&
      rect.top >= -epsilon &&
      rect.bottom <= viewportHeight + epsilon
    );
  };

  const languageSwitches = [...document.querySelectorAll('[data-testid="language-switch"]')];

  const switchEvidence = languageSwitches.map((languageSwitch, index) => {
    const buttons = [...languageSwitch.querySelectorAll('button[lang]')].map((button) => ({
      language: button.getAttribute('lang')?.toLowerCase() ?? null,
      ariaPressed: button.getAttribute('aria-pressed'),
      type: button.getAttribute('type'),
      text: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      visible: visible(button),
      withinViewport: withinViewport(button),
      enabled: !button.disabled,
    }));

    return {
      index,
      visible: visible(languageSwitch),
      withinViewport: withinViewport(languageSwitch),
      inHeader: Boolean(languageSwitch.closest('header')),
      insideMain: Boolean(main?.contains(languageSwitch)),
      role: languageSwitch.getAttribute('role'),
      ariaLabel: languageSwitch.getAttribute('aria-label'),
      anchorCount: languageSwitch.querySelectorAll('a[lang]').length,
      buttonCount: buttons.length,
      visibleButtonCount: buttons.filter((button) => button.visible).length,
      buttons,
    };
  });

  const activeLanguages = switchEvidence.flatMap((languageSwitch) =>
    languageSwitch.buttons
      .filter((button) => button.visible && button.ariaPressed === 'true')
      .map((button) => button.language),
  );

  /*
   * These selectors include the two removed Solutions-local controls as well
   * as generic language links/buttons. Any match under <main> is a duplicate
   * locale control and invalidates the live proof instead of being ignored.
   */
  const localControls = main
    ? [
        ...main.querySelectorAll(
          '[data-testid="language-switch"], .app-builder-language-switch, .sol-language-switch, a[lang][href*="lang="], button[lang]',
        ),
      ].map((element) => ({
        tagName: element.tagName.toLowerCase(),
        testId: element.getAttribute('data-testid'),
        className: typeof element.className === 'string' ? element.className : '',
        language: element.getAttribute('lang')?.toLowerCase() ?? null,
        ariaPressed: element.getAttribute('aria-pressed'),
        visible: visible(element),
      }))
    : [];

  return {
    url: window.location.href,
    pathname: window.location.pathname,
    queryLanguage: new URL(window.location.href).searchParams.get('lang'),
    htmlLanguage: root.lang,
    mainLanguage: main?.getAttribute('lang') ?? null,
    heading: main?.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    currentLanguage: activeLanguages.length === 1 ? activeLanguages[0] : null,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    theme: root.getAttribute('data-theme'),
    rootClasses: [...root.classList],
    languageSwitch: {
      totalCount: switchEvidence.length,
      visibleCount: switchEvidence.filter((languageSwitch) => languageSwitch.visible).length,
      headerCount: switchEvidence.filter((languageSwitch) => languageSwitch.inHeader).length,
      insideMainCount: switchEvidence.filter((languageSwitch) => languageSwitch.insideMain).length,
      activeLanguages,
      localControlCount: localControls.length,
      localControls,
      switches: switchEvidence,
    },
  };
}

export function languageSwitchContractErrors(languageSwitch, expectedLanguage) {
  const errors = [];

  if (!languageSwitch) {
    return ['Missing language-switch evidence'];
  }

  if (languageSwitch.totalCount !== 1) {
    errors.push(`Expected exactly one global LanguageSwitch; found ${languageSwitch.totalCount}`);
  }

  if (languageSwitch.visibleCount !== 1) {
    errors.push(`Expected exactly one visible global LanguageSwitch; found ${languageSwitch.visibleCount}`);
  }

  if (languageSwitch.headerCount !== 1) {
    errors.push(`Expected the unique LanguageSwitch inside <header>; found ${languageSwitch.headerCount}`);
  }

  if (languageSwitch.insideMainCount !== 0 || languageSwitch.localControlCount !== 0) {
    errors.push(
      `Expected no Solutions-local language control; found ${languageSwitch.insideMainCount} switch(es) and ${languageSwitch.localControlCount} control candidate(s) in <main>`,
    );
  }

  const soleSwitch = languageSwitch.switches.length === 1 ? languageSwitch.switches[0] : null;

  if (!soleSwitch) {
    return errors;
  }

  if (!soleSwitch.visible || !soleSwitch.withinViewport || !soleSwitch.inHeader || soleSwitch.insideMain) {
    errors.push('The unique LanguageSwitch must be visible within the viewport, inside <header>, and outside <main>');
  }

  if (soleSwitch.role !== 'group' || !soleSwitch.ariaLabel?.trim()) {
    errors.push('The unique LanguageSwitch must expose a labelled role="group"');
  }

  if (soleSwitch.anchorCount !== 0) {
    errors.push(
      `The global LanguageSwitch must use buttons, not language links; found ${soleSwitch.anchorCount} link(s)`,
    );
  }

  if (soleSwitch.buttonCount !== 2 || soleSwitch.visibleButtonCount !== 2) {
    errors.push(
      `Expected exactly two visible language buttons; found ${soleSwitch.buttonCount} total and ${soleSwitch.visibleButtonCount} visible`,
    );
  }

  for (const language of ['en', 'fr']) {
    const matches = soleSwitch.buttons.filter((button) => button.language === language);

    if (matches.length !== 1) {
      errors.push(`Expected exactly one ${language.toUpperCase()} button; found ${matches.length}`);
      continue;
    }

    const [button] = matches;

    if (!button.visible || !button.withinViewport || !button.enabled || button.type !== 'button') {
      errors.push(
        `The ${language.toUpperCase()} language button must be visible within the viewport, enabled, and type="button"`,
      );
    }

    if (!['true', 'false'].includes(button.ariaPressed)) {
      errors.push(`The ${language.toUpperCase()} language button must expose aria-pressed="true" or "false"`);
    }
  }

  if (languageSwitch.activeLanguages.length !== 1 || languageSwitch.activeLanguages[0] !== expectedLanguage) {
    errors.push(
      `Expected only ${expectedLanguage.toUpperCase()} to expose aria-pressed="true"; received ${JSON.stringify(languageSwitch.activeLanguages)}`,
    );
  }

  return errors;
}

async function lightweightSnapshot(page, selector) {
  return page.evaluate(collectLightweightSnapshot, { mainSelector: selector });
}

async function clickLanguage(page, selector, currentLanguage, targetLanguage, timeoutMs) {
  const beforeClick = await lightweightSnapshot(page, selector);
  const contractErrors = languageSwitchContractErrors(beforeClick.languageSwitch, currentLanguage);

  if (contractErrors.length > 0) {
    throw new Error(`Invalid global LanguageSwitch before click: ${contractErrors.join('; ')}`);
  }

  const languageSwitch = page.locator('header [data-testid="language-switch"]');
  const button = languageSwitch.locator(`button[lang="${targetLanguage}"]`);
  const [switchCount, buttonCount] = await Promise.all([languageSwitch.count(), button.count()]);

  if (switchCount !== 1 || buttonCount !== 1) {
    throw new Error(
      `Expected one global LanguageSwitch and one ${targetLanguage.toUpperCase()} button; found ${switchCount} and ${buttonCount}`,
    );
  }

  if (!(await button.isVisible()) || !(await button.isEnabled())) {
    throw new Error(`The global ${targetLanguage.toUpperCase()} language button is not visible and enabled`);
  }

  if ((await button.getAttribute('aria-pressed')) !== 'false') {
    throw new Error(`The target ${targetLanguage.toUpperCase()} language button must have aria-pressed="false"`);
  }

  const sourceUrl = new URL(page.url());

  await Promise.all([
    page.waitForURL(
      (candidate) =>
        candidate.origin === sourceUrl.origin &&
        candidate.pathname === sourceUrl.pathname &&
        candidate.searchParams.get('lang') === targetLanguage,
      { timeout: timeoutMs },
    ),
    button.click({ timeout: timeoutMs }),
  ]);
}

async function verifyLanguageRoundTrip(page, row, selector, timeoutMs) {
  const oppositeLanguage = row.language === 'en' ? 'fr' : 'en';
  const initial = await lightweightSnapshot(page, selector);

  const evidence = {
    sourceLanguage: row.language,
    targetLanguage: oppositeLanguage,
    initial,
    target: null,
    returned: null,
    passed: false,
    contractErrors: {
      initial: languageSwitchContractErrors(initial.languageSwitch, row.language),
      target: null,
      returned: null,
    },
    errors: [],
  };

  try {
    if (evidence.contractErrors.initial.length > 0) {
      throw new Error(`Initial global LanguageSwitch contract failed: ${evidence.contractErrors.initial.join('; ')}`);
    }

    await clickLanguage(page, selector, row.language, oppositeLanguage, timeoutMs);
    evidence.errors.push(...(await settlePage(page, selector, timeoutMs)));
    evidence.target = await lightweightSnapshot(page, selector);
    evidence.contractErrors.target = languageSwitchContractErrors(evidence.target.languageSwitch, oppositeLanguage);

    if (evidence.contractErrors.target.length > 0) {
      throw new Error(`Target global LanguageSwitch contract failed: ${evidence.contractErrors.target.join('; ')}`);
    }

    await clickLanguage(page, selector, oppositeLanguage, row.language, timeoutMs);
    evidence.errors.push(...(await settlePage(page, selector, timeoutMs, { loadImages: true })));
    evidence.returned = await lightweightSnapshot(page, selector);
    evidence.contractErrors.returned = languageSwitchContractErrors(evidence.returned.languageSwitch, row.language);

    const expectedPath = `/solutions/${row.slug}`;
    const expectedCanonical = `https://e-code.ai${expectedPath}`;

    const targetThemeCorrect =
      evidence.target.theme === row.theme &&
      evidence.target.rootClasses.includes(row.theme) &&
      !evidence.target.rootClasses.includes(row.theme === 'light' ? 'dark' : 'light');
    const returnedThemeCorrect =
      evidence.returned.theme === row.theme &&
      evidence.returned.rootClasses.includes(row.theme) &&
      !evidence.returned.rootClasses.includes(row.theme === 'light' ? 'dark' : 'light');

    evidence.passed =
      evidence.errors.length === 0 &&
      evidence.contractErrors.initial.length === 0 &&
      evidence.contractErrors.target.length === 0 &&
      evidence.contractErrors.returned.length === 0 &&
      initial.pathname === expectedPath &&
      initial.queryLanguage === row.language &&
      initial.htmlLanguage === row.language &&
      initial.mainLanguage === row.language &&
      initial.currentLanguage === row.language &&
      initial.canonical === expectedCanonical &&
      Boolean(initial.heading) &&
      evidence.target.pathname === expectedPath &&
      evidence.target.queryLanguage === oppositeLanguage &&
      evidence.target.htmlLanguage === oppositeLanguage &&
      evidence.target.mainLanguage === oppositeLanguage &&
      evidence.target.currentLanguage === oppositeLanguage &&
      evidence.target.canonical === expectedCanonical &&
      Boolean(evidence.target.heading) &&
      evidence.target.heading !== initial.heading &&
      targetThemeCorrect &&
      evidence.returned.pathname === expectedPath &&
      evidence.returned.queryLanguage === row.language &&
      evidence.returned.htmlLanguage === row.language &&
      evidence.returned.mainLanguage === row.language &&
      evidence.returned.currentLanguage === row.language &&
      evidence.returned.canonical === expectedCanonical &&
      evidence.returned.heading === initial.heading &&
      returnedThemeCorrect;
  } catch (error) {
    evidence.errors.push({ checkpoint: 'language-link-round-trip', error: String(error) });
  }

  return evidence;
}

async function auditDocument(page, row, selector) {
  return page.evaluate(
    ({ expected, mainSelector, importantTextSelector }) => {
      const main = document.querySelector(mainSelector);
      const root = document.documentElement;
      const rootStyle = getComputedStyle(root);
      const viewportWidth = root.clientWidth;
      const layoutGeometryEpsilonPx = 0.5;

      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number.parseFloat(style.opacity || '1') > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const elementLabel = (element) => {
        const testId = element.getAttribute('data-testid');

        if (testId) {
          return `${element.tagName.toLowerCase()}[data-testid="${testId}"]`;
        }

        const id = element.id ? `#${element.id}` : '';

        const classes = [...element.classList]
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join('');

        return `${element.tagName.toLowerCase()}${id}${classes}`;
      };

      const allVisibleElements = main ? [...main.querySelectorAll('*')].filter(visible) : [];

      const importantElements = main
        ? [...main.querySelectorAll(importantTextSelector)].filter(
            (element) => visible(element) && Boolean(element.textContent?.replace(/\s+/g, ' ').trim()),
          )
        : [];

      const imageElements = main ? [...main.querySelectorAll('img')].filter(visible) : [];
      const blockingHorizontalElements = [...new Set([...importantElements, ...imageElements])];

      const horizontalGeometry = (element) => {
        const rect = element.getBoundingClientRect();

        return {
          element: elementLabel(element),
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
        };
      };
      const outsideViewport = (item) =>
        item.left < -layoutGeometryEpsilonPx || item.right > viewportWidth + layoutGeometryEpsilonPx;
      const horizontalOffenders = blockingHorizontalElements
        .map(horizontalGeometry)
        .filter(outsideViewport)
        .slice(0, 50);

      const blockingHorizontalSet = new Set(blockingHorizontalElements);

      const ignoredDecorativeHorizontalOffenders = allVisibleElements
        .filter((element) => !blockingHorizontalSet.has(element))
        .map(horizontalGeometry)
        .filter(outsideViewport)
        .slice(0, 20);

      const clippedElements = [];

      for (const element of importantElements) {
        const style = getComputedStyle(element);
        const hiddenX = style.overflowX === 'hidden' || style.overflowX === 'clip';
        const hiddenY = style.overflowY === 'hidden' || style.overflowY === 'clip';
        const horizontalClip = hiddenX && element.scrollWidth > element.clientWidth;
        const verticalClip = hiddenY && element.scrollHeight > element.clientHeight;

        const lineClamp =
          style.webkitLineClamp !== 'none' &&
          style.webkitLineClamp !== '0' &&
          element.scrollHeight > element.clientHeight;

        const ellipsis = style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth;
        const clippedByAncestors = [];
        const elementRect = element.getBoundingClientRect();

        const clippedByViewport =
          elementRect.left < -layoutGeometryEpsilonPx || elementRect.right > viewportWidth + layoutGeometryEpsilonPx;

        let ancestor = element.parentElement;

        while (ancestor && ancestor !== document.body) {
          const ancestorStyle = getComputedStyle(ancestor);
          const clipsX = ancestorStyle.overflowX === 'hidden' || ancestorStyle.overflowX === 'clip';
          const clipsY = ancestorStyle.overflowY === 'hidden' || ancestorStyle.overflowY === 'clip';

          if (clipsX || clipsY) {
            const ancestorRect = ancestor.getBoundingClientRect();

            const outsideX =
              clipsX &&
              (elementRect.left < ancestorRect.left - layoutGeometryEpsilonPx ||
                elementRect.right > ancestorRect.right + layoutGeometryEpsilonPx);
            const outsideY =
              clipsY &&
              (elementRect.top < ancestorRect.top - layoutGeometryEpsilonPx ||
                elementRect.bottom > ancestorRect.bottom + layoutGeometryEpsilonPx);

            if (outsideX || outsideY) {
              clippedByAncestors.push(elementLabel(ancestor));
            }
          }

          if (ancestor === main) {
            break;
          }

          ancestor = ancestor.parentElement;
        }

        if (
          horizontalClip ||
          verticalClip ||
          lineClamp ||
          ellipsis ||
          clippedByViewport ||
          clippedByAncestors.length > 0
        ) {
          clippedElements.push({
            element: elementLabel(element),
            text: element.textContent.replace(/\s+/g, ' ').trim().slice(0, 180),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            textOverflow: style.textOverflow,
            lineClamp: style.webkitLineClamp,
            clippedByViewport,
            clippedByAncestors,
          });
        }
      }

      const imageEvidence = main
        ? [...main.querySelectorAll('img')].map((image, index) => {
            const figure = image.closest('[data-visual-language]');
            const imageStyle = getComputedStyle(image);
            const imageRect = image.getBoundingClientRect();
            const clippedByAncestors = [];

            let imageAncestor = image.parentElement;

            while (imageAncestor && imageAncestor !== document.body) {
              const ancestorStyle = getComputedStyle(imageAncestor);
              const clipsX = ancestorStyle.overflowX === 'hidden' || ancestorStyle.overflowX === 'clip';
              const clipsY = ancestorStyle.overflowY === 'hidden' || ancestorStyle.overflowY === 'clip';

              if (clipsX || clipsY) {
                const ancestorRect = imageAncestor.getBoundingClientRect();

                const outsideX =
                  clipsX &&
                  (imageRect.left < ancestorRect.left - layoutGeometryEpsilonPx ||
                    imageRect.right > ancestorRect.right + layoutGeometryEpsilonPx);
                const outsideY =
                  clipsY &&
                  (imageRect.top < ancestorRect.top - layoutGeometryEpsilonPx ||
                    imageRect.bottom > ancestorRect.bottom + layoutGeometryEpsilonPx);

                if (outsideX || outsideY) {
                  clippedByAncestors.push(elementLabel(imageAncestor));
                }
              }

              if (imageAncestor === main) {
                break;
              }

              imageAncestor = imageAncestor.parentElement;
            }

            const clippedByViewport =
              imageRect.left < -layoutGeometryEpsilonPx || imageRect.right > viewportWidth + layoutGeometryEpsilonPx;

            const naturalAspect = image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : null;
            const renderedAspect = imageRect.height > 0 ? imageRect.width / imageRect.height : null;

            const clippedByObjectFit =
              imageStyle.objectFit === 'cover' &&
              naturalAspect !== null &&
              renderedAspect !== null &&
              Math.abs(naturalAspect - renderedAspect) / naturalAspect > 0.01;

            const pictureSources = image.closest('picture')
              ? [...image.closest('picture').querySelectorAll('source')].map((source) => ({
                  media: source.getAttribute('media'),
                  type: source.getAttribute('type'),
                  srcset: source.getAttribute('srcset'),
                  sizes: source.getAttribute('sizes'),
                }))
              : [];

            return {
              index,
              src: image.getAttribute('src'),
              currentSrc: image.currentSrc,
              alt: image.getAttribute('alt'),
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              declaredWidth: image.getAttribute('width'),
              declaredHeight: image.getAttribute('height'),
              loading: image.getAttribute('loading'),
              srcset: image.getAttribute('srcset'),
              sizes: image.getAttribute('sizes'),
              pictureSources,
              visible: visible(image),
              layout: {
                left: Math.round(imageRect.left * 100) / 100,
                right: Math.round(imageRect.right * 100) / 100,
                width: Math.round(imageRect.width * 100) / 100,
                height: Math.round(imageRect.height * 100) / 100,
                objectFit: imageStyle.objectFit,
                clippedByViewport,
                clippedByObjectFit,
                clippedByAncestors,
                clipped: clippedByViewport || clippedByObjectFit || clippedByAncestors.length > 0,
              },
              proof: Boolean(figure),
              visualLanguage: figure?.getAttribute('data-visual-language') ?? null,
              visualTheme: figure?.getAttribute('data-visual-theme') ?? image.getAttribute('data-visual-theme') ?? null,
              visualSlot: figure?.getAttribute('data-visual-slot') ?? `index-${index}`,
              visualSolution:
                figure?.getAttribute('data-visual-solution') ?? image.getAttribute('data-visual-solution') ?? null,
              testId: figure?.getAttribute('data-testid') ?? null,
            };
          })
        : [];

      const proofAssets = imageEvidence.filter((image) => image.proof && image.visible);

      const brokenImages = imageEvidence.filter(
        (image) => image.visible && (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0),
      );

      const missingAlt = imageEvidence.filter((image) => image.visible && !image.alt?.trim());
      const clippedImages = imageEvidence.filter((image) => image.visible && image.layout.clipped);
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
      const ogLocale = document.querySelector('meta[property="og:locale"]')?.getAttribute('content') ?? null;
      const metaContent = (selector) => document.querySelector(selector)?.getAttribute('content') ?? null;

      const alternates = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => ({
        hrefLang: link.getAttribute('hreflang')?.toLowerCase() ?? null,
        href: link.getAttribute('href'),
      }));

      const mainMarketingPage = main?.getAttribute('data-ecode-marketing-page') ?? null;
      const mainSolutionSlug = main?.getAttribute('data-solution-slug') ?? null;

      return {
        document: {
          title: document.title,
          url: window.location.href,
          pathname: window.location.pathname,
          queryLanguage: new URL(window.location.href).searchParams.get('lang'),
          htmlLanguage: root.lang,
          mainLanguage: main?.getAttribute('lang') ?? null,
          mainDirection: main?.getAttribute('dir') ?? null,
          mainMarketingPage,
          mainSolutionSlug,
          heading: main?.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          canonical,
          alternates,
          metaDescription: metaContent('meta[name="description"]'),
          robots: metaContent('meta[name="robots"]'),
          ogLocale,
          openGraph: {
            type: metaContent('meta[property="og:type"]'),
            siteName: metaContent('meta[property="og:site_name"]'),
            url: metaContent('meta[property="og:url"]'),
            title: metaContent('meta[property="og:title"]'),
            description: metaContent('meta[property="og:description"]'),
            image: metaContent('meta[property="og:image"]'),
            imageAlt: metaContent('meta[property="og:image:alt"]'),
          },
          twitter: {
            card: metaContent('meta[name="twitter:card"]'),
            title: metaContent('meta[name="twitter:title"]'),
            description: metaContent('meta[name="twitter:description"]'),
            image: metaContent('meta[name="twitter:image"]'),
            imageAlt: metaContent('meta[name="twitter:image:alt"]'),
          },
          theme: root.getAttribute('data-theme'),
          rootClasses: [...root.classList],
          colorScheme: rootStyle.colorScheme,
          hydrated: root.getAttribute('data-ecode-hydrated'),
        },
        overflow: {
          viewportWidth,
          documentClientWidth: root.clientWidth,
          documentScrollWidth: root.scrollWidth,
          documentOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
          bodyClientWidth: document.body.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          bodyOverflowPx: Math.max(0, document.body.scrollWidth - document.body.clientWidth),
          layoutGeometryEpsilonPx,
          horizontalOffenders,
          ignoredDecorativeHorizontalOffenders,
        },
        clippedContent: {
          checked: importantElements.length,
          count: clippedElements.length,
          elements: clippedElements.slice(0, 50),
        },
        images: {
          count: imageEvidence.length,
          brokenCount: brokenImages.length,
          broken: brokenImages,
          missingAltCount: missingAlt.length,
          missingAlt,
          clippedCount: clippedImages.length,
          clipped: clippedImages,
          all: imageEvidence,
        },
        assets: {
          count: proofAssets.length,
          proof: proofAssets,
        },
        expected,
      };
    },
    {
      expected: { slug: row.slug, language: row.language, theme: row.theme },
      mainSelector: selector,
      importantTextSelector: IMPORTANT_TEXT_SELECTOR,
    },
  );
}

async function auditNonBlankViewport(page, selector) {
  const main = page.locator(selector);

  const [box, text, screenshot] = await Promise.all([
    main.boundingBox(),
    main.innerText().catch(() => ''),
    page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: false, scale: 'css', type: 'png' }),
  ]);

  const image = sharp(screenshot);
  const [metadata, statistics] = await Promise.all([image.metadata(), image.stats()]);
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  const evidence = {
    passed: false,
    mainBox: box,
    visibleTextLength: normalizedText.length,
    visibleTextSample: normalizedText.slice(0, 240),
    viewportImage: {
      bytes: screenshot.byteLength,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      entropy: statistics.entropy,
    },
  };

  evidence.passed = Boolean(
    box &&
      box.width >= 240 &&
      box.height >= 240 &&
      normalizedText.length >= 120 &&
      screenshot.byteLength >= 4_000 &&
      statistics.entropy >= 0.2,
  );

  return evidence;
}

function applyLocalAuditIssues(result, audit, contentLanguage) {
  const { slug, language, theme } = result;
  const oppositeTheme = theme === 'light' ? 'dark' : 'light';
  const expectedOgLocale = language === 'fr' ? 'fr_FR' : 'en_US';
  const expectedPath = `/solutions/${slug}`;
  const expectedMarketingPage = `solution-${slug}`;
  const canonicalBase = `https://e-code.ai${expectedPath}`;

  /*
   * EN and FR are language renderings of the same canonical page. The language
   * switch remains addressable through hreflang query URLs, but canonical and
   * og:url must never drift with the selected language.
   */
  const expectedCanonical = canonicalBase;

  result.evidence.document = audit.document;
  result.evidence.overflow = audit.overflow;
  result.evidence.clippedContent = audit.clippedContent;
  result.evidence.images = audit.images;
  result.evidence.assets = audit.assets;

  const languageControlErrors = languageSwitchContractErrors(audit.document.languageSwitch, language);

  if (languageControlErrors.length > 0) {
    addIssue(
      result,
      'language_switch_contract_invalid',
      'The deployed page does not expose exactly one valid global header LanguageSwitch',
      languageControlErrors,
    );
  }

  if (audit.document.pathname !== expectedPath) {
    addIssue(result, 'wrong_route', `Expected ${expectedPath}; rendered ${audit.document.pathname}`);
  }

  if (
    audit.document.queryLanguage !== language ||
    audit.document.htmlLanguage !== language ||
    audit.document.mainLanguage !== language ||
    audit.document.currentLanguage !== language ||
    (contentLanguage?.split(',')[0].trim().toLowerCase() ?? null) !== language
  ) {
    addIssue(result, 'wrong_language', `The rendered language does not consistently resolve to ${language}`, {
      queryLanguage: audit.document.queryLanguage,
      htmlLanguage: audit.document.htmlLanguage,
      mainLanguage: audit.document.mainLanguage,
      currentLanguage: audit.document.currentLanguage,
      contentLanguage,
    });
  }

  if (audit.document.ogLocale !== expectedOgLocale) {
    addIssue(result, 'wrong_og_locale', `Expected og:locale=${expectedOgLocale}; received ${audit.document.ogLocale}`);
  }

  if (
    audit.document.theme !== theme ||
    !audit.document.rootClasses.includes(theme) ||
    audit.document.rootClasses.includes(oppositeTheme) ||
    !audit.document.colorScheme.split(' ').includes(theme)
  ) {
    addIssue(result, 'wrong_theme', `The rendered document does not consistently resolve to ${theme}`, {
      dataTheme: audit.document.theme,
      rootClasses: audit.document.rootClasses,
      colorScheme: audit.document.colorScheme,
    });
  }

  if (audit.document.hydrated !== 'true') {
    addIssue(result, 'not_hydrated', 'The deployed page never exposed the E-Code hydration marker');
  }

  if (audit.document.mainMarketingPage !== expectedMarketingPage || audit.document.mainSolutionSlug !== slug) {
    addIssue(result, 'wrong_solution_page', `The rendered solution identity does not match ${slug}`, {
      marketingPage: audit.document.mainMarketingPage,
      solutionSlug: audit.document.mainSolutionSlug,
    });
  }

  if (!audit.document.title || !audit.document.heading) {
    addIssue(result, 'missing_important_content', 'The deployed page is missing its document title or H1', {
      title: audit.document.title,
      heading: audit.document.heading,
    });
  }

  const seoFailures = [];

  const expectSeo = (field, actual, expected) => {
    if (actual !== expected) {
      seoFailures.push({ field, expected, actual });
    }
  };
  const expectPresentSeo = (field, actual) => {
    if (!actual?.trim()) {
      seoFailures.push({ field, expected: 'non-empty localized value', actual });
    }
  };

  expectSeo('canonical', audit.document.canonical, expectedCanonical);

  for (const [hrefLang, href] of [
    ['en', `${canonicalBase}?lang=en`],
    ['fr', `${canonicalBase}?lang=fr`],
    ['x-default', canonicalBase],
  ]) {
    const matches = audit.document.alternates.filter((alternate) => alternate.hrefLang === hrefLang);

    if (matches.length !== 1 || matches[0].href !== href) {
      seoFailures.push({ field: `hreflang:${hrefLang}`, expected: href, actual: matches });
    }
  }

  expectPresentSeo('description', audit.document.metaDescription);
  expectSeo('robots', audit.document.robots, 'index,follow');
  expectSeo('og:type', audit.document.openGraph.type, 'website');
  expectSeo('og:site_name', audit.document.openGraph.siteName, 'E-Code');
  expectSeo('og:url', audit.document.openGraph.url, expectedCanonical);
  expectSeo('og:locale', audit.document.ogLocale, expectedOgLocale);
  expectSeo('og:title', audit.document.openGraph.title, audit.document.title);
  expectSeo('og:description', audit.document.openGraph.description, audit.document.metaDescription);
  expectPresentSeo('og:image', audit.document.openGraph.image);
  expectPresentSeo('og:image:alt', audit.document.openGraph.imageAlt);
  expectSeo('twitter:card', audit.document.twitter.card, 'summary_large_image');
  expectSeo('twitter:title', audit.document.twitter.title, audit.document.title);
  expectSeo('twitter:description', audit.document.twitter.description, audit.document.metaDescription);
  expectSeo('twitter:image', audit.document.twitter.image, audit.document.openGraph.image);
  expectSeo('twitter:image:alt', audit.document.twitter.imageAlt, audit.document.openGraph.imageAlt);

  if (
    audit.document.openGraph.image &&
    !audit.document.openGraph.image.includes(`/assets/og/solutions/${slug}-${language}.`)
  ) {
    seoFailures.push({
      field: 'localized og:image',
      expected: `/assets/og/solutions/${slug}-${language}.<format>`,
      actual: audit.document.openGraph.image,
    });
  }

  if (seoFailures.length > 0) {
    addIssue(
      result,
      'seo_metadata_invalid',
      `${seoFailures.length} localized SEO metadata check(s) failed`,
      seoFailures,
    );
  }

  if (
    audit.overflow.documentOverflowPx > 0 ||
    audit.overflow.bodyOverflowPx > 0 ||
    audit.overflow.horizontalOffenders.length > 0
  ) {
    addIssue(
      result,
      'horizontal_overflow',
      'Horizontal overflow must equal exactly 0 px and no visible content may cross the viewport',
      audit.overflow,
    );
  }

  if (audit.clippedContent.count > 0) {
    addIssue(
      result,
      'clipped_important_content',
      `${audit.clippedContent.count} important text element(s) appear clipped or truncated`,
      audit.clippedContent.elements,
    );
  }

  if (audit.images.brokenCount > 0) {
    addIssue(
      result,
      'broken_image',
      `${audit.images.brokenCount} visible image(s) failed to load`,
      audit.images.broken,
    );
  }

  if (audit.images.missingAltCount > 0) {
    addIssue(
      result,
      'missing_image_alt',
      `${audit.images.missingAltCount} visible image(s) have no localized alt text`,
      audit.images.missingAlt,
    );
  }

  if (audit.images.clippedCount > 0) {
    addIssue(
      result,
      'clipped_solution_image',
      `${audit.images.clippedCount} visible image(s) appear cropped by viewport, overflow clipping, or object-fit`,
      audit.images.clipped,
    );
  }

  if (audit.assets.count === 0) {
    addIssue(result, 'missing_solution_asset', 'No visible, language-addressable solution proof image was rendered');
  }

  const seenProofSources = new Map();

  for (const asset of audit.assets.proof) {
    const assetPath = normalizeAssetUrl(asset.currentSrc || asset.src);
    const responsiveSources = [asset.srcset, ...asset.pictureSources.map((source) => source.srcset)].filter(Boolean);
    const responsiveSizes = [asset.sizes, ...asset.pictureSources.map((source) => source.sizes)].filter(Boolean);

    if (asset.visualLanguage !== language) {
      addIssue(
        result,
        'wrong_asset_language',
        `${asset.testId ?? asset.visualSlot} uses ${asset.visualLanguage ?? 'no'} language`,
        {
          expected: language,
          asset,
        },
      );
    }

    if (asset.visualTheme && asset.visualTheme !== theme) {
      addIssue(result, 'wrong_asset_theme', `${asset.testId ?? asset.visualSlot} declares theme ${asset.visualTheme}`, {
        expected: theme,
        asset,
      });
    }

    if (asset.visualSolution && asset.visualSolution !== slug) {
      addIssue(
        result,
        'wrong_asset_solution',
        `${asset.testId ?? asset.visualSlot} belongs to ${asset.visualSolution}`,
        {
          expected: slug,
          asset,
        },
      );
    }

    if (!assetPath.includes(`/assets/solutions/${slug}/`)) {
      addIssue(result, 'non_solution_asset', `${asset.testId ?? asset.visualSlot} is not namespaced to ${slug}`, {
        assetPath,
      });
    }

    if (!assetPath.includes(`/${language}/`)) {
      addIssue(result, 'non_localized_asset', `${asset.testId ?? asset.visualSlot} is not namespaced to ${language}`, {
        assetPath,
      });
    }

    if (!asset.declaredWidth || !asset.declaredHeight) {
      addIssue(result, 'missing_image_dimensions', `${asset.testId ?? asset.visualSlot} lacks intrinsic width/height`, {
        assetPath,
      });
    }

    if (responsiveSources.length === 0 || responsiveSizes.length === 0) {
      addIssue(
        result,
        'missing_responsive_image_metadata',
        `${asset.testId ?? asset.visualSlot} must expose srcset and sizes`,
        { assetPath, responsiveSources, responsiveSizes },
      );
    }

    if (asset.index > audit.assets.proof[0].index && asset.loading !== 'lazy') {
      addIssue(result, 'non_lazy_below_fold_asset', `${asset.testId ?? asset.visualSlot} must use loading="lazy"`, {
        assetPath,
        loading: asset.loading,
      });
    }

    const priorSlot = seenProofSources.get(assetPath);

    if (priorSlot) {
      addIssue(result, 'duplicate_asset_within_page', `${assetPath} is reused by multiple proof slots`, {
        first: priorSlot,
        second: asset.visualSlot,
      });
    } else {
      seenProofSources.set(assetPath, asset.visualSlot);
    }
  }
}

function eventCollectors(page, baseOrigin) {
  const consoleErrors = [];
  const pageErrors = [];
  const networkErrors = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }

    consoleErrors.push({
      text: message.text(),
      location: message.location(),
    });
  });

  page.on('pageerror', (error) => {
    pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack ?? String(error),
    });
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown request failure';

    if (IMPORTANT_RESOURCE_TYPES.has(request.resourceType()) && !failure.toLowerCase().includes('err_aborted')) {
      networkErrors.push({
        kind: 'request-failed',
        resourceType: request.resourceType(),
        url: request.url(),
        sameOrigin: request.url().startsWith(`${baseOrigin}/`),
        error: failure,
      });
    }
  });

  page.on('response', (response) => {
    const request = response.request();

    if (IMPORTANT_RESOURCE_TYPES.has(request.resourceType()) && response.status() >= 400) {
      networkErrors.push({
        kind: 'http-error',
        resourceType: request.resourceType(),
        url: response.url(),
        sameOrigin: response.url().startsWith(`${baseOrigin}/`),
        status: response.status(),
        statusText: response.statusText(),
      });
    }
  });

  return { consoleErrors, pageErrors, networkErrors };
}

function applyEventIssues(result, events) {
  if (!events) {
    return;
  }

  result.evidence.consoleErrors = uniqueBy(events.consoleErrors, (event) => JSON.stringify(event));
  result.evidence.pageErrors = uniqueBy(events.pageErrors, (event) => JSON.stringify(event));
  result.evidence.networkErrors = uniqueBy(events.networkErrors, (event) => JSON.stringify(event));

  if (result.evidence.consoleErrors.length > 0) {
    addIssue(
      result,
      'console_error',
      `${result.evidence.consoleErrors.length} browser console error(s) occurred`,
      result.evidence.consoleErrors,
    );
  }

  if (result.evidence.pageErrors.length > 0) {
    addIssue(
      result,
      'page_error',
      `${result.evidence.pageErrors.length} uncaught page error(s) occurred`,
      result.evidence.pageErrors,
    );
  }

  if (result.evidence.networkErrors.length > 0) {
    addIssue(
      result,
      'critical_resource_error',
      `${result.evidence.networkErrors.length} critical document/script/stylesheet/image/font resource error(s) occurred`,
      result.evidence.networkErrors,
    );
  }
}

async function auditRow(browser, config, row) {
  const result = emptyRowResult(row, config.baseUrl);
  const started = Date.now();
  result.startedAt = nowIso();

  const selector = mainSelectorFor(row.slug);

  let context;
  let events;

  try {
    context = await browser.newContext({
      viewport: { width: row.viewport.width, height: row.viewport.height },
      screen: { width: row.viewport.width, height: row.viewport.height },
      deviceScaleFactor: 1,
      colorScheme: row.theme,
      reducedMotion: 'reduce',
      locale: row.language === 'fr' ? 'fr-FR' : 'en-US',
    });
    context.setDefaultTimeout(config.timeoutMs);
    context.setDefaultNavigationTimeout(config.timeoutMs);

    await context.addCookies([
      { name: 'ecode_theme', value: row.theme, url: config.baseUrl },
      { name: 'vibecore-lang', value: row.language, url: config.baseUrl },
    ]);
    await context.addInitScript(
      ({ language, theme }) => {
        try {
          localStorage.setItem('bolt_theme', theme);
          localStorage.setItem('vibecore:user-language', language);
        } catch {
          // The cookie and browser color scheme remain deterministic fallbacks.
        }
      },
      { language: row.language, theme: row.theme },
    );

    const page = await context.newPage();
    events = eventCollectors(page, new URL(config.baseUrl).origin);

    const response = await page.goto(result.requestedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutMs,
    });

    result.finalUrl = page.url();
    result.evidence.response = response
      ? {
          status: response.status(),
          statusText: response.statusText(),
          url: response.url(),
          contentLanguage: response.headers()['content-language'] ?? null,
        }
      : null;

    if (!response || response.status() < 200 || response.status() >= 400) {
      addIssue(result, 'navigation_failed', 'The deployed solution document did not return a successful response', {
        response: result.evidence.response,
      });
    }

    if (new URL(page.url()).origin !== new URL(config.baseUrl).origin) {
      addIssue(result, 'unexpected_origin_redirect', 'The proof page redirected away from the configured deployment', {
        expected: new URL(config.baseUrl).origin,
        received: new URL(page.url()).origin,
      });
    }

    result.evidence.readiness.push(...(await settlePage(page, selector, config.timeoutMs)));

    if ((await page.locator(selector).count()) === 0) {
      result.evidence.languageSwitch = {
        sourceLanguage: row.language,
        targetLanguage: row.language === 'en' ? 'fr' : 'en',
        initial: null,
        target: null,
        returned: null,
        passed: false,
        contractErrors: {
          initial: ['Missing Solutions main; global LanguageSwitch could not be verified'],
          target: null,
          returned: null,
        },
        errors: [{ checkpoint: 'solution-main-visible', error: `Missing ${selector}` }],
      };
    } else {
      result.evidence.languageSwitch = await verifyLanguageRoundTrip(page, row, selector, config.timeoutMs);
    }

    result.finalUrl = page.url();

    if (!result.evidence.languageSwitch.passed) {
      addIssue(
        result,
        'language_switch_failed',
        `The visible ${row.language.toUpperCase()}→${result.evidence.languageSwitch.targetLanguage.toUpperCase()}→${row.language.toUpperCase()} switch did not round-trip`,
        result.evidence.languageSwitch,
      );
    }

    const finalLanguageSnapshot = await lightweightSnapshot(page, selector);
    const audit = await auditDocument(page, row, selector);
    audit.document.currentLanguage = finalLanguageSnapshot.currentLanguage;
    audit.document.languageSwitch = finalLanguageSnapshot.languageSwitch;
    applyLocalAuditIssues(result, audit, result.evidence.response?.contentLanguage ?? null);

    result.evidence.nonBlank = await auditNonBlankViewport(page, selector);

    if (!result.evidence.nonBlank.passed) {
      addIssue(
        result,
        'blank_render',
        'The deployed viewport is blank or does not contain a substantial rendered Solution page',
        result.evidence.nonBlank,
      );
    }

    if (result.evidence.readiness.length > 0) {
      addIssue(
        result,
        'readiness_failed',
        'One or more deterministic readiness checkpoints failed',
        result.evidence.readiness,
      );
    }

    if (row.captureScreenshot) {
      const screenshotPath = resolve(config.outputDirectory, row.screenshot);
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
      });
      result.screenshotWritten = true;
    }
  } catch (error) {
    addIssue(result, 'row_execution_failed', error instanceof Error ? error.message : String(error), {
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    applyEventIssues(result, events);
    await context?.close().catch(() => undefined);
    result.finishedAt = nowIso();
    result.durationMs = Date.now() - started;
    result.status = result.issues.length === 0 ? 'passed' : 'failed';
  }

  return result;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);

  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()));

  return results;
}

async function fingerprintProofAssets(rows, timeoutMs) {
  const rowsWithProofAssets = rows.filter((row) => row.evidence.assets?.proof);

  const assetUrls = [
    ...new Set(
      rowsWithProofAssets.flatMap((row) => row.evidence.assets.proof.map((asset) => asset.currentSrc).filter(Boolean)),
    ),
  ];

  const fingerprints = new Map();

  await mapWithConcurrency(assetUrls, 4, async (url) => {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });

      const contentType = response.headers.get('content-type') ?? '';

      if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`HTTP ${response.status} ${response.statusText}; content-type=${contentType || 'missing'}`);
      }

      const body = Buffer.from(await response.arrayBuffer());

      if (body.length === 0) {
        throw new Error('Image response body is empty');
      }

      fingerprints.set(url, {
        ok: true,
        sha256: createHash('sha256').update(body).digest('hex'),
        bytes: body.length,
        contentType,
      });
    } catch (error) {
      fingerprints.set(url, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  for (const row of rowsWithProofAssets) {
    for (const asset of row.evidence.assets.proof) {
      asset.fingerprint = fingerprints.get(asset.currentSrc) ?? { ok: false, error: 'Fingerprint was not collected' };

      if (!asset.fingerprint.ok) {
        addIssue(
          resultFor(rows, row.id),
          'asset_fingerprint_failed',
          `Could not verify ${asset.currentSrc}`,
          asset.fingerprint,
        );
      }
    }
  }

  return fingerprints;
}

function resultFor(rows, id) {
  const row = rows.find((candidate) => candidate.id === id);

  if (!row) {
    throw new Error(`Missing result row: ${id}`);
  }

  return row;
}

function proofAssetMap(row) {
  return new Map(
    (row.evidence.assets?.proof ?? []).map((asset, index) => [asset.visualSlot || `index-${index}`, asset]),
  );
}

function assetsHaveDistinctFingerprints(left, right) {
  if (!left || !right) {
    return false;
  }

  return Boolean(
    left.fingerprint?.ok &&
      right.fingerprint?.ok &&
      left.fingerprint.sha256 &&
      right.fingerprint.sha256 &&
      left.fingerprint.sha256 !== right.fingerprint.sha256,
  );
}

function applyCrossRowAssetChecks(rows) {
  const themeGroups = [];

  for (const slug of new Set(rows.map((row) => row.slug))) {
    for (const language of new Set(rows.map((row) => row.language))) {
      for (const width of new Set(rows.map((row) => row.viewport.width))) {
        const light = rows.find(
          (row) =>
            row.slug === slug && row.language === language && row.theme === 'light' && row.viewport.width === width,
        );
        const dark = rows.find(
          (row) =>
            row.slug === slug && row.language === language && row.theme === 'dark' && row.viewport.width === width,
        );

        const group = { slug, language, width, passed: false, slots: [] };

        if (!light || !dark) {
          themeGroups.push(group);
          continue;
        }

        const lightAssets = proofAssetMap(light);
        const darkAssets = proofAssetMap(dark);
        const slots = new Set([...lightAssets.keys(), ...darkAssets.keys()]);

        for (const slot of slots) {
          const lightAsset = lightAssets.get(slot);
          const darkAsset = darkAssets.get(slot);
          const unique = assetsHaveDistinctFingerprints(lightAsset, darkAsset);
          group.slots.push({
            slot,
            unique,
            light: lightAsset?.currentSrc ?? null,
            dark: darkAsset?.currentSrc ?? null,
            lightSha256: lightAsset?.fingerprint?.sha256 ?? null,
            darkSha256: darkAsset?.fingerprint?.sha256 ?? null,
          });
        }

        group.passed = slots.size > 0 && group.slots.every((slot) => slot.unique);
        light.evidence.themeAssetUnique = group.passed;
        dark.evidence.themeAssetUnique = group.passed;

        if (!group.passed) {
          const details = group.slots.filter((slot) => !slot.unique);
          addIssue(
            light,
            'theme_asset_not_unique',
            'Every proof visual must resolve to a distinct light-theme asset',
            details,
          );
          addIssue(
            dark,
            'theme_asset_not_unique',
            'Every proof visual must resolve to a distinct dark-theme asset',
            details,
          );
        }

        themeGroups.push(group);
      }
    }
  }

  for (const row of rows) {
    row.evidence.pageAssetUnique = (row.evidence.assets?.proof.length ?? 0) > 0;
  }

  const pageGroups = new Map();

  for (const row of rows) {
    const groupKey = `${row.language}--${row.theme}--${row.viewport.width}`;

    if (!pageGroups.has(groupKey)) {
      pageGroups.set(groupKey, new Map());
    }

    for (const asset of row.evidence.assets?.proof ?? []) {
      if (!asset.fingerprint?.ok) {
        row.evidence.pageAssetUnique = false;
        continue;
      }

      const fingerprintKey = `sha256:${asset.fingerprint.sha256}`;

      const byAsset = pageGroups.get(groupKey);

      if (!byAsset.has(fingerprintKey)) {
        byAsset.set(fingerprintKey, []);
      }

      byAsset.get(fingerprintKey).push({ row, slot: asset.visualSlot, url: asset.currentSrc });
    }
  }

  for (const byAsset of pageGroups.values()) {
    for (const occurrences of byAsset.values()) {
      const slugs = new Set(occurrences.map((occurrence) => occurrence.row.slug));

      if (slugs.size <= 1) {
        continue;
      }

      for (const occurrence of occurrences) {
        occurrence.row.evidence.pageAssetUnique = false;
        addIssue(
          occurrence.row,
          'asset_reused_across_solutions',
          'A proof image is reused by multiple Solution pages',
          occurrences.map((item) => ({ slug: item.row.slug, slot: item.slot, url: item.url })),
        );
      }
    }
  }

  return themeGroups;
}

function finalizeRows(rows) {
  for (const row of rows) {
    if (row.screenshot && !row.screenshotWritten) {
      addIssue(row, 'missing_screenshot', `Required screenshot was not written: ${row.screenshot}`);
    }

    row.status = row.issues.length === 0 ? 'passed' : 'failed';
  }
}

function countRowsWithCode(rows, codes) {
  const wanted = new Set(codes);
  return rows.filter((row) => row.issues.some((issue) => wanted.has(issue.code))).length;
}

function buildSummary(rows, themeGroups, fatalErrors) {
  const issueCounts = {};

  for (const row of rows) {
    for (const issue of row.issues) {
      issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
    }
  }

  const passedRows = rows.filter((row) => row.status === 'passed').length;
  const screenshotsWritten = rows.filter((row) => row.screenshotWritten).length;
  const themeAssetGroupsPassed = themeGroups.filter((group) => group.passed).length;

  return {
    passed:
      fatalErrors.length === 0 &&
      passedRows === EXPECTED_MATRIX_ROWS &&
      screenshotsWritten === EXPECTED_SCREENSHOTS &&
      themeGroups.length === 64 &&
      themeAssetGroupsPassed === 64,
    matrix: {
      expected: EXPECTED_MATRIX_ROWS,
      completed: rows.filter((row) => row.status !== 'pending').length,
      passed: passedRows,
      failed: rows.length - passedRows,
    },
    screenshots: {
      expected: EXPECTED_SCREENSHOTS,
      written: screenshotsWritten,
      missing: EXPECTED_SCREENSHOTS - screenshotsWritten,
    },
    responsive: {
      zeroOverflowRows: rows.filter(
        (row) => row.evidence.overflow?.documentOverflowPx === 0 && row.evidence.overflow?.bodyOverflowPx === 0,
      ).length,
      overflowRows: countRowsWithCode(rows, ['horizontal_overflow']),
      clippedRows: countRowsWithCode(rows, ['clipped_important_content', 'clipped_solution_image']),
    },
    visual: {
      nonBlankRows: rows.filter((row) => row.evidence.nonBlank?.passed).length,
      expectedRows: EXPECTED_MATRIX_ROWS,
    },
    runtime: {
      consoleErrorRows: countRowsWithCode(rows, ['console_error']),
      pageErrorRows: countRowsWithCode(rows, ['page_error']),
      criticalResourceErrorRows: countRowsWithCode(rows, ['critical_resource_error']),
      brokenImageRows: countRowsWithCode(rows, ['broken_image']),
    },
    localization: {
      correctLanguageRows: rows.filter(
        (row) => !row.issues.some((issue) => ['wrong_language', 'wrong_og_locale'].includes(issue.code)),
      ).length,
      switchPassedRows: rows.filter((row) => row.evidence.languageSwitch?.passed).length,
      switchExpectedRows: EXPECTED_MATRIX_ROWS,
    },
    themes: {
      correctThemeRows: rows.filter(
        (row) => !row.issues.some((issue) => ['wrong_theme', 'wrong_asset_theme'].includes(issue.code)),
      ).length,
      uniqueAssetGroupsExpected: 64,
      uniqueAssetGroupsPassed: themeAssetGroupsPassed,
      uniqueAssetGroupsFailed: themeGroups.length - themeAssetGroupsPassed,
    },
    assets: {
      uniqueAcrossPagesRows: rows.filter((row) => row.evidence.pageAssetUnique === true).length,
      fullyFingerprintedRows: rows.filter((row) => {
        const assets = row.evidence.assets?.proof ?? [];
        return assets.length > 0 && assets.every((asset) => asset.fingerprint?.ok);
      }).length,
      responsiveMetadataRows: rows.filter(
        (row) => !row.issues.some((issue) => issue.code === 'missing_responsive_image_metadata'),
      ).length,
    },
    seo: {
      validRows: rows.filter((row) => !row.issues.some((issue) => issue.code === 'seo_metadata_invalid')).length,
      expectedRows: EXPECTED_MATRIX_ROWS,
    },
    issueCounts,
    fatalErrors,
  };
}

function markdownEscape(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function mark(passed) {
  return passed ? 'PASS' : 'FAIL';
}

function buildMarkdownReport(report) {
  const { config, run, summary, rows } = report;

  const lines = [
    '# Solutions EN/FR deployed proof',
    '',
    `- Result: **${mark(summary.passed)}**`,
    `- Deployment: \`${config.baseUrl}\``,
    `- Started: ${run.startedAt}`,
    `- Finished: ${run.finishedAt}`,
    `- Harness: ${run.harnessVersion}`,
    `- Counted scope: website-builder, game-builder, dashboard-builder, chatbot-builder, internal-ai-builder, startups, freelancers, enterprise`,
    `- Reference control: app-builder (excluded from the 128-row matrix and 96 final screenshots)`,
    '',
    '## Counts',
    '',
    `- Matrix: ${summary.matrix.passed}/${summary.matrix.expected} passed; ${summary.matrix.failed} failed`,
    `- Final screenshots: ${summary.screenshots.written}/${summary.screenshots.expected} written`,
    `- Screenshot directory: ${report.screenshotDirectory.actualCount}/${report.screenshotDirectory.expectedCount} expected PNG files; ${report.screenshotDirectory.unexpected.length} unexpected`,
    `- Exact zero-overflow rows: ${summary.responsive.zeroOverflowRows}/${summary.matrix.expected}`,
    `- Nonblank rendered viewports: ${summary.visual.nonBlankRows}/${summary.visual.expectedRows}`,
    `- Rows with clipped/truncated important content or images: ${summary.responsive.clippedRows}`,
    `- EN↔FR round trips: ${summary.localization.switchPassedRows}/${summary.localization.switchExpectedRows}`,
    `- Correct theme rows: ${summary.themes.correctThemeRows}/${summary.matrix.expected}`,
    `- Unique light/dark asset groups: ${summary.themes.uniqueAssetGroupsPassed}/${summary.themes.uniqueAssetGroupsExpected}`,
    `- Rows with page-unique assets: ${summary.assets.uniqueAcrossPagesRows}/${summary.matrix.expected}`,
    `- Rows with content-fingerprinted assets: ${summary.assets.fullyFingerprintedRows}/${summary.matrix.expected}`,
    `- Rows with responsive image metadata: ${summary.assets.responsiveMetadataRows}/${summary.matrix.expected}`,
    `- Rows with complete localized canonical/hreflang/SEO/OG/Twitter metadata: ${summary.seo.validRows}/${summary.seo.expectedRows}`,
    `- Console/page/critical-resource error rows: ${summary.runtime.consoleErrorRows}/${summary.runtime.pageErrorRows}/${summary.runtime.criticalResourceErrorRows}`,
    `- Rows with broken images: ${summary.runtime.brokenImageRows}`,
    '',
    '## Issue counts',
    '',
  ];

  const issueEntries = Object.entries(summary.issueCounts).sort(([left], [right]) => left.localeCompare(right));

  if (issueEntries.length === 0) {
    lines.push('- None');
  } else {
    for (const [code, count] of issueEntries) {
      lines.push(`- \`${code}\`: ${count}`);
    }
  }

  if (summary.fatalErrors.length > 0) {
    lines.push('', '## Fatal harness errors', '');

    for (const error of summary.fatalErrors) {
      lines.push(`- ${markdownEscape(error.message ?? error)}`);
    }
  }

  lines.push(
    '',
    '## Row evidence',
    '',
    '| Page | Lang | Theme | Viewport | Result | Nonblank | Overflow | Clipped | Broken images | EN↔FR | Theme asset | Screenshot | Issues |',
    '| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |',
  );

  for (const row of rows) {
    const screenshot = row.screenshotWritten ? `[PNG](${row.screenshot})` : row.screenshot ? 'MISSING' : 'matrix only';
    const issues = row.issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ') || 'none';

    lines.push(
      `| ${row.slug} | ${row.language} | ${row.theme} | ${row.viewport.width}×${row.viewport.height} | ${mark(
        row.status === 'passed',
      )} | ${mark(Boolean(row.evidence.nonBlank?.passed))} | ${
        row.evidence.overflow?.documentOverflowPx ?? 'n/a'
      } | ${row.evidence.clippedContent?.count ?? 'n/a'} | ${
        row.evidence.images?.brokenCount ?? 'n/a'
      } | ${mark(Boolean(row.evidence.languageSwitch?.passed))} | ${mark(
        Boolean(row.evidence.themeAssetUnique),
      )} | ${screenshot} | ${markdownEscape(issues)} |`,
    );
  }

  lines.push(
    '',
    'The JSON companion contains the exact console messages, page-error stacks, failed resource URLs, offending DOM geometry, image state, localized switch snapshots, and per-slot asset URLs/hashes for every row.',
    '',
  );

  return lines.join('\n');
}

async function writeAtomic(path, content) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, path);
}

async function persistReport(config, report) {
  await mkdir(config.outputDirectory, { recursive: true });

  const jsonPath = resolve(config.outputDirectory, REPORT_JSON);
  const markdownPath = resolve(config.outputDirectory, REPORT_MARKDOWN);
  await writeAtomic(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomic(markdownPath, buildMarkdownReport(report));

  return {
    json: relative(process.cwd(), jsonPath),
    markdown: relative(process.cwd(), markdownPath),
  };
}

async function verifyScreenshotDirectory(config, matrix) {
  const screenshotDirectory = resolve(config.outputDirectory, 'screenshots');

  const expected = matrix
    .filter((row) => row.captureScreenshot)
    .map((row) => basename(row.screenshot))
    .sort();

  const entries = await readdir(screenshotDirectory, { withFileTypes: true });

  const actual = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name)
    .sort();

  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  return {
    expectedCount: expected.length,
    actualCount: actual.length,
    missing: expected.filter((name) => !actualSet.has(name)),
    unexpected: actual.filter((name) => !expectedSet.has(name)),
    passed:
      expected.length === EXPECTED_SCREENSHOTS &&
      actual.length === EXPECTED_SCREENSHOTS &&
      expected.every((name) => actualSet.has(name)),
  };
}

async function run() {
  const rawArguments = process.argv.slice(2);
  const parsedArguments = parseArguments(rawArguments);

  if (parsedArguments.help) {
    process.stdout.write(`${usageText()}\n`);
    return;
  }

  const config = loadHarnessConfig({ argv: rawArguments });
  const matrix = buildProofMatrix();

  const runState = {
    harnessVersion: '2.0.0',
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: null,
  };

  const started = Date.now();
  const fatalErrors = [];

  let rows = matrix.map((row) => emptyRowResult(row, config.baseUrl));
  let themeGroups = [];
  let screenshotDirectory = null;
  let browser;

  await mkdir(resolve(config.outputDirectory, 'screenshots'), { recursive: true });

  try {
    browser = await chromium.launch({ headless: !config.headed });
    rows = await mapWithConcurrency(matrix, config.workers, (row) => auditRow(browser, config, row));
    await fingerprintProofAssets(rows, config.timeoutMs);
    themeGroups = applyCrossRowAssetChecks(rows);
  } catch (error) {
    fatalErrors.push({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }

  for (const row of rows) {
    if (row.status === 'pending') {
      addIssue(row, 'not_executed', 'The matrix row was not executed because the harness stopped early');
      row.finishedAt = row.finishedAt ?? nowIso();
      row.durationMs = row.durationMs ?? 0;
    }
  }

  finalizeRows(rows);
  screenshotDirectory = await verifyScreenshotDirectory(config, matrix);

  if (!screenshotDirectory.passed) {
    fatalErrors.push({
      message: 'The final screenshot directory does not contain exactly the expected 96 PNG files',
      details: screenshotDirectory,
    });
  }

  runState.finishedAt = nowIso();
  runState.durationMs = Date.now() - started;

  const summary = buildSummary(rows, themeGroups, fatalErrors);

  const report = {
    schemaVersion: 1,
    run: runState,
    config: {
      baseUrl: config.baseUrl,
      deployed: config.deployed,
      localOverride: config.allowLocal,
      outputDirectory: config.outputDirectoryRelative,
      workers: config.workers,
      timeoutMs: config.timeoutMs,
      headed: config.headed,
    },
    summary,
    screenshotDirectory,
    themeAssetGroups: themeGroups,
    rows,
  };

  const paths = await persistReport(config, report);

  process.stdout.write(
    `${summary.passed ? 'PASS' : 'FAIL'}: ${summary.matrix.passed}/${summary.matrix.expected} rows; ${summary.screenshots.written}/${summary.screenshots.expected} screenshots\n`,
  );
  process.stdout.write(`JSON: ${paths.json}\nMarkdown: ${paths.markdown}\n`);

  if (!summary.passed) {
    process.exitCode = 1;
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntrypoint) {
  run().catch((error) => {
    process.stderr.write(`${basename(process.argv[1])}: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
