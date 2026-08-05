import { expect, test, type ConsoleMessage, type Page, type TestInfo } from '@playwright/test';

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const RUN_FULL_AUDIT = process.env.I18N_FULL_LIVE_AUDIT === '1';
const CAPTURE_ALL = process.env.I18N_CAPTURE_ALL === '1';

const AUTH_PATHS = [
  '/login',
  '/signup',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/invitations/accept',
] as const;

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

type SemanticEntry = Readonly<{ kind: string; text: string; locator: string }>;
type AuditFinding = SemanticEntry & Readonly<{ reason: 'english-match' | 'english-signal' | 'raw-key' }>;

const APPROVED_EXACT = new Set(
  [
    'E-Code',
    'VibeCore',
    'AI',
    'API',
    'AWS',
    'Azure',
    'BYOK',
    'Cloudflare',
    'Docker',
    'Figma',
    'Git',
    'GitHub',
    'GitLab',
    'Google',
    'GraphQL',
    'HTTP',
    'HTTPS',
    'IDE',
    'JSON',
    'Kubernetes',
    'MCP',
    'MongoDB',
    'Netlify',
    'OAuth',
    'Open Graph',
    'OpenAI',
    'PostgreSQL',
    'Redis',
    'SAML',
    'SCIM',
    'SOC 2',
    'SQL',
    'SSO',
    'Supabase',
    'Terminal',
    'TypeScript',
    'URL',
    'UTC',
    'Vercel',
    'WebSocket',
    'X',
    'YAML',
    'commit',
    'cron',
    'npm',
    'pnpm',
    'yarn',
    'Agent',
    'Application',
    'Configuration',
    'Console',
    'Extension',
    'Interface',
    'Notification',
    'Pro',
    'Session',
    'Support',
    'Version',
  ].map((value) => value.toLocaleLowerCase('en')),
);

const ENGLISH_SIGNAL =
  /\b(?:the|your|you|with|from|settings|workspace|deployments?|billing|loading|failed|save|cancel|delete|create|search|sign in|log in|get started|learn more|try again|no results|open|close|back|next|previous|view|edit|add|remove|preview|logs?|marketplace|snapshots?|packages?|builds?|runtime|stack|starter|typecheck|full-stack|tokens?|tags?|tenants?|feature flags?|dashboard|backend|frontend|fork)\b/iu;
const RAW_KEY = /\b[a-z][\w-]*(?:\.[\w-]+){1,}\b/u;

function localizedPath(path: string, language: 'en' | 'fr'): string {
  const url = new URL(path, APP_BASE_URL);
  url.searchParams.set('lang', language);

  return `${url.pathname}${url.search}${url.hash}`;
}

function isApproved(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized || !/[A-Za-zÀ-ÿ]/u.test(normalized)) {
    return true;
  }

  if (
    /^(?:https?:\/\/|mailto:|tel:|\/|\.\/|\.\.\/)/iu.test(normalized) ||
    /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/u.test(normalized) ||
    /^(?:[A-Z][A-Z0-9_]*|--?[a-z][\w-]*)(?:[=:\s].*)?$/u.test(normalized) ||
    /^(?:[\w@.+~-]+\/)+[\w@.+~-]+(?:\.[A-Za-z0-9]+)?$/u.test(normalized)
  ) {
    return true;
  }

  if (APPROVED_EXACT.has(normalized.toLocaleLowerCase('en'))) {
    return true;
  }

  const words = normalized.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.+-]*/gu) ?? [];

  return words.length > 0 && words.every((word) => APPROVED_EXACT.has(word.toLocaleLowerCase('en')));
}

function findFrenchResidue(english: readonly SemanticEntry[], french: readonly SemanticEntry[]): AuditFinding[] {
  const englishValues = new Set(english.map((entry) => entry.text));
  const seen = new Set<string>();
  const findings: AuditFinding[] = [];

  for (const entry of french) {
    if (isApproved(entry.text)) {
      continue;
    }

    const reason = RAW_KEY.test(entry.text)
      ? 'raw-key'
      : englishValues.has(entry.text)
        ? 'english-match'
        : ENGLISH_SIGNAL.test(entry.text)
          ? 'english-signal'
          : undefined;

    if (!reason) {
      continue;
    }

    const fingerprint = `${entry.kind}\0${entry.text}\0${entry.locator}`;

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      findings.push({ ...entry, reason });
    }
  }

  return findings;
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
    const push = (kind: string, raw: string | null | undefined, element: Element, suffix = '') => {
      const text = normalize(raw);

      if (text.length >= 2 && /[A-Za-zÀ-ÿ]/u.test(text)) {
        entries.push({ kind, text, locator: `${locatorFor(element)}${suffix}` });
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

    push('document-title', document.title, document.documentElement, '@title');

    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="description"], meta[name^="twitter:"], meta[property^="og:"]',
    )) {
      push('meta', meta.content, meta, `@${meta.name || meta.getAttribute('property') || 'content'}`);
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

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (!CAPTURE_ALL) {
    return;
  }

  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png',
  });
}

async function auditRoutePair(page: Page, path: string, theme: 'dark' | 'light', testInfo: TestInfo): Promise<void> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let auditLocale: 'en' | 'fr' = 'en';
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      consoleErrors.push(`${auditLocale}: ${message.text()}`);
    }
  };
  const onPageError = (error: Error) => pageErrors.push(`${auditLocale}: ${error.message}`);

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  await setTheme(page, theme);
  const englishResponse = await page.goto(localizedPath(path, 'en'), { waitUntil: 'domcontentloaded' });
  expect.soft(englishResponse?.status(), `${path} English response`).toBeLessThan(500);
  await page.waitForTimeout(150);
  const english = await semanticEntries(page);
  await capture(page, testInfo, `${theme}-en-${path.replace(/[^a-z0-9]+/giu, '-') || 'home'}`);

  auditLocale = 'fr';
  const frenchResponse = await page.goto(localizedPath(path, 'fr'), { waitUntil: 'domcontentloaded' });
  expect.soft(frenchResponse?.status(), `${path} French response`).toBeLessThan(500);
  await page.waitForTimeout(150);
  await expect.soft(page.locator('html'), `${path} active document language`).toHaveAttribute('lang', 'fr');
  await expect.soft(page.locator('html'), `${path} active theme`).toHaveAttribute('data-theme', theme);
  const french = await semanticEntries(page);
  const findings = findFrenchResidue(english, french);
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyHeight: document.body.getBoundingClientRect().height,
    bodyTextLength: document.body.innerText.trim().length,
  }));

  page.off('console', onConsole);
  page.off('pageerror', onPageError);

  await capture(page, testInfo, `${theme}-fr-${path.replace(/[^a-z0-9]+/giu, '-') || 'home'}`);
  await testInfo.attach(`i18n-audit-${theme}-${path.replace(/[^a-z0-9]+/giu, '-') || 'home'}`, {
    body: Buffer.from(
      JSON.stringify(
        {
          path,
          theme,
          responseStatus: { en: englishResponse?.status(), fr: frenchResponse?.status() },
          layout,
          consoleErrors,
          pageErrors,
          findings,
          scannedEntries: french.length,
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });

  expect
    .soft(layout.documentWidth, `${path} (${theme}) horizontal overflow`)
    .toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect.soft(layout.bodyHeight, `${path} (${theme}) non-blank body height`).toBeGreaterThan(0);
  expect.soft(layout.bodyTextLength, `${path} (${theme}) non-blank visible text`).toBeGreaterThan(0);
  expect.soft(french.length, `${path} (${theme}) semantic entries scanned`).toBeGreaterThan(0);
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

test.describe('complete French live i18n audit', () => {
  test.skip(!RUN_FULL_AUDIT, 'Set I18N_FULL_LIVE_AUDIT=1 for the exhaustive locale matrix.');
  test.describe.configure({ timeout: 30 * 60_000 });

  test('browser detection, manual override and global switch work', async ({ page }) => {
    await page.context().clearCookies();
    await page.setExtraHTTPHeaders({ 'accept-language': 'fr-FR, en;q=0.8' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('button', { name: /English|Anglais/u })).toBeVisible();
    await page.getByRole('button', { name: /English|Anglais/u }).click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.setExtraHTTPHeaders({ 'accept-language': 'fr-FR' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('all sitemap marketing pages are translated in both themes', async ({ page }, testInfo) => {
    for (const theme of ['dark', 'light'] as const) {
      for (const path of await publicPaths(page)) {
        await auditRoutePair(page, path, theme, testInfo);
      }
    }
  });

  test('all auth pages are translated in both themes', async ({ page }, testInfo) => {
    for (const theme of ['dark', 'light'] as const) {
      for (const path of AUTH_PATHS) {
        await auditRoutePair(page, path, theme, testInfo);
      }
    }
  });

  test('user area and project panels are translated in both themes', async ({ page }, testInfo) => {
    const { projectId } = await authenticateFrenchUser(page);
    const paths = [...USER_PATHS, ...PROJECT_PATHS.map((path) => path.replace('{projectId}', projectId))];

    for (const theme of ['dark', 'light'] as const) {
      for (const path of paths) {
        await auditRoutePair(page, path, theme, testInfo);
      }
    }
  });
});
