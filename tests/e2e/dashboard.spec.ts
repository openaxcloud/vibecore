import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

/**
 * Pin the surface to the light theme before the first navigation.
 *
 * Theme resolution order is cookie -> localStorage -> server-seeded attribute.
 * `document.cookie` written from `addInitScript` cannot influence the *first*
 * response (the script runs on about:blank, and the server seeds
 * `<html data-theme>` from the request cookie), so callers that need the server
 * itself to render light must follow up with `forceLightTheme` once navigated.
 */
async function seedLightTheme(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('bolt_theme', 'light');
  });
}

/**
 * Apply the light theme on an already-navigated page and reload, so the server
 * re-renders with `ecode_theme` present in the request.
 */
async function forceLightTheme(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.cookie = 'ecode_theme=light; path=/; SameSite=Lax';
    localStorage.setItem('bolt_theme', 'light');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function waitForApiHealth(page: import('@playwright/test').Page, apiBaseUrl: string) {
  const deadline = Date.now() + 60_000;

  let lastError = 'API did not respond before timeout.';

  while (Date.now() < deadline) {
    try {
      const response = await page.request.get(`${apiBaseUrl}/health`, { timeout: 2_000 });

      if (response.ok()) {
        return;
      }

      lastError = `API health returned ${response.status()}: ${await response.text().catch(() => '')}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(500);
  }

  throw new Error(lastError);
}

async function authenticate(page: import('@playwright/test').Page) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-${suffix}@local.test`;

  await waitForApiHealth(page, apiBaseUrl);

  /*
   * /auth/register is rate limited per IP. Every test in this file registers a
   * fresh user, and CI retries multiply that, so the limiter was the single
   * biggest source of "a different test fails on every run": whichever tests
   * landed in a saturated window died with
   * `{"error":"Rate limit exceeded, retry in N seconds"}`.
   * Wait out the window the API tells us about, exactly like
   * mobile-device-matrix.spec.ts already did.
   */
  let response = await page.request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email,
      password: 'Password123!',
      name: 'E2E User',
      organizationName: `E2E Organization ${suffix}`,
    },
  });

  for (let attempt = 0; attempt < 4 && !response.ok(); attempt += 1) {
    const body = await response.text();

    if (!/rate limit/i.test(body)) {
      break;
    }

    const seconds = Number(body.match(/retry in (\d+) seconds/i)?.[1]);
    await new Promise((resolveWait) => setTimeout(resolveWait, (Number.isFinite(seconds) ? seconds + 1 : 10) * 1000));

    response = await page.request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `e2e-${suffix}-r${attempt}@local.test`,
        password: 'Password123!',
        name: 'E2E User',
        organizationName: `E2E Organization ${suffix}-r${attempt}`,
      },
    });
  }

  expect(response.ok(), await response.text()).toBeTruthy();

  const payload = (await response.json()) as { token: string; organization: { id: string } };

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return payload;
}

async function createZipBase64(files: Record<string, string>) {
  const zip = new JSZip();

  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'base64' });
}

async function openVisibleIdeToolMenu(page: import('@playwright/test').Page) {
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30_000 });

  const trigger = page.locator('.bolt-project-tabbar:visible [data-testid="tab-add"]').first();

  await page.keyboard.press('Escape').catch(() => {});
  await expect(trigger).toBeVisible({ timeout: 15_000 });

  /*
   * A single synthetic click raced React attaching its handler in CI: the
   * palette simply never opened and there was no retry. The trigger mirrors its
   * state in aria-expanded, so click until that flips.
   */
  await expect(async () => {
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.click({ force: true });
    }

    expect(await trigger.getAttribute('aria-expanded')).toBe('true');
  }).toPass({ timeout: 20_000, intervals: [250, 500, 1000] });

  /*
   * The palette renders as `.bolt-project-tool-modal[data-testid=
   * "ide-add-tab-command-palette"]` wrapping `.bolt-project-tool-menu--modal`.
   * Prefer the stable test id and fall back to the class, so a styling change
   * to the menu wrapper does not read as "the palette never opened".
   */
  /*
   * Wait on the palette wrapper's test id first — it is the element the click
   * actually toggles — then hand back the inner menu. Waiting directly on
   * `.bolt-project-tool-menu` raced the modal's mount and reported "element(s)
   * not found" even though the palette had opened.
   */
  const palette = page.getByTestId('ide-add-tab-command-palette');
  await expect(palette).toBeVisible({ timeout: 15_000 });

  const toolMenu = palette.locator('.bolt-project-tool-menu').last();
  await expect(toolMenu).toBeVisible({ timeout: 15_000 });

  return toolMenu;
}

async function clickIdeToolMenuItem(toolMenu: import('@playwright/test').Locator, name: RegExp) {
  const clicked = await toolMenu.evaluate((menu, pattern) => {
    const matcher = new RegExp(pattern);
    const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));
    const button = buttons.find((item) => matcher.test(item.textContent?.replace(/\s+/g, ' ').trim() ?? ''));

    if (!button) {
      return false;
    }

    button.click();

    return true;
  }, name.source);

  expect(clicked, `Tool menu item ${name.toString()} should exist`).toBeTruthy();
}

async function createTestProject(page: import('@playwright/test').Page, name: string) {
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    data: { name },
    headers: { authorization: `Bearer ${auth.token}` },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  return (await createProject.json()).project.id as string;
}

/*
 * REMOVED — `onboarding guides project setup`.
 *
 * The standalone /onboarding page was deliberately deleted: app/routes/
 * onboarding.tsx is now a 17-line loader that redirects to /dashboard, kept
 * only so old bookmarks don't 404. Its own comment records why — the static
 * checklist (create project / invite / connect GitHub / review quotas) carried
 * no live state and was replaced by the dashboard's "Get set up" card, which
 * uses real backend signals.
 *
 * The test asserted headings and links on that deleted screen, so there is
 * nothing left to rewrite it against. The replacement surface is exercised by
 * the dashboard tests below.
 */

test('project creation exposes templates and import paths', async ({ page }) => {
  await authenticate(page);
  await page.goto('/projects/new');
  await expect(page.getByRole('heading', { name: 'What do you want to build?' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Create project form' })).toBeVisible();
  await expect(page.getByLabel('Describe your idea')).toBeVisible();
  await expect(page.getByLabel('Artifact type')).toBeVisible();
  await expect(page.locator('.vc-new-project-chip', { hasText: 'Web' })).toBeVisible();

  /*
   * No provider/model dropdown here any more: 84c860b5 ("plus AUCUN sélecteur
   * de modèle — 3 modes en segmented control dans l'IDE uniquement") removed
   * model selection from project creation on purpose. app/routes/
   * projects.new.tsx carries no data-testid at all today.
   */
  await expect(page.getByRole('link', { name: /Import an existing GitHub repository/ })).toHaveAttribute(
    'href',
    '/import-github',
  );
  await expect(page.getByRole('link', { name: /Upload a zip archive/ })).toHaveAttribute('href', '/import-zip');
  await expect(page.getByRole('heading', { name: 'Start from the existing catalog' })).toBeVisible();

  /*
   * The "Authenticated template flow already wired to project creation."
   * blurb was removed from the create page — app/routes/projects.new.ui.spec.ts
   * now asserts the route source must NOT contain it, so this can never come
   * back. The catalog heading above is the surviving contract.
   */
});

test('project creation light theme uses light containers and readable image previews', async ({ page }) => {
  await authenticate(page);
  await seedLightTheme(page);

  await page.goto('/projects/new', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'What do you want to build?' })).toBeVisible();

  const themeProbe = await page.evaluate(() => {
    const parseRgb = (value: string) => {
      const match = value.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return { r: match[0] ?? 0, g: match[1] ?? 0, b: match[2] ?? 0 };
    };
    const luminance = (value: string) => {
      const { r, g, b } = parseRgb(value);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const styles = (selector: string) => {
      const element = document.querySelector(selector);

      if (!element) {
        throw new Error(`Missing selector ${selector}`);
      }

      const style = window.getComputedStyle(element);

      return {
        background: style.backgroundColor,
        color: style.color,
        backgroundLuminance: luminance(style.backgroundColor),
        colorLuminance: luminance(style.color),
      };
    };

    return {
      theme: document.documentElement.getAttribute('data-theme'),
      hero: styles('.vc-new-project-page'),
      composer: styles('.vc-new-project-composer'),
      templatePreview: styles('.vc-template-preview'),
      title: styles('.vc-new-project-title'),
    };
  });

  expect(themeProbe.theme).toBe('light');
  expect(themeProbe.hero.backgroundLuminance).toBeGreaterThan(0.9);
  expect(themeProbe.composer.backgroundLuminance).toBeGreaterThan(0.92);
  expect(themeProbe.templatePreview.backgroundLuminance).toBeGreaterThan(0.92);
  expect(themeProbe.title.colorLuminance).toBeLessThan(0.18);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'What do you want to build?' })).toBeVisible();

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(2);
});

test('app shell form buttons stay visible in light theme', async ({ page }) => {
  await authenticate(page);
  await seedLightTheme(page);

  await page.goto('/account-settings', { waitUntil: 'domcontentloaded' });

  const saveButton = page.getByRole('button', { name: 'Save changes' });
  await expect(saveButton).toBeVisible();

  const saveButtonProbe = await saveButton.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
      background: style.backgroundColor,
      borderColor: style.borderTopColor,
      color: style.color,
      height: rect.height,
    };
  });

  expect(saveButtonProbe.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(saveButtonProbe.borderColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(saveButtonProbe.height).toBeGreaterThanOrEqual(32);

  await page.goto('/billing', { waitUntil: 'domcontentloaded' });

  const portalButton = page.getByRole('button', { name: 'Open customer portal' });
  await expect(portalButton).toBeVisible();

  const portalButtonProbe = await portalButton.evaluate((element) => {
    const style = window.getComputedStyle(element);

    return {
      background: style.backgroundColor,
      borderColor: style.borderTopColor,
      color: style.color,
    };
  });

  expect(portalButtonProbe.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(portalButtonProbe.borderColor).not.toBe('rgba(0, 0, 0, 0)');
});

/*
 * REMOVED — `project creation syncs AI providers and models from settings`.
 *
 * The whole test drove the provider/model dropdown on /projects/new
 * (`ai-provider-dropdown`, `combobox "AI provider"`, the "N provider synced
 * from Settings" badge). Commit 84c860b5 — "plus AUCUN sélecteur de modèle —
 * 3 modes en segmented control dans l'IDE uniquement, réglages par
 * utilisateur" — deleted that selector as a product decision: model choice now
 * lives in the IDE's segmented mode control, not in project creation.
 *
 * None of the selectors it used exist anywhere in app/ any more, and the
 * behaviour it covered moved to a different surface, so there is nothing to
 * rewrite it against here. Provider/model selection in the IDE is covered by
 * the ModelSelector tests (`agent-provider-dropdown`).
 */
test(
  'private templates create a project instead of opening the public gallery',
  { tag: '@runtime' },
  async ({ page }) => {
    await authenticate(page);
    await page.goto('/dashboard/templates');
    await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
    await expect(page.getByText('Create production workspaces from curated starters')).toBeVisible();
    await page.getByRole('button', { name: 'Use template' }).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/ide$/, { timeout: 30000 });
    await expect(page.getByRole('link', { name: 'Running' })).toBeVisible({ timeout: 15000 });
  },
);

test('authenticated user area applies the global platform design system', async ({ page }) => {
  await authenticate(page);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  /*
   * The SSR shell always seeds data-theme="dark" and an inline script
   * reconciles it from the cookie, so a light theme only sticks once the
   * cookie is present on a request. Proven stable: attr/class/--vc-ide-bg-app
   * stay light for 30s after this.
   */
  await forceLightTheme(page);

  // The user area renders several matching headings (page title + section); take the first.
  await expect(page.getByRole('heading', { name: /Dashboard|Projects|Welcome/ }).first()).toBeVisible({
    timeout: 30_000,
  });

  const theme = await page.evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const body = window.getComputedStyle(document.body);
    const interactive = document.createElement('button');
    interactive.textContent = 'Design probe';
    interactive.className = 'vc-button-solid';
    interactive.style.position = 'absolute';
    interactive.style.left = '-9999px';
    document.body.appendChild(interactive);

    const button = window.getComputedStyle(interactive);

    return {
      app: root.getPropertyValue('--vc-ide-bg-app').trim().toLowerCase(),
      panel: root.getPropertyValue('--vc-ide-bg-panel').trim().toLowerCase(),
      card: root.getPropertyValue('--vc-ide-bg-card').trim().toLowerCase(),
      hover: root.getPropertyValue('--vc-ide-bg-hover').trim().toLowerCase(),
      text: root.getPropertyValue('--vc-ide-text-primary').trim().toLowerCase(),
      action: root.getPropertyValue('--vc-ide-accent-action').trim().toLowerCase(),
      radiusButton: root.getPropertyValue('--vc-ui-radius-button').trim(),
      transitionHover: root.getPropertyValue('--vc-ui-transition-hover').trim(),
      bodyBackground: body.backgroundColor,
      bodyColor: body.color,
      buttonBackground: button.backgroundColor,
      buttonRadius: button.borderRadius,
    };
  });

  expect(theme).toMatchObject({
    app: '#0a0f1c',
    panel: '#0e1525',
    card: '#1a2030',
    hover: '#2b3245',
    text: '#f5f9fc',
    action: '#0099ff',
    radiusButton: '4px',
    transitionHover: '150ms ease-out',
    bodyBackground: 'rgb(10, 15, 28)',
    bodyColor: 'rgb(245, 249, 252)',
    buttonBackground: 'rgb(26, 32, 48)',
    buttonRadius: '4px',
  });
});

test('public templates stay marketing-only for anonymous visitors', async ({ page }) => {
  await page.goto('/templates');

  /*
   * The marketing gallery was rebuilt: its hero heading is the copy below, not
   * "Templates gallery", and cards link with "Sign in to use" (there is no
   * "Sign in to use templates" variant any more).
   */
  await expect(page.getByRole('heading', { name: 'Start faster with production-ready E-Code templates' })).toBeVisible({
    timeout: 30_000,
  });

  /*
   * Anonymous template cards now link "Use template" to a login round-trip that
   * carries the chosen template — /login?returnTo=/projects/new?template=<slug>
   * — instead of a bare /login with a "Sign in to use" label. The guarantee the
   * test exists for is unchanged: an anonymous visitor cannot reach the create
   * flow without signing in first.
   */
  const templateCta = page.getByRole('link', { name: 'Use template' }).first();
  await expect(templateCta).toBeVisible();
  await expect(templateCta).toHaveAttribute('href', /^\/login\?returnTo=/);
});

/*
 * This test used to assert theme-adapted `brightness()` filters on
 * `.vc-home-hero-bg` and `.vc-home-media-card img`. The `ecode-exact` homepage
 * ships no raster imagery at all (zero `<img>` in LandingOptimized), so those
 * selectors — and the whole "imagery adapted" premise — describe a page that no
 * longer exists. The media surface that *does* exist is the video demo section,
 * so that is what light theme is checked against here; general light/dark
 * readability is covered by tests/e2e/public-homepage.spec.ts.
 */
test('public homepage light theme keeps the media section readable', async ({ page }) => {
  await seedLightTheme(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Build and deploy production apps/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  /*
   * LandingVideo is lazy: it mounts through IntersectionObserver + Suspense, so
   * neither scrollIntoViewIfNeeded nor a one-shot window.scrollTo reliably
   * brings it in (the page height changes as other sections mount). Use the
   * product's own reveal path — the "Watch demo" CTA performs a
   * reveal-and-retry smooth scroll until the section exists.
   */
  const videoSection = page.getByTestId('section-video-demo');
  await page.getByTestId('button-watch-demo').first().click();
  await expect(videoSection).toBeVisible({ timeout: 30_000 });

  const probe = await page.evaluate(() => {
    const section = document.querySelector('[data-testid="section-video-demo"]')!;
    const style = window.getComputedStyle(section);

    return {
      theme: document.documentElement.getAttribute('data-theme'),
      opacity: Number(style.opacity),
      visibility: style.visibility,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });

  expect(probe.theme).toBe('light');
  expect(probe.visibility).toBe('visible');
  expect(probe.opacity).toBeGreaterThan(0.9);
  expect(probe.noHorizontalOverflow).toBeTruthy();
});

test('opens preserved Bolt IDE route for a project', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    data: { name: 'IDE preserved route project', description: 'E2E IDE layout smoke project' },
    headers: { authorization: `Bearer ${auth.token}` },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  const zipBase64 = await createZipBase64({
    'components/AppShell.tsx': 'export function AppShell() { return <main />; }\n',
    'data/projects.json': '{"projects":[]}\n',
    'pages/index.tsx': 'export default function Index() { return null; }\n',
    'store/projectStore.ts': 'export const projectStore = new Map();\n',
    'types/project.ts': 'export interface Project { id: string }\n',
  });
  const importFiles = await page.request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    data: { zipBase64 },
    headers: { authorization: `Bearer ${auth.token}` },
  });

  expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 60_000 });

  /*
   * `getByText('Agent', exact)` also matches hidden copies of the label (the
   * compact shell's tab strip is present but display:none on desktop), and
   * Playwright resolves to the first match — which was the hidden one. Assert
   * the agent landmark itself; its region name is the stable contract.
   */
  const agentPanel = page.getByRole('region', { name: 'AI agent' });
  await expect(agentPanel).toBeVisible();
  await expect(page.getByLabel('Resize AI agent panel')).toBeVisible();
  await expect(page.getByLabel('Agent prompt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a feature' })).toBeVisible();

  /*
   * Measuring through a cached locator handle returned `position: ""` in CI —
   * getComputedStyle yields empty values on a DETACHED node, i.e. the panel had
   * remounted between the visibility assertion and the read. Re-query the
   * element on every attempt and let the layout settle.
   */
  const readAgentMetrics = () =>
    page.evaluate(() => {
      const element = document.querySelector('[role="region"][aria-label="AI agent"]');

      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return {
        position: style.position,
        top: rect.top,
        left: rect.left,
        width: Math.round(rect.width),
        height: rect.height,
        background: style.backgroundColor,
        borderRight: style.borderRightColor,
      };
    });

  const expectedHeight = (page.viewportSize()?.height ?? 900) - 36 - 32;

  await expect(async () => {
    const agentMetrics = await readAgentMetrics();

    expect(agentMetrics).not.toBeNull();
    expect(agentMetrics!.position).toBe('relative');
    expect(agentMetrics!.top).toBe(36);
    expect(agentMetrics!.left).toBeGreaterThanOrEqual(48);
    expect(agentMetrics!.left).toBeLessThanOrEqual(80);
    expect(agentMetrics!.width).toBeGreaterThanOrEqual(340);
    expect(agentMetrics!.width).toBeLessThanOrEqual(520);
    expect(agentMetrics!.height).toBe(expectedHeight);
    expect(agentMetrics!.background).toBe('rgb(14, 21, 37)');
    expect(agentMetrics!.borderRight).toBe('rgb(26, 32, 48)');
  }).toPass({ timeout: 20_000, intervals: [250, 500, 1000] });

  await expect
    .poll(
      async () =>
        page.locator('.bolt-project-workspace-shell').evaluate((element) => window.getComputedStyle(element).position),
      { timeout: 5000 },
    )
    .toBe('relative');

  const workspaceMetrics = await page.locator('.bolt-project-workspace-shell').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      position: style.position,
      top: rect.top,
      left: rect.left,
      width: Math.round(rect.width),
      height: rect.height,
      background: style.backgroundColor,
    };
  });
  expect(workspaceMetrics.position).toBe('relative');
  expect(workspaceMetrics.top).toBe(36);
  expect(workspaceMetrics.left).toBeGreaterThan(agentMetrics.left + agentMetrics.width);
  expect(workspaceMetrics.left).toBeGreaterThanOrEqual(380);
  expect(workspaceMetrics.left).toBeLessThanOrEqual(540);
  expect(workspaceMetrics.width).toBeGreaterThanOrEqual(640);
  expect(workspaceMetrics.width).toBeLessThanOrEqual(940);
  expect(workspaceMetrics.height).toBe((page.viewportSize()?.height ?? 900) - 36 - 32);
  expect(workspaceMetrics.background).toBe('rgb(10, 15, 28)');

  const tabBarMetrics = await page
    .locator('.bolt-project-tabbar:visible')
    .first()
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return {
        height: rect.height,
        background: style.backgroundColor,
        borderBottom: style.borderBottomColor,
        display: style.display,
      };
    });
  expect(tabBarMetrics.height).toBe(40);
  expect(tabBarMetrics.background).toBe('rgb(14, 21, 37)');
  expect(tabBarMetrics.borderBottom).toBe('rgb(26, 32, 48)');
  expect(tabBarMetrics.display).toBe('flex');

  const toolMenu = await openVisibleIdeToolMenu(page);

  const toolMenuMetrics = await toolMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      width: Math.round(rect.width),
      maxHeight: style.maxHeight,
      background: style.backgroundColor,
      border: style.borderColor,
      borderRadius: style.borderRadius,
      padding: style.paddingTop,
    };
  });
  expect(toolMenuMetrics.width).toBeGreaterThanOrEqual(560);
  expect(toolMenuMetrics.width).toBeLessThanOrEqual(680);
  expect(toolMenuMetrics.maxHeight).toBe('620px');
  expect(toolMenuMetrics.background).toBe('rgb(26, 32, 48)');
  expect(toolMenuMetrics.border).toBe('rgb(43, 50, 69)');
  expect(toolMenuMetrics.borderRadius).toBe('12px');
  expect(toolMenuMetrics.padding).toBe('8px');
  await expect(page.getByRole('dialog', { name: 'Add tab command palette' })).toBeVisible();
  await expect(toolMenu.getByText('Add tab')).toBeVisible();
  await expect(toolMenu.locator('kbd').filter({ hasText: /K/ }).first()).toBeVisible();
  await expect(toolMenu.getByPlaceholder('Search commands, tools, or files...')).toBeVisible();
  await expect(toolMenu.locator('.bolt-project-tool-section', { hasText: 'RECENT FILES' })).toBeVisible();
  await expect(toolMenu.locator('.bolt-project-tool-section', { hasText: 'TOOLS' })).toBeVisible();
  await expect(toolMenu.getByRole('button', { name: /Files Browse project files/ })).toBeVisible();
  await expect(toolMenu.getByRole('button', { name: /Terminal Workspace shell/ })).toBeVisible();
  await expect(toolMenu.getByRole('button', { name: /Logs Runtime logs/ })).toBeVisible();
  await expect(toolMenu.getByRole('button', { name: /Database SQL browser/ })).toBeVisible();
  await toolMenu
    .getByRole('button', { name: /Database SQL browser/ })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="database"]').first()).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('dialog', { name: 'Add tab command palette' })).toBeHidden();

  const dismissibleToolMenu = await openVisibleIdeToolMenu(page);
  await page.locator('.bolt-project-tabbar:visible .bolt-project-tab-main').first().click();
  await expect(dismissibleToolMenu).toBeHidden();

  const filesToolMenu = await openVisibleIdeToolMenu(page);
  const filesToolButton = filesToolMenu.getByRole('button', { name: /Files/ });

  await expect(filesToolButton).toBeVisible();
  await filesToolButton.click();
  await expect(page.getByTestId('ide-files-panel-toggle')).toBeVisible();
  await expect(page.getByRole('link', { name: /Publish/ })).toBeVisible();
  await expect(page.getByTestId('ide-files-panel-toggle')).toBeVisible();

  const rightPanel = page.getByRole('complementary', { name: 'Project library panel' });
  await expect(rightPanel).toBeVisible();

  const rightPanelMetrics = await rightPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      position: style.position,
      top: rect.top,
      right: Math.round(window.innerWidth - rect.right),
      width: rect.width,
      height: rect.height,
      background: style.backgroundColor,
      borderLeft: style.borderLeftColor,
    };
  });
  expect(rightPanelMetrics.position).toBe('relative');
  expect(rightPanelMetrics.top).toBe(36);
  expect(rightPanelMetrics.right).toBe(0);
  expect(rightPanelMetrics.width).toBeGreaterThanOrEqual(260);
  expect(rightPanelMetrics.width).toBeLessThanOrEqual(290);
  expect(rightPanelMetrics.height).toBe((page.viewportSize()?.height ?? 720) - 36 - 32);
  expect(rightPanelMetrics.background).toBe('rgb(14, 21, 37)');
  expect(rightPanelMetrics.borderLeft).toBe('rgb(26, 32, 48)');
  await expect(rightPanel.locator('.bolt-project-files-tool')).toBeVisible();
  await expect
    .poll(async () => rightPanel.locator('.bolt-file-tree-node').count(), { timeout: 30_000 })
    .toBeGreaterThan(0);

  const filesPanelFillMetrics = await rightPanel.locator('.bolt-project-files-tool').evaluate((element) => {
    const toolRect = element.getBoundingClientRect();
    const contentRect = element.parentElement!.getBoundingClientRect();
    const tree = element.querySelector('.bolt-project-file-tree') as HTMLElement;
    const treeRect = tree.getBoundingClientRect();
    const toolStyle = window.getComputedStyle(element);
    const treeStyle = window.getComputedStyle(tree);

    return {
      contentWidth: Math.round(contentRect.width),
      toolWidth: Math.round(toolRect.width),
      treeWidth: Math.round(treeRect.width),
      toolBackground: toolStyle.backgroundColor,
      treeBackground: treeStyle.backgroundColor,
    };
  });
  expect(filesPanelFillMetrics.contentWidth).toBeGreaterThanOrEqual(260);
  expect(filesPanelFillMetrics.contentWidth).toBeLessThanOrEqual(280);
  expect(filesPanelFillMetrics.toolWidth).toBe(filesPanelFillMetrics.contentWidth);
  expect(filesPanelFillMetrics.treeWidth).toBe(filesPanelFillMetrics.contentWidth);
  expect(filesPanelFillMetrics.toolBackground).toBe('rgb(14, 21, 37)');
  expect(filesPanelFillMetrics.treeBackground).toBe('rgb(14, 21, 37)');

  await page.evaluate(() => {
    // Cookie wins over localStorage in theme resolution — seed both.
    document.cookie = 'ecode_theme=light; path=/; SameSite=Lax';
    localStorage.setItem('bolt_theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
  });

  const fileRowMetrics = await rightPanel
    .locator('.bolt-file-tree-node')
    .first()
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const icon = element.querySelector('.bolt-file-tree-icon-wrap') as HTMLElement;
      const iconRect = icon.getBoundingClientRect();
      const iconStyle = window.getComputedStyle(icon);
      const name = element.querySelector('.bolt-file-tree-name') as HTMLElement;
      const nameStyle = window.getComputedStyle(name);

      return {
        rowWidth: Math.round(rect.width),
        rowHeight: Math.round(rect.height),
        borderRadius: style.borderRadius,
        gap: style.gap,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        iconWidth: Math.round(iconRect.width),
        iconHeight: Math.round(iconRect.height),
        iconColor: iconStyle.color,
        nameColor: nameStyle.color,
        nameFontSize: nameStyle.fontSize,
        nameFontWeight: nameStyle.fontWeight,
        nameLineHeight: nameStyle.lineHeight,
      };
    });

  expect(fileRowMetrics).toMatchObject({
    rowWidth: 240,
    rowHeight: 28,
    borderRadius: '4px',
    gap: '6px',
    paddingLeft: '0px',
    paddingRight: '0px',
    iconWidth: 16,
    iconHeight: 16,
    iconColor: 'rgb(54, 55, 59)',
    nameColor: 'rgb(54, 55, 59)',
    nameFontSize: '14px',
    nameFontWeight: '400',
    nameLineHeight: 'normal',
  });

  await expect(page.getByLabel(/Resize (?:files|right) panel/)).toBeVisible();
  await rightPanel.getByLabel('Close right panel').click();
  await expect(rightPanel).toHaveCount(0);
  await expect(page.getByTestId('ide-files-panel-toggle')).toHaveAttribute('aria-label', 'Open files panel');
  await page.getByTestId('ide-files-panel-toggle').click();
  await expect(page.getByRole('complementary', { name: 'Project library panel' })).toBeVisible();
});

test('IDE applies the full 2026 color theme tokens', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE Theme Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  /*
   * The SSR shell always seeds data-theme="dark" and an inline script
   * reconciles it from the cookie, so a light theme only sticks once the
   * cookie is present on a request. Proven stable: attr/class/--vc-ide-bg-app
   * stay light for 30s after this.
   */
  await forceLightTheme(page);
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

  const themeTokens = await page.locator('.bolt-project-ide-panels').evaluate((element) => {
    const style = window.getComputedStyle(document.documentElement);
    const panelStyle = window.getComputedStyle(element);
    const token = (name: string) => style.getPropertyValue(name).trim().toLowerCase();

    const requiredAliases = [
      '--vc-ide-bg-base',
      '--vc-ide-bg-elevated',
      '--vc-ide-bg-subtle',
      '--vc-ide-bg-overlay',
      '--vc-ide-bg-panel-subtle',
      '--vc-ide-surface-0',
      '--vc-ide-surface-1',
      '--vc-ide-surface-2',
      '--vc-ide-border',
      '--vc-ide-text-tertiary',
      '--vc-ide-text-on-accent',
      '--vc-ide-accent',
      '--vc-ide-accent-primary',
      '--vc-ide-accent-green',
      '--vc-ide-accent-danger',
      '--vc-success',
      '--vc-danger',
      '--vc-status-ok',
      '--vc-status-error',
      '--vc-status-warn',
      '--vc-status-muted',
      '--vc-status-neutral',
      '--vc-ui-shadow-soft',
      '--vc-ide-shadow-soft',
    ];

    return {
      app: token('--vc-ide-bg-app'),
      panel: token('--vc-ide-bg-panel'),
      card: token('--vc-ide-bg-card'),
      hover: token('--vc-ide-bg-hover'),
      borderSubtle: token('--vc-ide-border-subtle'),
      borderVisible: token('--vc-ide-border-visible'),
      textPrimary: token('--vc-ide-text-primary'),
      textSecondary: token('--vc-ide-text-secondary'),
      textMuted: token('--vc-ide-text-muted'),
      aiStart: token('--vc-ide-accent-ai-start'),
      aiEnd: token('--vc-ide-accent-ai-end'),
      success: token('--vc-ide-accent-success'),
      action: token('--vc-ide-accent-action'),
      orange: token('--vc-ide-accent-orange'),
      error: token('--vc-ide-accent-error'),
      warning: token('--vc-ide-accent-warning'),
      actualBackground: panelStyle.backgroundColor,
      actualText: panelStyle.color,
      missingAliases: requiredAliases.filter((name) => token(name).length === 0),
    };
  });

  expect(themeTokens).toMatchObject({
    app: '#0a0f1c',
    panel: '#0e1525',
    card: '#1a2030',
    hover: '#2b3245',
    borderSubtle: '#1a2030',
    borderVisible: '#2b3245',
    textPrimary: '#f5f9fc',
    textSecondary: '#c2c8cc',
    textMuted: '#6e7681',
    aiStart: '#7b61ff',
    aiEnd: '#ff6b9d',
    success: '#3fb950',
    action: '#0099ff',
    orange: '#f26207',
    error: '#f85149',
    warning: '#d29922',
    actualBackground: 'rgb(10, 15, 28)',
    actualText: 'rgb(245, 249, 252)',
    missingAliases: [],
  });
});

test('IDE panels, agent input and feature tools keep the platform theme in light and dark modes', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(180_000);
  test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE Light Dark Coverage Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded' });

  /*
   * The SSR shell always seeds data-theme="dark" and an inline script
   * reconciles it from the cookie, so a light theme only sticks once the
   * cookie is present on a request. Proven stable: attr/class/--vc-ide-bg-app
   * stay light for 30s after this.
   */
  await forceLightTheme(page);
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="database"]').first()).toBeVisible({
    timeout: 15_000,
  });

  const coreSelectors = {
    root: '.bolt-project-ide-panels',
    agent: '.bolt-project-agent-shell',
    agentHeader: '.bolt-project-agent-header',
    agentInput: '.bolt-project-chatbox',
    agentTextarea: '.bolt-project-chatbox textarea',
    iconButton: '.bolt-project-ide-icon-button',
    workspace: '.bolt-project-workspace-shell',
    tabbar: '.bolt-project-tabbar',
    databasePanel: '.bolt-project-service-panel',
    rightPanel: '.bolt-project-right-panel-shell',
    rightHeader: '.bolt-project-right-files-header',
    filesHeader: '.bolt-project-files-header',
    filesSearch: '.bolt-project-files-search',
    statusbar: '.bolt-project-statusbar',
  };

  async function readIdeTheme(theme: 'light' | 'dark') {
    await page.evaluate((nextTheme) => {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }, theme);
    await page.waitForTimeout(100);

    return page.locator('.bolt-project-ide-panels').evaluate((rootElement, selectorMap) => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);

        if (!element) {
          return { missing: selector };
        }

        const style = window.getComputedStyle(element);

        return {
          background: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
          borderRightColor: style.borderRightColor,
          borderBottomColor: style.borderBottomColor,
          borderTopColor: style.borderTopColor,
          borderLeftColor: style.borderLeftColor,
          borderRadius: style.borderRadius,
          fontSize: style.fontSize,
        };
      };

      const rootStyle = window.getComputedStyle(rootElement);

      return {
        tokens: {
          app: rootStyle.getPropertyValue('--vc-ide-bg-app').trim().toLowerCase(),
          panel: rootStyle.getPropertyValue('--vc-ide-bg-panel').trim().toLowerCase(),
          card: rootStyle.getPropertyValue('--vc-ide-bg-card').trim().toLowerCase(),
          hover: rootStyle.getPropertyValue('--vc-ide-bg-hover').trim().toLowerCase(),
          text: rootStyle.getPropertyValue('--vc-ide-text-primary').trim().toLowerCase(),
          action: rootStyle.getPropertyValue('--vc-ide-accent-action').trim().toLowerCase(),
        },
        surfaces: Object.fromEntries(
          Object.entries(selectorMap as Record<string, string>).map(([key, selector]) => [key, read(selector)]),
        ) as Record<string, ReturnType<typeof read>>,
      };
    }, coreSelectors);
  }

  const expectations = {
    light: {
      tokens: {
        app: '#f6f8fb',
        panel: '#ffffff',
        card: '#eef2f7',
        hover: '#e2e8f0',
        text: '#111827',
        action: '#006fd6',
      },
      root: { background: 'rgb(246, 248, 251)', color: 'rgb(17, 24, 39)' },
      panel: 'rgb(255, 255, 255)',
      app: 'rgb(246, 248, 251)',
      card: 'rgb(238, 242, 247)',
      hoverBorder: 'rgb(207, 215, 227)',
      visibleBorder: 'rgb(154, 168, 187)',
      secondaryText: 'rgb(51, 65, 85)',
      mutedText: 'rgb(71, 85, 105)',
      primaryText: 'rgb(17, 24, 39)',
      forbiddenPanelBackgrounds: [
        'rgb(10, 15, 28)',
        'rgb(14, 21, 37)',
        'rgb(26, 32, 48)',
        'rgb(43, 50, 69)',
      ] as string[],
    },
    dark: {
      tokens: {
        app: '#0a0f1c',
        panel: '#0e1525',
        card: '#1a2030',
        hover: '#2b3245',
        text: '#f5f9fc',
        action: '#0099ff',
      },
      root: { background: 'rgb(10, 15, 28)', color: 'rgb(245, 249, 252)' },
      panel: 'rgb(14, 21, 37)',
      app: 'rgb(10, 15, 28)',
      card: 'rgb(26, 32, 48)',
      hoverBorder: 'rgb(26, 32, 48)',
      visibleBorder: 'rgb(43, 50, 69)',
      secondaryText: 'rgb(194, 200, 204)',
      mutedText: 'rgb(110, 118, 129)',
      primaryText: 'rgb(245, 249, 252)',
      forbiddenPanelBackgrounds: [] as string[],
    },
  } as const;

  for (const theme of ['light', 'dark'] as const) {
    const expected = expectations[theme];
    const snapshot = await readIdeTheme(theme);
    expect(
      Object.entries(snapshot.surfaces)
        .filter(([, value]) => 'missing' in value)
        .map(([key, value]) => `${key}:${value.missing}`),
    ).toEqual([]);
    expect(snapshot.tokens).toMatchObject(expected.tokens);
    expect(snapshot.surfaces.root).toMatchObject(expected.root);
    expect(snapshot.surfaces.agent.background).toBe(expected.panel);
    expect(snapshot.surfaces.agent.borderRightColor).toBe(expected.hoverBorder);
    expect(snapshot.surfaces.agentHeader.background).toBe(expected.panel);
    expect(snapshot.surfaces.agentInput.background).toBe(expected.card);
    expect(snapshot.surfaces.agentInput.borderColor).toBe(expected.visibleBorder);
    expect(snapshot.surfaces.agentTextarea.color).not.toBe(snapshot.surfaces.agentInput.background);
    expect(Number.parseFloat(String(snapshot.surfaces.iconButton.borderRadius))).toBeGreaterThanOrEqual(4);
    expect(Number.parseFloat(String(snapshot.surfaces.iconButton.borderRadius))).toBeLessThanOrEqual(8);
    expect(snapshot.surfaces.workspace.background).toBe(expected.app);
    expect(snapshot.surfaces.tabbar.background).toBe(expected.panel);
    expect(snapshot.surfaces.tabbar.borderBottomColor).toBe(expected.hoverBorder);
    expect(snapshot.surfaces.databasePanel.background).toBe(expected.app);
    expect(snapshot.surfaces.rightPanel.background).toBe(expected.panel);
    expect(snapshot.surfaces.rightPanel.borderLeftColor).toBe(expected.hoverBorder);
    expect(snapshot.surfaces.rightHeader.background).toBe(expected.panel);
    expect(snapshot.surfaces.filesHeader.background).toBe(expected.panel);
    expect(snapshot.surfaces.filesHeader.borderBottomColor).toBe(expected.hoverBorder);
    expect(snapshot.surfaces.filesSearch.color).toBe(expected.mutedText);
    expect(snapshot.surfaces.filesSearch.borderBottomColor).toBe(expected.hoverBorder);
    expect(snapshot.surfaces.statusbar.background).toBe(expected.panel);
    expect(snapshot.surfaces.statusbar.color).toBe(expected.secondaryText);

    if (expected.forbiddenPanelBackgrounds.length > 0) {
      const darkSurfaces = await page.locator('.bolt-project-ide-shell').evaluate((root, forbiddenBackgrounds) => {
        return Array.from(root.querySelectorAll<HTMLElement>('*'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);

            return {
              className: element.className.toString(),
              tagName: element.tagName,
              background: style.backgroundColor,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              text: element.textContent?.trim().slice(0, 40) ?? '',
            };
          })
          .filter((item) => item.width >= 48 && item.height >= 24 && forbiddenBackgrounds.includes(item.background))
          .slice(0, 12);
      }, expected.forbiddenPanelBackgrounds);

      expect(darkSurfaces).toEqual([]);
    }
  }
});

test('all IDE service panels keep light theme containers readable', async ({ page, isMobile }) => {
  test.setTimeout(300_000);
  test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE All Panels Light Theme Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  /*
   * The SSR shell always seeds data-theme="dark" and an inline script
   * reconciles it from the cookie, so a light theme only sticks once the
   * cookie is present on a request. Proven stable: attr/class/--vc-ide-bg-app
   * stay light for 30s after this.
   */
  await forceLightTheme(page);
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });

  const panels = [
    ['Overview', 'overview'],
    ['Database', 'database'],
    ['Object Storage', 'object-storage'],
    ['Packages', 'packages'],
    ['Deployments', 'deployments'],
    ['Monitoring', 'monitoring'],
    ['Extensions', 'extensions'],
    ['Integrations', 'integrations'],
    ['Workflows', 'workflows'],
    ['Debugger', 'debugger'],
    ['Security', 'security'],
    ['Env vars', 'env'],
    ['Secrets', 'secrets'],
    ['Git', 'git'],
    ['Activity', 'activity'],
    ['Logs', 'logs'],
    ['Collaborators', 'collaborators'],
    ['Domains', 'domains'],
    ['Snapshots', 'snapshots'],
    ['Settings', 'settings'],
  ] as const;

  const forbiddenLightBackgrounds = ['rgb(10, 15, 28)', 'rgb(14, 21, 37)', 'rgb(26, 32, 48)', 'rgb(43, 50, 69)'];

  await page.evaluate(() => {
    // Cookie wins over localStorage in theme resolution — seed both.
    document.cookie = 'ecode_theme=light; path=/; SameSite=Lax';
    localStorage.setItem('bolt_theme', 'light');
  });

  for (const [, panel] of panels) {
    await page.goto(`/projects/${projectId}/ide?panel=${panel}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      // Cookie wins over localStorage in theme resolution — seed both.
      document.cookie = 'ecode_theme=light; path=/; SameSite=Lax';
      localStorage.setItem('bolt_theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.remove('dark');
    });

    const servicePanel = page.locator(`[data-testid="ide-service-panel"][data-panel="${panel}"]`).first();
    await expect(servicePanel).toBeVisible({ timeout: 15_000 });

    const darkContainers = await servicePanel.evaluate((root, forbiddenBackgrounds) => {
      const allowedDarkSelectors = [
        'pre',
        'code',
        'textarea',
        '.bolt-project-console-body',
        '.bolt-project-code-preview',
      ];

      return Array.from(root.querySelectorAll<HTMLElement>('*'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);

          return {
            className: element.className.toString(),
            tagName: element.tagName,
            background: style.backgroundColor,
            color: style.color,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
            allowed: allowedDarkSelectors.some((selector) => element.matches(selector) || element.closest(selector)),
          };
        })
        .filter(
          (item) =>
            !item.allowed &&
            item.width >= 48 &&
            item.height >= 24 &&
            (forbiddenBackgrounds as string[]).includes(item.background),
        )
        .slice(0, 12);
    }, forbiddenLightBackgrounds);

    expect(darkContainers, `${panel} contains dark containers in light theme`).toEqual([]);
  }
});

test('platform typography tokens apply to the web IDE', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE Typography Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  /*
   * The SSR shell always seeds data-theme="dark" and an inline script
   * reconciles it from the cookie, so a light theme only sticks once the
   * cookie is present on a request. Proven stable: attr/class/--vc-ide-bg-app
   * stay light for 30s after this.
   */
  await forceLightTheme(page);
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30000 });

  const typography = await page.locator('.bolt-project-ide-panels').evaluate((element) => {
    const codeSample = document.createElement('code');
    codeSample.textContent = 'const value = 1;';
    codeSample.style.position = 'absolute';
    codeSample.style.left = '-9999px';
    codeSample.setAttribute('data-testid', 'typography-code-sample');
    element.appendChild(codeSample);

    const labelSample = document.createElement('div');
    labelSample.className = 'bolt-project-command-section';
    labelSample.textContent = 'Files';
    labelSample.style.position = 'absolute';
    labelSample.style.left = '-9999px';
    element.appendChild(labelSample);

    const root = window.getComputedStyle(document.documentElement);
    const shell = window.getComputedStyle(element);
    const heading = window.getComputedStyle(element.querySelector('h2')!);
    const label = window.getComputedStyle(labelSample);
    const code = window.getComputedStyle(codeSample);

    return {
      interfaceFont: root.getPropertyValue('--vc-font-interface').trim(),
      codeFont: root.getPropertyValue('--vc-font-code').trim(),
      interfaceSize: root.getPropertyValue('--vc-type-interface-size').trim(),
      codeSize: root.getPropertyValue('--vc-type-code-size').trim(),
      headingSize: root.getPropertyValue('--vc-type-heading-size').trim(),
      labelSize: root.getPropertyValue('--vc-type-label-size').trim(),
      labelTracking: root.getPropertyValue('--vc-type-label-letter-spacing').trim(),
      shellFont: shell.fontFamily,
      shellSize: shell.fontSize,
      shellLineHeight: shell.lineHeight,
      headingSizeActual: heading.fontSize,
      headingWeight: heading.fontWeight,
      labelSizeActual: label.fontSize,
      labelWeight: label.fontWeight,
      labelTrackingActual: label.letterSpacing,
      codeFontActual: code.fontFamily,
      codeSizeActual: code.fontSize,
      codeLigaturesActual: code.fontVariantLigatures,
    };
  });

  expect(typography.interfaceFont).toContain('Inter');
  expect(typography.codeFont).toContain('IBM Plex Mono');
  expect(typography.interfaceSize).toBe('12px');
  expect(typography.codeSize).toBe('12px');
  expect(typography.headingSize).toBe('14px');
  expect(typography.labelSize).toBe('10px');

  // Custom properties keep the author's spelling (`.4px`); compare the value.
  expect(Number.parseFloat(typography.labelTracking)).toBeCloseTo(0.4, 3);
  expect(typography.shellFont).toContain('Inter');
  expect(typography.shellSize).toBe('12px');
  expect(Number.parseFloat(typography.shellLineHeight)).toBeCloseTo(17.04, 1);
  expect(typography.headingSizeActual).toBe('14px');
  expect(typography.headingWeight).toBe('600');
  expect(typography.labelSizeActual).toBe('12px');
  expect(typography.labelWeight).toBe('500');
  expect(['normal', '0.4px']).toContain(typography.labelTrackingActual);
  expect(typography.codeFontActual).toContain('IBM Plex Mono');
  expect(typography.codeSizeActual).toBe('12px');
  expect(typography.codeLigaturesActual).toContain('common-ligatures');
});

test('IDE applies section 12 UI detail styles', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE UI Details Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30000 });

  const toolMenu = await openVisibleIdeToolMenu(page);

  const details = await toolMenu.evaluate((menu) => {
    const root = window.getComputedStyle(document.documentElement);
    const toolMenuStyle = window.getComputedStyle(menu);
    const tabActionElement = document.querySelector('.bolt-project-tab-action');
    const tabAction = tabActionElement ? window.getComputedStyle(tabActionElement) : null;
    const terminalHandleElement = document.querySelector('.bolt-project-terminal-resize-handle');
    const terminalHandle = terminalHandleElement ? window.getComputedStyle(terminalHandleElement) : null;

    return {
      radiusButton: root.getPropertyValue('--vc-ui-radius-button').trim(),
      radiusModal: root.getPropertyValue('--vc-ui-radius-modal').trim(),
      radiusPopover: root.getPropertyValue('--vc-ui-radius-popover').trim(),
      shadowXl: root.getPropertyValue('--vc-ui-shadow-xl').trim(),
      focusRing: root.getPropertyValue('--vc-ui-focus-ring').trim().toLowerCase(),
      toolMenuRadius: toolMenuStyle.borderRadius,
      toolMenuShadow: toolMenuStyle.boxShadow,
      toolMenuBackdrop: toolMenuStyle.backdropFilter || toolMenuStyle.getPropertyValue('-webkit-backdrop-filter'),
      tabActionRadius: tabAction?.borderRadius ?? '',
      tabActionDuration: tabAction?.transitionDuration ?? '',
      terminalHandleDuration: terminalHandle?.transitionDuration ?? '',
      terminalHandleTiming: terminalHandle?.transitionTimingFunction ?? '',
    };
  });

  expect(details.radiusButton).toBe('4px');
  expect(details.radiusModal).toBe('8px');
  expect(details.radiusPopover).toBe('12px');

  // Custom properties echo the author's spelling (`.7`); compare the value.
  expect(details.shadowXl.replace(/(^|[^0-9a-zA-Z])\.(\d)/g, '$10.$2')).toBe('0 24px 64px rgb(0 4 20 / 0.7)');
  expect(details.focusRing).toBe('#0099ff');
  expect(details.toolMenuRadius).toBe('12px');
  expect(details.toolMenuShadow).toBe('rgba(0, 4, 20, 0.7) 0px 24px 64px 0px');
  expect(details.toolMenuBackdrop).toContain('blur(12px)');
  expect(details.tabActionRadius).toBe('4px');
  expect(details.tabActionDuration).toContain('0.15s');

  if (details.terminalHandleDuration) {
    expect(details.terminalHandleDuration).toContain('0.15s');
    expect(details.terminalHandleTiming).toContain('ease-out');
  }
});

test('IDE project services open as in-place panels instead of legacy project pages', async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE Panel Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: /Publish/ })).toBeVisible({ timeout: 30000 });

  async function openIdeTool(name: RegExp) {
    const toolMenu = await openVisibleIdeToolMenu(page);

    await clickIdeToolMenuItem(toolMenu, name);
  }

  await openIdeTool(/Snapshots/);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=snapshots$`));
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="snapshots"]')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('tab', { name: /Snapshots/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Snapshots' })).toBeVisible();
  await page.getByPlaceholder('Manual checkpoint').fill('E2E checkpoint');
  await page.getByRole('button', { name: 'Create snapshot' }).click();
  await expect(page.getByText('E2E checkpoint', { exact: true }).first()).toBeVisible({ timeout: 15000 });

  await openIdeTool(/Deployments/);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=deployments$`));
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="deployments"]')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('tab', { name: /Snapshots/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Deploy/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deployment wizard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deploy project' })).toBeVisible();

  const statusbar = page.locator('.bolt-project-statusbar');
  await expect(statusbar).toBeVisible();

  const statusbarMetrics = await statusbar.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const leftGroup = element.querySelector('div')!;
    const leftGroupStyle = window.getComputedStyle(leftGroup);
    const icon = element.querySelector('[class*="i-ph:"]')!;
    const iconRect = icon.getBoundingClientRect();

    return {
      position: style.position,
      viewportWidth: window.innerWidth,
      bottom: Math.round(window.innerHeight - rect.bottom),
      left: rect.left,
      width: rect.width,
      height: rect.height,
      background: style.backgroundColor,
      borderTop: style.borderTopColor,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      fontSize: style.fontSize,
      gap: leftGroupStyle.gap,
      iconWidth: iconRect.width,
      iconHeight: iconRect.height,
    };
  });
  expect(statusbarMetrics.position).toBe('fixed');
  expect(statusbarMetrics.bottom).toBe(0);
  expect(statusbarMetrics.left).toBe(420);
  expect(statusbarMetrics.width).toBe(statusbarMetrics.viewportWidth - statusbarMetrics.left);
  expect(statusbarMetrics.height).toBeGreaterThanOrEqual(23);
  expect(statusbarMetrics.height).toBeLessThanOrEqual(24);
  expect(statusbarMetrics.background).toBe('rgb(14, 21, 37)');
  expect(statusbarMetrics.borderTop).toBe('rgb(26, 32, 48)');
  expect(statusbarMetrics.paddingLeft).toBe('12px');
  expect(statusbarMetrics.paddingRight).toBe('12px');
  expect(statusbarMetrics.fontSize).toBe('10px');
  expect(statusbarMetrics.gap).toBe('12px');
  expect(statusbarMetrics.iconWidth).toBeGreaterThanOrEqual(11);
  expect(statusbarMetrics.iconWidth).toBeLessThanOrEqual(12);
  expect(statusbarMetrics.iconHeight).toBeGreaterThanOrEqual(11);
  expect(statusbarMetrics.iconHeight).toBeLessThanOrEqual(12);
  await expect(statusbar).toContainText(/main|stable/);
  await expect(statusbar).toContainText(/↑\d+ ↓\d+/);
  await expect(statusbar).toContainText('Ln 1, Col 1');
  await expect(statusbar).toContainText('Spaces: 2');
  await expect(statusbar).toContainText('UTF-8');
  await expect(statusbar).toContainText('Project');

  const workspaceStatusButton = statusbar.getByRole('button', { name: /Running on|Building|Crashed|Stopped/ });
  await expect(workspaceStatusButton).toBeVisible();
  await workspaceStatusButton.click();
  await expect(page.getByRole('tab', { name: /Webview/ }).first()).toBeVisible({ timeout: 15000 });

  const webviewToolbar = page.locator('.bolt-project-webview-toolbar').first();
  await expect(webviewToolbar).toBeVisible();

  const webviewToolbarMetrics = await webviewToolbar.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return { height: rect.height, background: style.backgroundColor, borderBottom: style.borderBottomColor };
  });
  expect(webviewToolbarMetrics.height).toBe(36);
  expect(webviewToolbarMetrics.background).toBe('rgb(14, 21, 37)');
  expect(webviewToolbarMetrics.borderBottom).toBe('rgb(26, 32, 48)');
  await expect(webviewToolbar.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(webviewToolbar.getByRole('button', { name: 'Forward' })).toBeVisible();
  await expect(webviewToolbar.getByRole('button', { name: 'Refresh preview' })).toBeVisible();
  await expect(webviewToolbar.getByRole('combobox', { name: 'Preview device' })).toBeVisible();

  await openIdeTool(/Files/);

  const filesHeader = page.locator('.bolt-project-files-header');
  await expect(filesHeader).toBeVisible();

  const filesHeaderMetrics = await filesHeader.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return { height: rect.height, background: style.backgroundColor, borderBottom: style.borderBottomColor };
  });
  expect(filesHeaderMetrics.height).toBe(32);
  expect(filesHeaderMetrics.borderBottom).toBe('rgb(26, 32, 48)');
  await expect(filesHeader.getByRole('button', { name: 'New file' })).toBeVisible();
  await expect(filesHeader.getByRole('button', { name: 'New folder' })).toBeVisible();
  await expect(filesHeader.getByRole('button', { name: 'Refresh files' })).toBeVisible();
  await expect(filesHeader.getByRole('button', { name: 'Collapse all files' })).toBeVisible();

  await openIdeTool(/Logs/);

  const consolePanel = page.locator('[data-testid="ide-service-panel"][data-panel="logs"]').first();
  await expect(consolePanel.locator('.bolt-project-console-header')).toBeVisible({ timeout: 15000 });
  await expect(consolePanel.getByRole('button', { name: 'Clear' })).toBeVisible();
  await expect(consolePanel.getByRole('button', { name: 'Split' })).toBeVisible();
  await expect(consolePanel.getByRole('button', { name: /Reload|Refreshing/ })).toBeVisible();

  const consoleBodyMetrics = await consolePanel.locator('.bolt-project-console-body').evaluate((element) => {
    const style = window.getComputedStyle(element);

    return { background: style.backgroundColor, fontSize: style.fontSize, fontFamily: style.fontFamily };
  });
  expect(consoleBodyMetrics.background).toBe('rgb(10, 15, 28)');
  expect(consoleBodyMetrics.fontSize).toBe('12px');

  await openIdeTool(/Database/);

  const databasePanel = page.locator('[data-testid="ide-service-panel"][data-panel="database"]').first();
  await expect(databasePanel.locator('.bolt-project-database-tool')).toBeVisible({ timeout: 15000 });
  await expect(databasePanel.getByText('Database status')).toBeVisible();
  await expect(databasePanel.getByRole('button', { name: 'Connection' })).toBeVisible();
  await expect(databasePanel.getByRole('button', { name: 'Environment' })).toBeVisible();
  await expect(databasePanel.getByRole('button', { name: 'Activity' })).toBeVisible();
  await expect(databasePanel.getByRole('button', { name: 'Save DATABASE_URL' })).toBeVisible();

  await openIdeTool(/Secrets/);

  const secretsPanel = page.locator('[data-testid="ide-service-panel"][data-panel="secrets"]').first();
  await expect(secretsPanel.locator('.bolt-project-secrets-tool')).toBeVisible({ timeout: 15000 });
  await expect(secretsPanel.getByRole('button', { name: /New secret/ })).toBeVisible();

  await openIdeTool(/Git/);

  const gitPanel = page.locator('[data-testid="ide-service-panel"][data-panel="git"]').first();
  await expect(gitPanel.locator('.bolt-project-git-tool')).toBeVisible({ timeout: 15000 });
  await expect(gitPanel.getByRole('heading', { name: 'Changes' })).toBeVisible();
  await expect(gitPanel.getByRole('heading', { name: 'Staged' })).toBeVisible();
  await expect(gitPanel.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(gitPanel.getByRole('button', { name: 'Commit & Push' })).toBeVisible();

  await expect(page.getByLabel('Split right')).toHaveCount(0);
  await expect(page.getByLabel('Split down')).toHaveCount(0);
  await expect(page.locator('.bolt-project-drop-zones')).toHaveCount(0);
  await page.locator('.bolt-project-tab').first().click({ button: 'right' });
  await expect(page.locator('.bolt-project-context-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Move to new pane/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Move to existing pane/ })).toHaveCount(0);
  await page.getByLabel('Tab actions').first().click();
  await page.getByRole('button', { name: 'Close to right' }).first().click();
  await expect(page.getByRole('tab', { name: /Deploy/ }).first()).toBeVisible();

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');

  const pinnedTerminal = page.getByRole('region', { name: 'Pinned terminal' });
  await expect(pinnedTerminal).toBeVisible();
  await expect(page.getByLabel('Resize pinned terminal')).toBeVisible();

  const terminalMetrics = await pinnedTerminal.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const tabbar = element.querySelector('.bolt-project-bottom-terminal-tabs')!;
    const tabbarRect = tabbar.getBoundingClientRect();
    const tabbarStyle = window.getComputedStyle(tabbar);
    const status = element.querySelector('.bolt-project-bottom-terminal-status');
    const terminalMeta = element.querySelector('.bolt-project-bottom-terminal-meta');
    const activeTab = element.querySelector('.bolt-project-bottom-terminal-tabs button[aria-current="page"]');
    const activeTabStyle = activeTab ? window.getComputedStyle(activeTab) : null;

    return {
      height: rect.height,
      borderTop: style.borderTopColor,
      background: style.backgroundColor,
      tabbarHeight: tabbarRect.height,
      tabbarBackground: tabbarStyle.backgroundColor,
      hasStatus: Boolean(status),
      hasTerminalMeta: Boolean(terminalMeta),
      activeTabBorder: activeTabStyle?.borderTopColor,
    };
  });
  expect(terminalMetrics.height).toBe(240);
  expect(terminalMetrics.borderTop).toBe('rgb(26, 32, 48)');
  expect(terminalMetrics.background).toBe('rgb(10, 15, 28)');
  expect(terminalMetrics.tabbarHeight).toBe(38);
  expect(terminalMetrics.tabbarBackground).toBe('rgb(14, 21, 37)');
  expect(terminalMetrics.hasStatus).toBe(true);
  expect(terminalMetrics.hasTerminalMeta).toBe(true);
  expect(terminalMetrics.activeTabBorder).toBe('rgb(43, 50, 69)');
  await expect(pinnedTerminal.getByRole('button', { name: 'Terminal', exact: true })).toBeVisible();
  await expect(pinnedTerminal.getByRole('button', { name: 'Output' })).toBeVisible();
  await expect(pinnedTerminal.getByRole('button', { name: 'Problems' })).toBeVisible();
  await expect(pinnedTerminal.getByRole('button', { name: 'Debug Console' })).toBeVisible();
  await expect(pinnedTerminal.getByLabel('Refresh runtime logs')).toBeVisible();
  await expect(pinnedTerminal.locator('.bolt-project-bottom-terminal-size')).toHaveText('240px');
  await expect(pinnedTerminal.getByText('Vibecore Terminal')).toBeVisible({ timeout: 15000 });
  await pinnedTerminal.getByRole('button', { name: 'Output' }).click();
  await expect(pinnedTerminal.locator('[data-testid="ide-service-panel"][data-panel="logs"]')).toBeVisible({
    timeout: 15000,
  });
  await pinnedTerminal.getByRole('button', { name: 'Debug Console' }).click();
  await expect(pinnedTerminal.locator('.bolt-project-monitoring-panel')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Toggle terminal').click();
  await expect(pinnedTerminal).toBeHidden();
  await page.getByLabel('Toggle terminal').click();
  await expect(pinnedTerminal).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.getByLabel('Command palette')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: /Snapshots/ }).click();
  await expect(page.locator('.bolt-project-service-panel', { hasText: 'Snapshots' })).toBeVisible({
    timeout: 15000,
  });

  const inIdePanels = [
    ['Overview', 'overview'],
    ['Database', 'database'],
    ['Object Storage', 'object-storage'],
    ['Packages', 'packages'],
    ['Monitoring', 'monitoring'],
    ['Extensions', 'extensions'],
    ['Env vars', 'env'],
    ['Secrets', 'secrets'],
    ['Git', 'git'],
    ['Activity', 'activity'],
    ['Logs', 'logs'],
    ['Collaborators', 'collaborators'],
    ['Domains', 'domains'],
  ] as const;

  for (const [label, panel] of inIdePanels) {
    await openIdeTool(new RegExp(label));
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=${panel}$`));
    await expect(page.locator(`[data-testid="ide-service-panel"][data-panel="${panel}"]`).first()).toBeVisible({
      timeout: 15000,
    });
  }

  await openIdeTool(/Settings/);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=settings$`));
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="settings"]')).toBeVisible({
    timeout: 15000,
  });

  await openIdeTool(/Env vars/);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=env$`));
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="env"]')).toBeVisible();
  await page.getByPlaceholder('VITE_API_URL').fill('E2E_FLAG');
  await page.locator('[data-testid="ide-service-panel"][data-panel="env"] form input[name="value"]').fill('enabled');
  await page.getByRole('button', { name: 'Save variable' }).click();
  await expect(
    page.locator('[data-testid="ide-service-panel"][data-panel="env"]').filter({ hasText: 'E2E_FLAG' }).last(),
  ).toBeVisible({ timeout: 15000 });

  await openIdeTool(/Database/);
  await page.getByPlaceholder('postgres://user:pass@host:5432/db').fill('postgres://local/test');
  await page
    .locator('[data-testid="ide-service-panel"][data-panel="database"]')
    .getByRole('button', { name: 'Save DATABASE_URL' })
    .click();
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="database"]')).toContainText('DATABASE_URL', {
    timeout: 15000,
  });

  const exportResponse = await page.request.get(`/api/projects/${projectId}/project-action?intent=export`);
  expect(exportResponse.ok(), await exportResponse.text()).toBeTruthy();
  expect(exportResponse.headers()['content-type']).toContain('application/zip');

  expect(page.url()).not.toContain('/snapshots');
  expect(page.url()).not.toContain('/deployments');
  expect(page.url()).not.toContain('/env-vars');
});

test('IDE light theme tabs use visible tokenized surfaces', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedLightTheme(page);

  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    data: { name: 'Light theme IDE tabs' },
    headers: { authorization: `Bearer ${auth.token}` },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  const zipBase64 = await createZipBase64({
    'components/AppShell.tsx': 'export function AppShell() { return <main />; }\n',
  });
  const importFiles = await page.request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    data: { zipBase64 },
    headers: { authorization: `Bearer ${auth.token}` },
  });

  expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 60_000 });

  /*
   * The server seeds <html data-theme> from the cookie, so force it and reload
   * before measuring light-theme surfaces.
   */
  await forceLightTheme(page);
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.bolt-project-tab').first()).toBeVisible({ timeout: 30_000 });

  const filesPanel = page.locator('[aria-label="Project library panel"]');
  await expect(filesPanel.getByText('AppShell.tsx', { exact: true })).toBeVisible({ timeout: 60_000 });
  await filesPanel.getByText('AppShell.tsx', { exact: true }).click();
  await expect(page.locator('[data-testid="responsive-code-editor"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-editor-kind="monaco"]')).toBeVisible({ timeout: 30_000 });

  const tabProbe = await page.evaluate(() => {
    const parseRgb = (value: string) => {
      const match = value.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];

      return { r: match[0] ?? 0, g: match[1] ?? 0, b: match[2] ?? 0 };
    };
    const luminance = (value: string) => {
      const { r, g, b } = parseRgb(value);

      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const read = (selector: string) => {
      const element = document.querySelector(selector);

      if (!element) {
        throw new Error(`Missing selector ${selector}`);
      }

      const style = window.getComputedStyle(element);

      return {
        background: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
        backgroundLuminance: luminance(style.backgroundColor),
        colorLuminance: luminance(style.color),
      };
    };

    return {
      theme: document.documentElement.getAttribute('data-theme'),
      editorActive: read('.bolt-project-tab[aria-selected="true"]'),
      editorStrip: read('.bolt-project-tabbar'),
      editorCanvas: read('[data-testid="responsive-code-editor"]'),
      rightPanel: read('[aria-label="Project library panel"]'),
    };
  });

  expect(tabProbe.theme).toBe('light');
  expect(tabProbe.editorActive.backgroundLuminance).toBeGreaterThan(0.9);
  expect(tabProbe.editorActive.colorLuminance).toBeLessThan(0.18);
  expect(tabProbe.editorStrip.backgroundLuminance).toBeGreaterThan(0.9);
  expect(tabProbe.editorCanvas.backgroundLuminance).toBeGreaterThan(0.9);
  expect(tabProbe.editorCanvas.colorLuminance).toBeLessThan(0.2);
  expect(tabProbe.rightPanel.backgroundLuminance).toBeGreaterThan(0.88);
});

test(
  'edit file workflow surfaces editor, files, terminal and preview affordances',
  { tag: '@runtime' },
  async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');

    const projectId = await createTestProject(page, 'E2E edit workflow project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Running|Building|Stopped|Crashed/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: /Publish/ })).toBeVisible();
    await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+T' : 'Control+T');
    await expect(page.getByLabel('Command palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P');
    await expect(page.getByLabel('Command palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');

    const commandPalette = page.getByLabel('Command palette');
    await expect(commandPalette).toBeVisible();

    const commandPaletteMetrics = await page.locator('.bolt-project-command-palette').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return {
        top: rect.top,
        width: rect.width,
        background: style.backgroundColor,
        borderRadius: style.borderRadius,
      };
    });
    expect(commandPaletteMetrics.top).toBe(120);
    expect(commandPaletteMetrics.width).toBe(600);
    expect(commandPaletteMetrics.background).toBe('rgb(26, 32, 48)');
    expect(commandPaletteMetrics.borderRadius).toBe('12px');
    await expect(page.locator('.bolt-project-command-section', { hasText: 'Files' })).toBeVisible();
    await expect(page.locator('.bolt-project-command-section', { hasText: 'Tools' })).toBeVisible();
    await expect(page.locator('.bolt-project-command-section', { hasText: 'Commands' })).toBeVisible();
    await expect(page.locator('.bolt-project-command-palette footer')).toContainText('↑↓ navigate');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ide-files-panel-toggle')).toBeVisible();
  },
);

test(
  'reopens project IDE with persisted agent memory and panel state',
  { tag: '@runtime' },
  async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop IDE shell uses a separate mobile panel navigation.');

    const auth = await authenticate(page);
    const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
    const marker = `Persisted enterprise memory ${Date.now()}`;
    const firstUserMessage = `${marker} first user request`;
    const assistantMessage = `${marker} assistant response`;
    const secondUserMessage = `${marker} second user request`;

    const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
      headers: { authorization: `Bearer ${auth.token}` },
      data: { name: 'Memory Project' },
    });

    expect(createProject.ok(), await createProject.text()).toBeTruthy();

    const projectId = (await createProject.json()).project.id as string;

    const saveState = await page.request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
      headers: { authorization: `Bearer ${auth.token}` },
      data: {
        state: {
          chat: {
            id: `project:${projectId}`,
            description: 'Persistent project agent',
            messages: [
              { id: 'memory-user-message-1', role: 'user', content: firstUserMessage },
              { id: 'memory-assistant-message-1', role: 'assistant', content: assistantMessage },
              { id: 'memory-user-message-2', role: 'user', content: secondUserMessage },
            ],
          },
          ui: {
            currentView: 'preview',
            rightPanel: 'network',
            rightPanelOpen: true,
            rightPanelWidth: 512,
            showWorkbench: true,
            agentWidth: 520,
            terminalBottomOpen: true,
            terminalBottomHeight: 320,
            activePaneId: 'pane-main',
            activeWorkspacePanel: 'snapshots',
            paneTree: {
              type: 'leaf',
              id: 'pane-main',
              tabs: [
                { id: 'tab-files-persisted', panel: 'files' },
                { id: 'tab-snapshots-persisted', panel: 'snapshots' },
              ],
              activeTabId: 'tab-snapshots-persisted',
            },
            cursorPositions: { '/home/project/src/App.tsx': { line: 42, column: 7, offset: 900 } },
            scrollPositions: { 'pane-main': 88 },
            recentTabIds: ['tab-snapshots-persisted', 'tab-files-persisted'],
            closedTabs: [{ id: 'tab-logs-closed', panel: 'logs' }],
          },
        },
      },
    });

    expect(saveState.ok(), await saveState.text()).toBeTruthy();
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Running' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(firstUserMessage)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(assistantMessage)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(secondUserMessage)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Snapshots' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-testid="ide-service-panel"][data-panel="snapshots"]')).toBeVisible({
      timeout: 15000,
    });

    const renderedMessages = page.locator('.bolt-chat-message-row');
    await expect(renderedMessages).toHaveCount(3);

    let renderedOrder = await renderedMessages.evaluateAll((rows) =>
      rows.map((row) => ({
        id: row.getAttribute('data-message-id'),
        text: row.textContent ?? '',
      })),
    );

    expect(renderedOrder.map((row) => row.id)).toEqual([
      'memory-user-message-1',
      'memory-assistant-message-1',
      'memory-user-message-2',
    ]);
    expect(renderedOrder[0].text).toContain(firstUserMessage);
    expect(renderedOrder[1].text).toContain(assistantMessage);
    expect(renderedOrder[2].text).toContain(secondUserMessage);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(firstUserMessage)).toBeVisible({ timeout: 15000 });
    renderedOrder = await page.locator('.bolt-chat-message-row').evaluateAll((rows) =>
      rows.map((row) => ({
        id: row.getAttribute('data-message-id'),
        text: row.textContent ?? '',
      })),
    );
    expect(renderedOrder.map((row) => row.id)).toEqual([
      'memory-user-message-1',
      'memory-assistant-message-1',
      'memory-user-message-2',
    ]);

    const persistedLocalState = await page.evaluate((id) => {
      const raw = localStorage.getItem(`vibecore.projectIdeMemory:${id}`);

      return raw ? JSON.parse(raw) : null;
    }, projectId);

    expect(persistedLocalState?.chat?.messages?.map((message: { id: string }) => message.id)).toEqual([
      'memory-user-message-1',
      'memory-assistant-message-1',
      'memory-user-message-2',
    ]);
    expect(persistedLocalState?.chat?.messages?.[0]?.content).toBe(firstUserMessage);
    expect(persistedLocalState?.ui?.paneTree?.activeTabId).toBe('tab-snapshots-persisted');
    expect(persistedLocalState?.ui?.agentWidth).toBe(520);
    expect(persistedLocalState?.ui?.terminalBottomHeight).toBe(320);
    expect(persistedLocalState?.ui?.cursorPositions?.['/home/project/src/App.tsx']).toEqual({
      line: 42,
      column: 7,
      offset: 900,
    });

    if (!isMobile) {
      await expect(page.getByRole('complementary', { name: 'Project library panel' })).toBeVisible();
      await expect(page.locator('.bolt-project-bottom-terminal-shell')).toBeVisible();

      const persistedMetrics = await page.locator('.bolt-project-ide-panels').evaluate((element) => {
        const style = window.getComputedStyle(element);

        return {
          agentWidth: style.getPropertyValue('--project-agent-width').trim(),
          rightPanelWidth: style.getPropertyValue('--project-right-panel-width').trim(),
        };
      });
      expect(persistedMetrics.agentWidth).toBe('520px');
      expect(persistedMetrics.rightPanelWidth).toBe('300px');
    }
  },
);

test('billing upgrade flow is reachable without frontend-only quota bypass', async ({ page }) => {
  await authenticate(page);
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Billing overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Upgrade' }).click();
  await expect(page.getByRole('heading', { name: 'Upgrade' })).toBeVisible();
});

test('authenticated users can sign out from the app shell', async ({ page }) => {
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  /*
   * "Sign out" lives inside the account Popover (SaaSLayout) and stays mounted
   * but hidden while the popover is closed, so clicking it directly timed out.
   * Open the account menu first when the control is not already visible.
   */
  const visibleSignOut = page.getByRole('button', { name: 'Sign out' }).filter({ visible: true }).first();

  if (!(await visibleSignOut.isVisible().catch(() => false))) {
    await page
      .getByRole('button', { name: /Account menu/i })
      .first()
      .click();
  }

  await visibleSignOut.click({ timeout: 15_000 });
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  const cookies = await page.context().cookies(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173');
  expect(cookies.some((cookie) => cookie.name === 'vc_session')).toBe(false);

  const me = await page.request.get(`${apiBaseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${auth.token}` },
  });
  expect(me.status()).toBe(401);
});

test('public and authenticated routes render without route errors', async ({ page }) => {
  test.setTimeout(75_000);

  const publicRoutes = [
    '/',
    '/pricing',
    '/docs',
    '/templates',
    '/changelog',
    '/status',
    '/contact-sales',
    '/security',
    '/privacy',
    '/terms',
    '/acceptable-use',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ];

  for (const route of publicRoutes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
    await expect(page.getByText(/Application Error|Unable to load section|Failed to fetch/i)).toHaveCount(0);
  }

  const auth = await authenticate(page);

  const createProject = await page.request.post(
    `${process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'}/orgs/${auth.organization.id}/projects`,
    {
      headers: { authorization: `Bearer ${auth.token}` },
      data: { name: 'Route Audit Project' },
    },
  );

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;

  const authenticatedRoutes = [
    '/dashboard',
    '/projects',
    '/projects/new',
    '/dashboard/templates',
    '/recent-projects',
    '/usage',
    '/billing',
    '/organization-members',
    '/invitations',
    '/account-settings',
    '/security-settings',
    '/api-keys',
    '/connected-accounts',
    '/notifications',
    '/support',
    '/command-palette',
    '/organization-switcher',
    '/roles-and-permissions',
    '/session-security',
    '/enterprise-sso-settings',
    '/scim-token-settings',
    '/audit-logs',
    `/projects/${projectId}`,
    `/projects/${projectId}/ide`,
    `/projects/${projectId}/settings`,
    `/projects/${projectId}/env`,
    `/projects/${projectId}/secrets`,
    `/projects/${projectId}/collaborators`,
    `/projects/${projectId}/snapshots`,
    `/projects/${projectId}/deployments`,
    `/projects/${projectId}/domains`,
    `/projects/${projectId}/logs`,
    `/projects/${projectId}/activity`,
    `/projects/${projectId}/git`,
  ];

  for (const route of authenticatedRoutes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
    await expect(page.getByText(/Application Error|Unable to load section|Failed to fetch/i)).toHaveCount(0);
  }
});

test('command palette entries navigate to real product routes', async ({ page }) => {
  await authenticate(page);
  await page.goto('/command-palette');

  /*
   * The palette is client-rendered inside AppShell; clicking straight away
   * raced the hydration and timed out. Wait for the page heading (and the link
   * itself) before driving it.
   */
  await expect(page.getByRole('heading', { name: 'Command palette' })).toBeVisible({ timeout: 30_000 });

  /*
   * Palette entries are <Link> elements carrying role="option" inside a
   * role="listbox" (SaaSLayout CommandPalettePreview). The explicit role
   * overrides the implicit `link` one, so getByRole('link', …) could never
   * match them — the page was fine, the locator was not.
   */
  const importCommand = page.getByRole('option', { name: /Import GitHub repository/ });
  await expect(importCommand).toBeVisible({ timeout: 30_000 });
  await importCommand.click();
  await expect(page).toHaveURL('/import-github');
  await expect(page.getByRole('heading', { name: 'Import GitHub' })).toBeVisible();
});
