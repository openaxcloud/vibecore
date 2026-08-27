import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { expect, test, type ConsoleMessage, type Page, type TestInfo } from '@playwright/test';

import {
  findFrenchAuditResidue,
  type AuditSemanticEntry as SemanticEntry,
} from '~/lib/i18n/catalogs/live-audit-heuristics';

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const RUN_FULL_AUDIT = process.env.I18N_FULL_LIVE_AUDIT === '1';
const CAPTURE_ALL = process.env.I18N_CAPTURE_ALL === '1';

const AUDIT_PATH_PATTERN = process.env.I18N_AUDIT_PATH_PATTERN
  ? new RegExp(process.env.I18N_AUDIT_PATH_PATTERN, 'u')
  : null;

const AUTH_PATHS = [
  '/login',
  '/signup',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/invitations/accept',
] as const;

/* Stable missing URLs exercise both the dynamic-slug and catch-all localized HTTP 404 shells. */
const PUBLIC_ERROR_PATHS = ['/__i18n-audit-missing-page__', '/__i18n-audit__/missing/page'] as const;

/*
 * Les deux chemins qui montent la coque de l'IDE. La bascule de langue globale y
 * a été RETIRÉE sur décision produit : elle occupait en permanence une place de
 * la barre — et, sur mobile, une pastille par-dessus la conversation de l'agent —
 * pour un réglage qu'on touche une fois. La langue est détectée au chargement et
 * se règle dans Paramètres → Préférences (`app/components/i18n/LanguageSetting.tsx`).
 *
 * Ces chemins ne sont donc pas exemptés de vérification : on y vérifie
 * l'invariant INVERSE — la bascule doit être absente. Un simple `skip` laisserait
 * repasser la pastille sans que rien ne le signale.
 */
function isIdeShellPath(path: string): boolean {
  return /^\/projects\/[^/]+\/(ide|git)$/u.test(path);
}

const USER_PATHS = [
  '/dashboard',
  '/projects',
  '/recent-projects',
  '/projects/new',
  '/dashboard/templates',
  '/notifications',
  '/billing',
  '/usage',
  '/invoices',
  '/payment-method',
  '/account-settings',
  '/account-settings/connected',
  '/account-settings/data',
  '/security-settings',
  '/session-security',
  '/api-keys',
  '/support',
  '/organization-switcher',
  '/organization-members',
  '/organization-invitations',
  '/organization-roles',
  '/organization-domains',
  '/organization-security',
  '/organization-siem',
  '/enterprise-sso-settings',
  '/scim-token-settings',
  '/audit-logs',
  '/usage-limits',
  '/upgrade',
  '/downgrade',
  '/onboarding',
  '/command-palette',
  '/desktop-settings',
  '/workspace-settings',
] as const;

const PROJECT_PATHS = [
  '/projects/{projectId}',
  '/projects/{projectId}/ide',
  '/projects/{projectId}/activity',
  '/projects/{projectId}/collaborators',
  '/projects/{projectId}/database',
  '/projects/{projectId}/deployments',
  '/projects/{projectId}/domains',
  '/projects/{projectId}/env',
  '/projects/{projectId}/git',
  '/projects/{projectId}/logs',
  '/projects/{projectId}/preview',
  '/projects/{projectId}/secrets',
  '/projects/{projectId}/settings',
  '/projects/{projectId}/snapshots',
] as const;

function selectedAuditPaths(paths: readonly string[]): string[] {
  return AUDIT_PATH_PATTERN ? paths.filter((path) => AUDIT_PATH_PATTERN.test(path)) : [...paths];
}

function localizedPath(path: string, language: 'en' | 'fr'): string {
  const url = new URL(path, APP_BASE_URL);
  url.searchParams.set('lang', language);

  return `${url.pathname}${url.search}${url.hash}`;
}

async function semanticEntries(page: Page): Promise<SemanticEntry[]> {
  return page.evaluate(() => {
    const excludedSelector = [
      'code',
      'kbd',
      'pre',
      'samp',
      'script',
      'style',
      'svg',
      'template',
      '.cm-editor',
      '.monaco-editor',
      '.xterm',
      '[contenteditable="true"]',
      '[data-i18n-audit-ignore]',
      '[data-user-content]',
    ].join(',');

    const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';

    const visible = (element: Element) => {
      const html = element as HTMLElement;
      const style = window.getComputedStyle(html);
      const rect = html.getBoundingClientRect();

      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0;
    };
    const locatorFor = (element: Element) => {
      if (element.id) {
        return `#${CSS.escape(element.id)}`;
      }

      const testId = element.getAttribute('data-testid');

      if (testId) {
        return `[data-testid=${JSON.stringify(testId)}]`;
      }

      const parts: string[] = [];

      let current: Element | null = element;

      while (current && current !== document.body && parts.length < 5) {
        const tag = current.tagName.toLocaleLowerCase('en');

        const siblings = current.parentElement
          ? [...current.parentElement.children].filter((candidate) => candidate.tagName === current!.tagName)
          : [];

        const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
        parts.unshift(`${tag}${suffix}`);
        current = current.parentElement;
      }

      return parts.join(' > ');
    };

    const entries: SemanticEntry[] = [];

    const push = (
      kind: string,
      raw: string | null | undefined,
      element: Element,
      suffix = '',
      semanticKey?: string,
    ) => {
      const text = normalize(raw);

      if (text.length >= 2 && /[A-Za-zÀ-ÿ]/u.test(text)) {
        entries.push({ kind, text, locator: `${locatorFor(element)}${suffix}`, semanticKey });
      }
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    let node: Node | null;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;

      if (!parent || parent.closest(excludedSelector) || !visible(parent)) {
        continue;
      }

      push('text', node.textContent, parent);
    }

    for (const element of document.body.querySelectorAll('*')) {
      if (element.closest(excludedSelector) || !visible(element)) {
        continue;
      }

      for (const attribute of ['alt', 'aria-description', 'aria-label', 'placeholder', 'title']) {
        push(attribute, element.getAttribute(attribute), element, `@${attribute}`);
      }
    }

    push('document-title', document.title, document.documentElement, '@title', 'document:title');

    const humanMetadata = new Set([
      'description',
      'og:description',
      'og:image:alt',
      'og:title',
      'twitter:description',
      'twitter:image:alt',
      'twitter:title',
    ]);

    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name], meta[property]')) {
      const field = meta.name || meta.getAttribute('property') || '';

      if (humanMetadata.has(field)) {
        push('meta', meta.content, meta, `@${field}`, `meta:${field}`);
      }
    }

    return entries;
  });
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.context().addCookies([
    {
      name: 'ecode_theme',
      value: theme,
      url: APP_BASE_URL,
      sameSite: 'Lax',
    },
  ]);
}

async function setLanguage(page: Page, language: 'en' | 'fr'): Promise<void> {
  await page.context().addCookies([
    {
      name: 'vibecore-lang',
      value: language,
      url: APP_BASE_URL,
      sameSite: 'Lax',
    },
  ]);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (!CAPTURE_ALL) {
    return;
  }

  const path = testInfo.outputPath('i18n-proof', `${name}.png`);

  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}

async function persistJsonEvidence(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  const path = testInfo.outputPath('i18n-proof', `${name}.json`);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function waitForApplicationReady(page: Page, path: string, language: 'en' | 'fr'): Promise<void> {
  const bootSplash = page.locator('[data-ecode-boot-splash], [data-ecode-ide-boot-splash]');
  const globalLanguageSwitch = page.locator('[data-testid="language-switch"]:visible').first();

  await expect.soft(bootSplash, `${path} ${language} boot splash dismissed`).toHaveCount(0, { timeout: 15_000 });

  if (isIdeShellPath(path)) {
    // La coque IDE n'a plus de bascule : attendre qu'elle apparaisse ne finirait jamais.
    return;
  }

  await expect
    .soft(globalLanguageSwitch, `${path} ${language} global language switch ready`)
    .toBeVisible({ timeout: 15_000 });
}

function isExpectedMissingDocumentConsole(path: string, message: ConsoleMessage): boolean {
  if (!PUBLIC_ERROR_PATHS.some((candidate) => candidate === path)) {
    return false;
  }

  if (message.text() !== 'Failed to load resource: the server responded with a status of 404 (Not Found)') {
    return false;
  }

  try {
    return new URL(message.location().url).pathname === new URL(path, APP_BASE_URL).pathname;
  } catch {
    return false;
  }
}

async function auditRoutePair(page: Page, path: string, theme: 'dark' | 'light', testInfo: TestInfo): Promise<void> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  let auditLocale: 'en' | 'fr' = 'en';

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      if (isExpectedMissingDocumentConsole(path, message)) {
        return;
      }

      const location = message.location();
      const source = location.url ? ` @ ${location.url}:${location.lineNumber + 1}` : '';

      consoleErrors.push(`${auditLocale}: ${message.text()}${source}`);
    }
  };

  const onPageError = (error: Error) => pageErrors.push(`${auditLocale}: ${error.message}`);

  /*
   * Move through a neutral document between audited URLs. React Router can
   * still be discovering lazy route-manifest patches after a page is ready;
   * a direct full-document navigation aborts that obsolete request and Chrome
   * reports a misleading `Failed to fetch manifest patches` console error.
   * Detaching only for the deliberate teardown keeps every hydration/runtime
   * error from the destination document observable.
   */
  const prepareDestinationDocument = async () => {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    await page.goto('about:blank');
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
  };

  await setTheme(page, theme);
  await setLanguage(page, 'en');
  await prepareDestinationDocument();

  const englishResponse = await page.goto(localizedPath(path, 'en'), { waitUntil: 'domcontentloaded' });

  if (PUBLIC_ERROR_PATHS.some((candidate) => candidate === path)) {
    expect.soft(englishResponse?.status(), `${path} English response`).toBe(404);
  } else {
    expect.soft(englishResponse?.status(), `${path} English response`).toBeLessThan(500);
  }

  await waitForApplicationReady(page, path, 'en');
  await expect.soft(page.locator('html'), `${path} English document language`).toHaveAttribute('lang', 'en');

  const englishDocumentLanguage = await page.locator('html').getAttribute('lang');
  const englishDocumentTheme = await page.locator('html').getAttribute('data-theme');

  const english = await semanticEntries(page);
  await capture(page, testInfo, `${theme}-en-${path.replace(/[^a-z0-9]+/giu, '-') || 'home'}`);

  auditLocale = 'fr';
  await setLanguage(page, 'fr');
  await prepareDestinationDocument();

  const frenchResponse = await page.goto(localizedPath(path, 'fr'), { waitUntil: 'domcontentloaded' });

  if (PUBLIC_ERROR_PATHS.some((candidate) => candidate === path)) {
    expect.soft(frenchResponse?.status(), `${path} French response`).toBe(404);
  } else {
    expect.soft(frenchResponse?.status(), `${path} French response`).toBeLessThan(500);
  }

  await waitForApplicationReady(page, path, 'fr');
  await expect.soft(page.locator('html'), `${path} active document language`).toHaveAttribute('lang', 'fr');

  await expect.soft(page.locator('html'), `${path} active theme`).toHaveAttribute('data-theme', theme);

  const frenchDocumentLanguage = await page.locator('html').getAttribute('lang');
  const frenchDocumentTheme = await page.locator('html').getAttribute('data-theme');

  const french = await semanticEntries(page);
  const findings = findFrenchAuditResidue(english, french);

  const languageSwitchCount = await page.locator('[data-testid="language-switch"]:visible').count();

  const languageSwitchInteraction = await page
    .locator('[data-testid="language-switch"]:visible')
    .evaluateAll((groups) => {
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();

        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          width: box.width,
          height: box.height,
        };
      };
      const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

      const groupEvidence = groups.map((group) => ({
        rect: rect(group),
        buttons: [...group.querySelectorAll<HTMLButtonElement>('button')].map((button) => {
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

          return {
            rect: rect(button),
            hitTarget: hit === button || button.contains(hit),
            insideViewport:
              box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth,
          };
        }),
      }));

      const slot = document.querySelector<HTMLElement>('[data-testid="mobile-ide-language-switch-slot"]');
      const header = document.querySelector<HTMLElement>('[data-testid="mobile-ide-header"]');
      const firstContent = document.querySelector<HTMLElement>('.bolt-mobile-agent-start-state');
      const slotRect = slot?.getBoundingClientRect();
      const headerRect = header?.getBoundingClientRect();
      const firstContentRect = firstContent?.getBoundingClientRect();

      const compactIde =
        slotRect &&
        headerRect &&
        slotRect.width > 0 &&
        slotRect.height > 0 &&
        headerRect.width > 0 &&
        headerRect.height > 0
          ? {
              slot: rect(slot),
              header: rect(header),
              overlapsHeader: overlaps(rect(slot), rect(header)),
              headerGap: slotRect.top - headerRect.bottom,
              firstContent:
                firstContentRect && firstContentRect.width > 0 && firstContentRect.height > 0
                  ? rect(firstContent)
                  : null,
              overlapsFirstContent:
                firstContentRect && firstContentRect.width > 0 && firstContentRect.height > 0
                  ? overlaps(rect(slot), rect(firstContent))
                  : false,
              firstContentGap:
                firstContentRect && firstContentRect.width > 0 && firstContentRect.height > 0
                  ? firstContentRect.top - slotRect.bottom
                  : null,
            }
          : null;

      return { groups: groupEvidence, compactIde };
    });

  const documentSeo = await page.evaluate(() => {
    const hrefs = (selector: string) =>
      [...document.head.querySelectorAll<HTMLLinkElement>(selector)].map((link) => link.href);
    const contents = (selector: string) =>
      [...document.head.querySelectorAll<HTMLMetaElement>(selector)].map((meta) => meta.content);

    return {
      canonical: hrefs('link[rel="canonical"]'),
      english: hrefs('link[rel="alternate"][hreflang="en"]'),
      french: hrefs('link[rel="alternate"][hreflang="fr"]'),
      defaultLanguage: hrefs('link[rel="alternate"][hreflang="x-default"]'),
      description: contents('meta[name="description"]'),
      openGraph: {
        type: contents('meta[property="og:type"]'),
        title: contents('meta[property="og:title"]'),
        description: contents('meta[property="og:description"]'),
        image: contents('meta[property="og:image"]'),
        imageAlt: contents('meta[property="og:image:alt"]'),
        locale: contents('meta[property="og:locale"]'),
        alternateLocales: contents('meta[property="og:locale:alternate"]'),
      },
      twitter: {
        card: contents('meta[name="twitter:card"]'),
        title: contents('meta[name="twitter:title"]'),
        description: contents('meta[name="twitter:description"]'),
        image: contents('meta[name="twitter:image"]'),
        imageAlt: contents('meta[name="twitter:image:alt"]'),
      },
    };
  });
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyHeight: document.body.getBoundingClientRect().height,
    bodyTextLength: document.body.innerText.trim().length,
  }));

  page.off('console', onConsole);
  page.off('pageerror', onPageError);

  await capture(page, testInfo, `${theme}-fr-${path.replace(/[^a-z0-9]+/giu, '-') || 'home'}`);
  await persistJsonEvidence(testInfo, `i18n-audit-${theme}-${path.replace(/[^a-z0-9]+/giu, '-') || 'home'}`, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRevision: process.env.GITHUB_SHA ?? process.env.I18N_AUDIT_REVISION ?? 'working-tree',
    project: testInfo.project.name,
    viewport: testInfo.project.use.viewport,
    baseUrl: APP_BASE_URL,
    path,
    theme,
    responseStatus: { en: englishResponse?.status(), fr: frenchResponse?.status() },
    documentLanguage: { en: englishDocumentLanguage, fr: frenchDocumentLanguage },
    documentTheme: { en: englishDocumentTheme, fr: frenchDocumentTheme },
    layout,
    consoleErrors,
    pageErrors,
    findings,
    languageSwitchCount,
    languageSwitchInteraction,
    documentSeo,
    scannedEntries: french.length,
  });

  expect
    .soft(layout.documentWidth, `${path} (${theme}) horizontal overflow`)
    .toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect.soft(layout.bodyHeight, `${path} (${theme}) non-blank body height`).toBeGreaterThan(0);
  expect.soft(layout.bodyTextLength, `${path} (${theme}) non-blank visible text`).toBeGreaterThan(0);
  expect.soft(french.length, `${path} (${theme}) semantic entries scanned`).toBeGreaterThan(0);

  if (isIdeShellPath(path)) {
    expect
      .soft(languageSwitchCount, `${path} (${theme}) la coque IDE ne remonte PAS de bascule de langue globale`)
      .toBe(0);
  } else {
    expect.soft(languageSwitchCount, `${path} (${theme}) visible global language switch`).toBeGreaterThan(0);
  }

  expect
    .soft(
      languageSwitchInteraction.groups.every(
        (group) =>
          group.buttons.length === 2 && group.buttons.every((button) => button.hitTarget && button.insideViewport),
      ),
      `${path} (${theme}) language switch buttons are unobscured and inside the viewport`,
    )
    .toBe(true);

  if (languageSwitchInteraction.compactIde) {
    expect
      .soft(
        languageSwitchInteraction.compactIde.overlapsHeader,
        `${path} (${theme}) compact IDE language switch does not overlap the frozen header`,
      )
      .toBe(false);
    expect
      .soft(
        languageSwitchInteraction.compactIde.headerGap,
        `${path} (${theme}) compact IDE language switch clears the frozen header`,
      )
      .toBeGreaterThanOrEqual(7);
    expect
      .soft(
        languageSwitchInteraction.compactIde.overlapsFirstContent,
        `${path} (${theme}) compact IDE language switch does not cover the first content card`,
      )
      .toBe(false);

    if (languageSwitchInteraction.compactIde.firstContentGap !== null) {
      expect
        .soft(
          languageSwitchInteraction.compactIde.firstContentGap,
          `${path} (${theme}) compact IDE first content clears the language switch`,
        )
        .toBeGreaterThanOrEqual(0);
    }
  }

  expect.soft(documentSeo.canonical, `${path} (${theme}) one canonical link`).toHaveLength(1);
  expect.soft(documentSeo.english, `${path} (${theme}) one English alternate`).toHaveLength(1);
  expect.soft(documentSeo.french, `${path} (${theme}) one French alternate`).toHaveLength(1);
  expect.soft(documentSeo.defaultLanguage, `${path} (${theme}) one x-default alternate`).toHaveLength(1);
  expect.soft(documentSeo.description, `${path} (${theme}) one localized description`).toHaveLength(1);
  expect.soft(documentSeo.openGraph.type, `${path} (${theme}) one Open Graph type`).toHaveLength(1);
  expect.soft(documentSeo.openGraph.title, `${path} (${theme}) one Open Graph title`).toHaveLength(1);
  expect.soft(documentSeo.openGraph.description, `${path} (${theme}) one Open Graph description`).toHaveLength(1);
  expect.soft(documentSeo.openGraph.image, `${path} (${theme}) one Open Graph image`).toHaveLength(1);
  expect.soft(documentSeo.openGraph.imageAlt, `${path} (${theme}) one Open Graph image alternative`).toHaveLength(1);
  expect.soft(documentSeo.openGraph.locale, `${path} (${theme}) one Open Graph locale`).toEqual(['fr_FR']);
  expect
    .soft(documentSeo.openGraph.alternateLocales, `${path} (${theme}) English Open Graph alternate locale`)
    .toContain('en_US');
  expect.soft(documentSeo.twitter.card, `${path} (${theme}) one Twitter card`).toEqual(['summary_large_image']);
  expect.soft(documentSeo.twitter.title, `${path} (${theme}) one Twitter title`).toHaveLength(1);
  expect.soft(documentSeo.twitter.description, `${path} (${theme}) one Twitter description`).toHaveLength(1);
  expect.soft(documentSeo.twitter.image, `${path} (${theme}) one Twitter image`).toHaveLength(1);
  expect.soft(documentSeo.twitter.imageAlt, `${path} (${theme}) one Twitter image alternative`).toHaveLength(1);

  const canonicalUrl = documentSeo.canonical[0];

  expect
    .soft(
      canonicalUrl ? new URL(canonicalUrl).searchParams.has('lang') : true,
      `${path} English canonical has no locale query`,
    )
    .toBe(false);
  expect.soft(consoleErrors, `${path} (${theme}) browser console errors`).toEqual([]);
  expect.soft(pageErrors, `${path} (${theme}) uncaught page errors`).toEqual([]);
  expect
    .soft(
      findings,
      `${path} (${theme}) contains ${findings.length} untranslated/raw French DOM entries:\n${findings
        .slice(0, 60)
        .map((finding) => `${finding.reason}: ${finding.text} @ ${finding.locator}`)
        .join('\n')}`,
    )
    .toEqual([]);
}

async function publicPaths(page: Page): Promise<string[]> {
  const response = await page.request.get(`${APP_BASE_URL}/sitemap.xml`);
  expect(response.ok(), await response.text()).toBeTruthy();

  const xml = await response.text();

  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => new URL(match[1]!).pathname);
}

async function authenticateFrenchUser(page: Page): Promise<{ organizationId: string; projectId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const response = await page.request.post(`${API_BASE_URL}/auth/register`, {
    headers: { 'accept-language': 'fr-FR, en;q=0.8' },
    data: {
      email: `audit-i18n-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Utilisateur Audit',
      organizationName: `Organisation Audit ${suffix}`,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();

  const payload = (await response.json()) as { token: string; organization: { id: string } };

  const projectResponse = await page.request.post(`${API_BASE_URL}/orgs/${payload.organization.id}/projects`, {
    headers: { authorization: `Bearer ${payload.token}`, 'accept-language': 'fr' },
    data: { name: 'Projet Audit Français' },
  });
  expect(projectResponse.ok(), await projectResponse.text()).toBeTruthy();

  const project = (await projectResponse.json()) as { project: { id: string } };

  await page.context().addCookies([
    { name: 'vc_session', value: payload.token, url: APP_BASE_URL, httpOnly: true, sameSite: 'Lax' },
    { name: 'vibecore-lang', value: 'fr', url: APP_BASE_URL, sameSite: 'Lax' },
  ]);

  return { organizationId: payload.organization.id, projectId: project.project.id };
}

async function persistProjectTheme(page: Page, projectId: string, theme: 'dark' | 'light'): Promise<void> {
  const response = await page.request.post(
    `${APP_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/ide-panel/settings`,
    {
      form: {
        intent: 'preferences',
        theme,
        keyboardMode: 'false',
        creditAlertThreshold: '80',
      },
    },
  );

  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe('complete French live i18n audit', () => {
  test.skip(!RUN_FULL_AUDIT, 'Set I18N_FULL_LIVE_AUDIT=1 for the exhaustive locale matrix.');
  test.describe.configure({ timeout: 30 * 60_000 });

  test('browser detection, manual override and global switch work', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ locale: 'fr-FR' });
    const page = await context.newPage();

    try {
      const firstVisitResponse = await page.goto(APP_BASE_URL, { waitUntil: 'domcontentloaded' });

      const firstVisitNegotiation = {
        requestHeaders: firstVisitResponse?.request().headers(),
        responseHeaders: await firstVisitResponse?.allHeaders(),
        cookies: await context.cookies(),
        navigatorLanguage: await page.evaluate(() => navigator.language),
        documentLanguage: await page.locator('html').getAttribute('lang'),
      };
      await persistJsonEvidence(testInfo, 'first-visit-language-negotiation', firstVisitNegotiation);
      expect(firstVisitNegotiation.requestHeaders?.['accept-language']).toContain('fr-FR');
      expect(firstVisitNegotiation.responseHeaders?.['content-language']).toBe('fr');
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page.getByRole('button', { name: /English|Anglais/u })).toBeVisible();
      await page.getByRole('button', { name: /English|Anglais/u }).click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');

      await page.getByRole('button', { name: /French|Français/u }).click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

      const themeBeforeToggle = await page.locator('html').getAttribute('data-theme');

      const themeToggle = page
        .locator('[data-testid="button-theme-toggle"]:visible, [data-testid="public-theme-toggle"]:visible')
        .first();
      await expect(themeToggle).toBeVisible();
      await themeToggle.click();
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', themeBeforeToggle ?? '');

      const themeAfterToggle = await page.locator('html').getAttribute('data-theme');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', themeAfterToggle ?? '');
    } finally {
      await context.close();
    }

    const navigatorFallbackContext = await browser.newContext({ locale: 'fr-FR' });
    const navigatorFallbackPage = await navigatorFallbackContext.newPage();

    try {
      await navigatorFallbackPage.route('**/*', async (route) => {
        const headers = await route.request().allHeaders();

        delete headers['accept-language'];
        await route.continue({ headers });
      });
      await navigatorFallbackPage.goto(APP_BASE_URL, { waitUntil: 'domcontentloaded' });
      await expect(navigatorFallbackPage.locator('html')).toHaveAttribute('lang', 'fr', { timeout: 15_000 });

      const automaticCookie = (await navigatorFallbackContext.cookies()).find(
        (cookie) => cookie.name === 'vibecore-auto-lang',
      );

      expect(automaticCookie?.value).toBe('fr');
      await persistJsonEvidence(testInfo, 'navigator-language-fallback', {
        navigatorLanguage: await navigatorFallbackPage.evaluate(() => navigator.language),
        documentLanguage: await navigatorFallbackPage.locator('html').getAttribute('lang'),
        automaticCookie,
      });
    } finally {
      await navigatorFallbackContext.close();
    }
  });

  test('all sitemap marketing pages are translated in both themes', async ({ page }, testInfo) => {
    for (const theme of ['dark', 'light'] as const) {
      for (const path of [...(await publicPaths(page)), ...PUBLIC_ERROR_PATHS]) {
        if (!selectedAuditPaths([path]).length) {
          continue;
        }

        await auditRoutePair(page, path, theme, testInfo);
      }
    }
  });

  test('all auth pages are translated in both themes', async ({ page }, testInfo) => {
    for (const theme of ['dark', 'light'] as const) {
      for (const path of selectedAuditPaths(AUTH_PATHS)) {
        await auditRoutePair(page, path, theme, testInfo);
      }
    }
  });

  test('user area and project panels are translated in both themes', async ({ page }, testInfo) => {
    const { projectId } = await authenticateFrenchUser(page);

    const paths = selectedAuditPaths([
      ...USER_PATHS,
      ...PROJECT_PATHS.map((path) => path.replace('{projectId}', projectId)),
    ]);

    for (const theme of ['dark', 'light'] as const) {
      await persistProjectTheme(page, projectId, theme);

      for (const path of paths) {
        await auditRoutePair(page, path, theme, testInfo);
      }
    }
  });
});
