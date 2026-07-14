import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page, type Response } from '@playwright/test';

/**
 * Read-only evidence capture for the server-rendered E-Code boot splash.
 *
 * Every case uses a fresh browser context, forces its theme before first paint,
 * blocks external JavaScript (and therefore React hydration), and verifies that
 * the canonical SVG already exists in the raw SSR response. Run this only after
 * the production rollout has completed when the resulting PNGs are intended as
 * release evidence; URL overrides make the same checks usable against preview
 * or local production servers.
 */

type Theme = 'light' | 'dark';
type Surface = 'app' | 'marketing';

interface CliOptions {
  appUrl: string;
  headed: boolean;
  marketingUrl: string;
  outputDirectory: string;
  timeoutMs: number;
}

interface Target {
  key: 'app-e-code-ai' | 'e-code-ai';
  surface: Surface;
  url: string;
}

interface AssertionResult {
  actual?: unknown;
  detail?: string;
  name: string;
  passed: boolean;
}

interface DomEvidence {
  backgroundColor: string | null;
  backgroundLuminance: number | null;
  firstContentfulPaintMs: number | null;
  hydratedAttribute: string | null;
  htmlTheme: string | null;
  initThemeAppliedAtMs: number | null;
  initThemeApplyCount: number;
  legacyOrangeSquareCount: number;
  legacySquareClassCount: number;
  logo: {
    ariaHidden: string | null;
    darkVariant: VariantEvidence | null;
    externalAssetCount: number;
    focusable: string | null;
    height: number;
    lightVariant: VariantEvidence | null;
    outerHtml: string;
    tagName: string;
    themeVariant: string | null;
    width: number;
  } | null;
  splashImageCount: number;
  splashPresent: boolean;
  splashVisible: boolean;
}

interface VariantEvidence {
  display: string;
  opacity: string;
  painted: boolean;
  visibility: string;
}

interface CaptureEvidence {
  assertions: AssertionResult[];
  blockedScriptRequests: string[];
  consoleErrors: string[];
  dom: DomEvidence | null;
  effectiveUrl: string | null;
  error: string | null;
  http: {
    cacheControl: string | null;
    cfCacheStatus: string | null;
    date: string | null;
    etag: string | null;
    status: number | null;
  };
  id: string;
  pageErrors: string[];
  passed: boolean;
  requestedUrl: string;
  responseHtmlSha256: string | null;
  screenshot: string;
  surface: Surface;
  theme: Theme;
}

interface EvidenceReport {
  allPassed: boolean;
  captureMode: string;
  cases: CaptureEvidence[];
  generatedAt: string;
  outputDirectory: string;
  schemaVersion: 1;
  viewport: { height: number; width: number };
}

const VIEWPORT = { width: 1280, height: 800 } as const;
const BOOT_STATUS_SELECTOR = 'main[role="status"][aria-label="Loading E-Code"]';
const BOOT_SPLASH_SELECTOR = 'main[data-ecode-boot-splash]';
const BOOT_LOGO_SELECTOR = 'svg[data-ecode-boot-mark][data-theme-variant="auto"]';
const REPORT_FILENAME = 'prehydration-splash-evidence.json';

const DEFAULT_OPTIONS: CliOptions = {
  appUrl: process.env.ECODE_SPLASH_APP_URL ?? 'https://app.e-code.ai/',
  headed: false,
  marketingUrl: process.env.ECODE_SPLASH_MARKETING_URL ?? 'https://e-code.ai/',
  outputDirectory: resolve(
    process.cwd(),
    process.env.ECODE_SPLASH_EVIDENCE_DIR ?? 'outputs/prehydration-splash-evidence',
  ),
  timeoutMs: 45_000,
};

function usage() {
  return `Capture the E-Code SSR splash before React hydration.

Usage:
  pnpm exec tsx scripts/capture-prehydration-splash.ts [options]

Options:
  --app-url <url>          App origin (default: https://app.e-code.ai/)
  --marketing-url <url>    Marketing origin (default: https://e-code.ai/)
  --output-dir <path>      Evidence directory
  --timeout-ms <number>    Navigation timeout (default: 45000)
  --headed                 Show Chromium while capturing
  --help                   Show this help

Environment equivalents:
  ECODE_SPLASH_APP_URL
  ECODE_SPLASH_MARKETING_URL
  ECODE_SPLASH_EVIDENCE_DIR
`;
}

function parseCli(argv: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      console.log(usage());
      process.exit(0);
    }

    if (argument === '--headed') {
      options.headed = true;
      continue;
    }

    const value = argv[index + 1];

    if (!value) {
      throw new Error(`Missing value for ${argument}`);
    }

    if (argument === '--app-url') {
      options.appUrl = value;
    } else if (argument === '--marketing-url') {
      options.marketingUrl = value;
    } else if (argument === '--output-dir') {
      options.outputDirectory = resolve(process.cwd(), value);
    } else if (argument === '--timeout-ms') {
      options.timeoutMs = Number(value);

      if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1_000) {
        throw new Error('--timeout-ms must be an integer of at least 1000');
      }
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }

    index += 1;
  }

  for (const [name, value] of [
    ['--app-url', options.appUrl],
    ['--marketing-url', options.marketingUrl],
  ] as const) {
    const url = new URL(value);

    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error(`${name} must use HTTPS unless it targets localhost`);
    }
  }

  return options;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function withCacheBuster(value: string, caseId: string) {
  const url = new URL(value);
  url.searchParams.set('__ecode_splash_proof', caseId);

  return url.toString();
}

function isJavaScriptRequest(url: string, resourceType: string) {
  if (resourceType === 'script') {
    return true;
  }

  try {
    return /\.(?:c|m)?js$/i.test(new URL(url).pathname);
  } catch {
    return /\.(?:c|m)?js(?:[?#]|$)/i.test(url);
  }
}

async function installThemeBeforePaint(context: BrowserContext, targetUrl: string, theme: Theme) {
  const target = new URL(targetUrl);

  if (target.hostname === 'e-code.ai' || target.hostname.endsWith('.e-code.ai')) {
    await context.addCookies([
      {
        domain: '.e-code.ai',
        name: 'ecode_theme',
        path: '/',
        sameSite: 'Lax',
        secure: true,
        value: theme,
      },
    ]);
  } else {
    await context.addCookies([
      {
        name: 'ecode_theme',
        sameSite: 'Lax',
        url: `${target.origin}/`,
        value: theme,
      },
    ]);
  }

  await context.addInitScript({
    content: `(() => {
      const forcedTheme = ${JSON.stringify(theme)};
      const proof = {
        appliedAt: null,
        applyCount: 0,
        requestedTheme: forcedTheme,
      };

      Reflect.set(globalThis, '__ecodeSplashThemeProof', proof);

      try {
        localStorage.setItem('bolt_theme', forcedTheme);
      } catch {
        // Storage may be unavailable in hardened browser contexts; the DOM
        // assignment below remains the source of truth for this capture.
      }

      const applyTheme = () => {
        const root = document.documentElement;

        if (!root) {
          return false;
        }

        if (root.getAttribute('data-theme') !== forcedTheme) {
          root.setAttribute('data-theme', forcedTheme);
        }

        root.classList.toggle('light', forcedTheme === 'light');
        root.classList.toggle('dark', forcedTheme === 'dark');

        if (root.style.colorScheme !== forcedTheme) {
          root.style.colorScheme = forcedTheme;
        }

        proof.applyCount += 1;
        proof.appliedAt ??= performance.now();

        return true;
      };

      applyTheme();

      const observer = new MutationObserver(() => {
        applyTheme();
      });

      observer.observe(document, {
        attributeFilter: ['class', 'data-theme', 'style'],
        attributes: true,
        childList: true,
        subtree: true,
      });

      document.addEventListener(
        'DOMContentLoaded',
        () => {
          applyTheme();
          observer.disconnect();
        },
        { once: true },
      );
    })();`,
  });
}

async function waitForStyledSplash(page: Page, timeoutMs: number) {
  const status = page.locator(BOOT_STATUS_SELECTOR);
  await status.waitFor({ state: 'visible', timeout: timeoutMs });

  await page.waitForFunction(
    `(() => {
      const splash = document.querySelector(${JSON.stringify(BOOT_STATUS_SELECTOR)});

      if (!(splash instanceof HTMLElement)) {
        return false;
      }

      const bounds = splash.getBoundingClientRect();
      const style = getComputedStyle(splash);

      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        bounds.width >= window.innerWidth * 0.9 &&
        bounds.height >= window.innerHeight * 0.9
      );
    })()`,
    undefined,
    { timeout: timeoutMs },
  );

  await page
    .waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, undefined, {
      timeout: Math.min(timeoutMs, 10_000),
    })
    .catch(() => undefined);
}

async function inspectDom(page: Page): Promise<DomEvidence> {
  const expression = `(() => {
    const logoSelector = ${JSON.stringify(BOOT_LOGO_SELECTOR)};
    const splashSelector = ${JSON.stringify(BOOT_SPLASH_SELECTOR)};
    const statusSelector = ${JSON.stringify(BOOT_STATUS_SELECTOR)};
    const expectedSplash = document.querySelector(splashSelector);
    const statusSplash = document.querySelector(statusSelector);
    const splash = expectedSplash ?? statusSplash;
    const logo = splash?.querySelector(logoSelector) ?? null;
    const proof = Reflect.get(globalThis, '__ecodeSplashThemeProof');
    const firstContentfulPaint = performance.getEntriesByName('first-contentful-paint')[0];
    const splashStyle = splash instanceof HTMLElement ? getComputedStyle(splash) : null;
    const splashBounds = splash instanceof HTMLElement ? splash.getBoundingClientRect() : null;
    const lightVariantElement = logo?.querySelector('g[data-ecode-mark-variant="light"]') ?? null;
    const darkVariantElement = logo?.querySelector('g[data-ecode-mark-variant="dark"]') ?? null;
    const lightVariantStyle = lightVariantElement instanceof SVGElement ? getComputedStyle(lightVariantElement) : null;
    const darkVariantStyle = darkVariantElement instanceof SVGElement ? getComputedStyle(darkVariantElement) : null;
    const lightVariantBounds = lightVariantElement instanceof SVGElement ? lightVariantElement.getBoundingClientRect() : null;
    const darkVariantBounds = darkVariantElement instanceof SVGElement ? darkVariantElement.getBoundingClientRect() : null;
    const lightVariant = lightVariantStyle && lightVariantBounds
      ? {
          display: lightVariantStyle.display,
          opacity: lightVariantStyle.opacity,
          painted:
            lightVariantStyle.display !== 'none' &&
            lightVariantStyle.visibility !== 'hidden' &&
            Number.parseFloat(lightVariantStyle.opacity || '1') > 0 &&
            lightVariantBounds.width > 0 &&
            lightVariantBounds.height > 0,
          visibility: lightVariantStyle.visibility,
        }
      : null;
    const darkVariant = darkVariantStyle && darkVariantBounds
      ? {
          display: darkVariantStyle.display,
          opacity: darkVariantStyle.opacity,
          painted:
            darkVariantStyle.display !== 'none' &&
            darkVariantStyle.visibility !== 'hidden' &&
            Number.parseFloat(darkVariantStyle.opacity || '1') > 0 &&
            darkVariantBounds.width > 0 &&
            darkVariantBounds.height > 0,
          visibility: darkVariantStyle.visibility,
        }
      : null;

    let legacyOrangeSquareCount = 0;

    if (splash) {
      for (const element of Array.from(splash.querySelectorAll('*'))) {
        if (!(element instanceof HTMLElement) || element.closest(logoSelector)) {
          continue;
        }

        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const background = style.backgroundColor + ' ' + style.backgroundImage;
        const isSquare = bounds.width >= 20 && bounds.width <= 56 && Math.abs(bounds.width - bounds.height) <= 3;
        const isRounded = Number.parseFloat(style.borderRadius) >= 4;
        const hasLegacyOrange = /(?:rgb\\(\\s*242[,\\s]+98[,\\s]+7|rgb\\(\\s*249[,\\s]+157[,\\s]+37|#f26207|#f99d25)/i.test(background);

        if (isSquare && isRounded && hasLegacyOrange) {
          legacyOrangeSquareCount += 1;
        }
      }
    }

    const logoBounds = logo instanceof SVGSVGElement ? logo.getBoundingClientRect() : null;
    const backgroundColor = splashStyle?.backgroundColor ?? null;
    const backgroundMatch = backgroundColor?.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)/i) ?? null;
    let backgroundLuminance = null;

    if (backgroundMatch) {
      const red = Number(backgroundMatch[1]) / 255;
      const green = Number(backgroundMatch[2]) / 255;
      const blue = Number(backgroundMatch[3]) / 255;
      const linearRed = red <= 0.04045 ? red / 12.92 : ((red + 0.055) / 1.055) ** 2.4;
      const linearGreen = green <= 0.04045 ? green / 12.92 : ((green + 0.055) / 1.055) ** 2.4;
      const linearBlue = blue <= 0.04045 ? blue / 12.92 : ((blue + 0.055) / 1.055) ** 2.4;
      backgroundLuminance = 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
    }

    return {
      backgroundColor,
      backgroundLuminance,
      firstContentfulPaintMs: firstContentfulPaint?.startTime ?? null,
      hydratedAttribute: document.documentElement.getAttribute('data-ecode-hydrated'),
      htmlTheme: document.documentElement.getAttribute('data-theme'),
      initThemeAppliedAtMs: proof?.appliedAt ?? null,
      initThemeApplyCount: proof?.applyCount ?? 0,
      legacyOrangeSquareCount,
      legacySquareClassCount: splash?.querySelectorAll('.bolt-app-boot-mark').length ?? 0,
      logo:
        logo instanceof SVGSVGElement
          ? {
              ariaHidden: logo.getAttribute('aria-hidden'),
              darkVariant,
              externalAssetCount: logo.querySelectorAll('image, use[href^="http"], use[href^="/"], use[xlink\\\\:href]').length,
              focusable: logo.getAttribute('focusable'),
              height: logoBounds?.height ?? 0,
              lightVariant,
              outerHtml: logo.outerHTML,
              tagName: logo.tagName.toLowerCase(),
              themeVariant: logo.getAttribute('data-theme-variant'),
              width: logoBounds?.width ?? 0,
            }
          : null,
      splashImageCount: splash?.querySelectorAll('img, image').length ?? 0,
      splashPresent: expectedSplash !== null,
      splashVisible:
        splashStyle !== null &&
        splashBounds !== null &&
        splashStyle.display !== 'none' &&
        splashStyle.visibility !== 'hidden' &&
        splashBounds.width > 0 &&
        splashBounds.height > 0,
    };
  })()`;

  return page.evaluate<DomEvidence>(expression);
}

function addAssertion(assertions: AssertionResult[], name: string, passed: boolean, actual?: unknown, detail?: string) {
  assertions.push({ actual, detail, name, passed });
}

async function captureCase(
  browser: Browser,
  options: CliOptions,
  target: Target,
  theme: Theme,
): Promise<CaptureEvidence> {
  const id = `${target.key}-${theme}`;
  const screenshot = `${id}-prehydration-splash.png`;
  const screenshotPath = resolve(options.outputDirectory, screenshot);
  const assertions: AssertionResult[] = [];
  const blockedScriptRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let response: Response | null = null;
  let responseHtml = '';
  let dom: DomEvidence | null = null;
  let error: string | null = null;

  let http: CaptureEvidence['http'] = {
    cacheControl: null,
    cfCacheStatus: null,
    date: null,
    etag: null,
    status: null,
  };

  try {
    context = await browser.newContext({
      bypassCSP: false,
      colorScheme: theme,
      deviceScaleFactor: 1,
      extraHTTPHeaders: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      viewport: VIEWPORT,
    });

    await installThemeBeforePaint(context, target.url, theme);

    await context.route('**/*', async (route) => {
      const request = route.request();

      if (isJavaScriptRequest(request.url(), request.resourceType())) {
        blockedScriptRequests.push(request.url());
        await route.abort('blockedbyclient');

        return;
      }

      await route.continue();
    });

    page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (pageError) => pageErrors.push(pageError.message));

    response = await page.goto(withCacheBuster(target.url, id), {
      timeout: options.timeoutMs,
      waitUntil: 'load',
    });

    if (response) {
      const headers = response.headers();
      http = {
        cacheControl: headers['cache-control'] ?? null,
        cfCacheStatus: headers['cf-cache-status'] ?? null,
        date: headers.date ?? null,
        etag: headers.etag ?? null,
        status: response.status(),
      };
    }

    addAssertion(assertions, 'document response exists', response !== null, response?.status() ?? null);
    addAssertion(assertions, 'document response is successful', response?.ok() === true, response?.status() ?? null);

    if (response) {
      responseHtml = await response.text();
    }

    await waitForStyledSplash(page, options.timeoutMs);
    dom = await inspectDom(page);

    addAssertion(assertions, 'SSR splash uses stable shell marker', dom.splashPresent, dom.splashPresent);
    addAssertion(assertions, 'splash is visible and viewport-sized', dom.splashVisible, dom.splashVisible);
    addAssertion(assertions, 'forced theme is active', dom.htmlTheme === theme, dom.htmlTheme, `expected ${theme}`);
    addAssertion(
      assertions,
      'theme was applied before first contentful paint',
      dom.initThemeAppliedAtMs !== null &&
        dom.firstContentfulPaintMs !== null &&
        dom.initThemeAppliedAtMs <= dom.firstContentfulPaintMs,
      {
        appliedAtMs: dom.initThemeAppliedAtMs,
        firstContentfulPaintMs: dom.firstContentfulPaintMs,
      },
    );
    addAssertion(
      assertions,
      'React hydration stayed blocked',
      dom.hydratedAttribute === null && blockedScriptRequests.length > 0,
      { blockedScriptCount: blockedScriptRequests.length, hydratedAttribute: dom.hydratedAttribute },
    );
    addAssertion(assertions, 'E-Code logo is an inline SVG', dom.logo?.tagName === 'svg', dom.logo?.tagName ?? null);
    addAssertion(
      assertions,
      'inline SVG is present in raw SSR HTML',
      responseHtml.includes('data-ecode-boot-mark'),
      responseHtml.includes('data-ecode-boot-mark'),
    );
    addAssertion(
      assertions,
      'inline SVG has both theme variants',
      dom.logo?.lightVariant !== null && dom.logo?.darkVariant !== null,
      {
        dark: dom.logo?.darkVariant ?? null,
        light: dom.logo?.lightVariant ?? null,
      },
    );

    const expectedVariant = theme === 'light' ? dom.logo?.lightVariant : dom.logo?.darkVariant;
    const otherVariant = theme === 'light' ? dom.logo?.darkVariant : dom.logo?.lightVariant;
    addAssertion(
      assertions,
      `${theme} SVG variant is exclusively painted`,
      expectedVariant?.painted === true && otherVariant?.painted === false,
      { expectedVariant, otherVariant },
    );
    addAssertion(
      assertions,
      'logo has no external image dependency',
      dom.splashImageCount === 0 && dom.logo?.externalAssetCount === 0,
      {
        externalAssetCount: dom.logo?.externalAssetCount ?? null,
        splashImageCount: dom.splashImageCount,
      },
    );
    addAssertion(
      assertions,
      'legacy orange square is absent',
      dom.legacySquareClassCount === 0 && dom.legacyOrangeSquareCount === 0,
      {
        legacyOrangeSquareCount: dom.legacyOrangeSquareCount,
        legacySquareClassCount: dom.legacySquareClassCount,
      },
    );
    addAssertion(
      assertions,
      `${theme} splash background matches the selected theme`,
      dom.backgroundLuminance !== null &&
        (theme === 'light' ? dom.backgroundLuminance >= 0.45 : dom.backgroundLuminance <= 0.2),
      {
        backgroundColor: dom.backgroundColor,
        luminance: dom.backgroundLuminance,
      },
    );
  } catch (captureError) {
    error = errorMessage(captureError);
    addAssertion(assertions, 'capture completed without an exception', false, error);

    if (page) {
      dom = await inspectDom(page).catch(() => null);
    }
  } finally {
    if (page) {
      try {
        await page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          fullPage: false,
          path: screenshotPath,
          type: 'png',
        });
        addAssertion(assertions, 'screenshot was written', true, screenshot);
      } catch (screenshotError) {
        const message = `Screenshot failed: ${errorMessage(screenshotError)}`;
        error = error ? `${error}; ${message}` : message;
        addAssertion(assertions, 'screenshot was written', false, message);
      }
    } else {
      addAssertion(assertions, 'screenshot was written', false, 'Page was not created');
    }

    await context?.close();
  }

  return {
    assertions,
    blockedScriptRequests: [...new Set(blockedScriptRequests)].sort(),
    consoleErrors,
    dom,
    effectiveUrl: page?.url() ?? null,
    error,
    http,
    id,
    pageErrors,
    passed: assertions.length > 0 && assertions.every((assertion) => assertion.passed),
    requestedUrl: target.url,
    responseHtmlSha256: responseHtml ? sha256(responseHtml) : null,
    screenshot,
    surface: target.surface,
    theme,
  };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  await mkdir(options.outputDirectory, { recursive: true });

  const targets: Target[] = [
    { key: 'app-e-code-ai', surface: 'app', url: options.appUrl },
    { key: 'e-code-ai', surface: 'marketing', url: options.marketingUrl },
  ];

  const browser = await chromium.launch({ headless: !options.headed });
  const cases: CaptureEvidence[] = [];

  try {
    for (const target of targets) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await captureCase(browser, options, target, theme);
        cases.push(result);
        console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id} -> ${result.screenshot}`);
      }
    }
  } finally {
    await browser.close();
  }

  const report: EvidenceReport = {
    allPassed: cases.every((capture) => capture.passed),
    captureMode:
      'Fresh Chromium context; service workers disabled; cache bypassed; external JavaScript blocked; theme init applied before first paint',
    cases,
    generatedAt: new Date().toISOString(),
    outputDirectory: options.outputDirectory,
    schemaVersion: 1,
    viewport: VIEWPORT,
  };

  const reportPath = resolve(options.outputDirectory, REPORT_FILENAME);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Evidence report: ${reportPath}`);

  if (!report.allPassed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
