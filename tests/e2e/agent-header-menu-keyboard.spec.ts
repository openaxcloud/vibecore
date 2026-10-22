import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type APIRequestContext } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const apiURL = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const transcriptMarker = 'Synthetic menu accessibility audit';

async function seedTranscript(request: APIRequestContext, projectId: string, token: string) {
  const headers = { authorization: `Bearer ${token}` };

  const created = await request.post(`${apiURL}/projects/${projectId}/ai/conversations`, {
    headers,
    data: { title: 'Menu accessibility audit' },
  });
  expect(created.ok()).toBe(true);

  const { conversation } = await created.json();

  const saved = await request.put(`${apiURL}/projects/${projectId}/ai/conversations/${conversation.id}/transcript`, {
    headers,
    data: { messages: [{ clientId: 'menu-audit-user', role: 'user', content: transcriptMarker }] },
  });
  expect(saved.ok()).toBe(true);

  const state = await request.put(`${apiURL}/projects/${projectId}/ide-state`, {
    headers,
    data: { state: { chat: { metadata: { aiConversationId: conversation.id } } } },
  });
  expect(state.ok()).toBe(true);
}

async function projectSession(context: BrowserContext, request: APIRequestContext, language: string) {
  if (process.env.UX_QA_SESSION_FILE) {
    // A session-only synthetic identity in the dedicated local PostgreSQL fixture.
    expect(new URL(baseURL).hostname).toBe('127.0.0.1');
    expect(new URL(apiURL).hostname).toBe('127.0.0.1');

    const fixtures = JSON.parse(await readFile(process.env.UX_QA_SESSION_FILE, 'utf8'));
    const width = test.info().project.use.viewport?.width ?? 1440;
    const profile = width >= 1200 ? 'desktop' : width >= 600 ? 'tablet' : 'mobile';
    const fixture = fixtures.cases?.[`${profile}-${language}`] ?? fixtures;
    await context.addCookies(fixture.cookies);
    await seedTranscript(
      request,
      fixture.projectId,
      fixture.cookies.find((cookie: { name: string }) => cookie.name === 'vc_session').value,
    );

    return fixture.projectId as string;
  }

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registered = await request.post(`${apiURL}/auth/register`, {
    data: {
      email: `menu-keyboard-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Menu keyboard E2E',
      organizationName: `Menu keyboard ${suffix}`,
    },
  });
  expect(registered.ok()).toBe(true);

  const auth = await registered.json();

  const created = await request.post(`${apiURL}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Menu keyboard E2E' },
  });
  expect(created.ok()).toBe(true);

  const projectId = (await created.json()).project.id as string;
  await seedTranscript(request, projectId, auth.token);
  await context.addCookies([{ name: 'vc_session', value: auth.token, url: baseURL, httpOnly: true, sameSite: 'Lax' }]);

  return projectId;
}

for (const language of ['en', 'fr'] as const) {
  test(`agent menu keyboard and compact navigation (${language})`, async ({ page, context, request }, testInfo) => {
    const projectId = await projectSession(context, request, language);
    await context.addCookies([{ name: 'vibecore-lang', value: language, url: baseURL }]);
    await page.goto(`/projects/${projectId}/ide?panel=agent&lang=${language}`);

    /*
     * The same toolbar exists in PendingComposerShell. A persisted user message
     * proves that the real Chat consumer has replaced that temporary shell.
     */
    await page.locator('.bolt-user-message-bubble').filter({ hasText: transcriptMarker }).first().waitFor();

    const compact = (page.viewportSize()?.width ?? 1440) < 1200;

    if (compact) {
      const options = page.getByRole('button', { name: /^(Agent options|Options de l.agent)$/ });
      await options.tap();

      const close = page.getByRole('button', { name: /^(Close agent options|Fermer les options de l.agent)$/ }).last();
      await expect(close).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`menu-${language}.png`) });
      await close.tap();
      await expect(close).toBeHidden();

      const webview = page.getByRole('button', { name: /^(Switch to Webview tab|Passer à l.onglet Webview)$/ });
      const agent = page.getByRole('button', { name: /^(Switch to Agent tab|Passer à l.onglet Agent)$/ });
      await webview.tap();
      await expect(page).toHaveURL(/panel=preview/);
      await agent.tap();

      // Agent is the canonical default: its navigation removes the panel parameter.
      await expect(page).toHaveURL(`${baseURL}/projects/${projectId}/ide?lang=${language}`);
      await expect(agent).toHaveAttribute('aria-pressed', 'true');
      await expect(options).toBeVisible();
      await expect(agent).toBeVisible();

      // A tap animates scale; measure the settled control with the same 44px requirement.
      await expect(agent).toHaveCSS('transform', 'none');
      expect(await agent.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    } else {
      const label = language === 'en' ? 'More agent actions' : "Plus d'actions d'agent";
      const trigger = page.getByRole('button', { name: label, exact: true });
      const menu = page.getByRole('menu', { name: label, exact: true });
      const buttons = menu.locator('button');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      await expect(buttons.first()).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`menu-${language}.png`) });
      await page.keyboard.press('ArrowDown');
      await expect(buttons.nth(1)).toBeFocused();
      await page.keyboard.press('End');
      await expect(buttons.last()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(buttons.first()).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(buttons.last()).toBeFocused();
      await page.keyboard.press('Home');
      await expect(buttons.first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(buttons.last()).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(menu).toBeHidden();
      await expect(
        page.getByRole('button', { name: /^(Hide AI agent panel|Masquer le panneau des agents IA)$/ }),
      ).toBeFocused();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`agent menu actions and theme persistence (${language})`, async ({ page, context, request }) => {
    const projectId = await projectSession(context, request, language);
    await context.addCookies([{ name: 'vibecore-lang', value: language, url: baseURL }]);
    await page.goto(`/projects/${projectId}/ide?panel=agent&lang=${language}`);
    await page.locator('.bolt-user-message-bubble').filter({ hasText: transcriptMarker }).first().waitFor();

    const compact = (page.viewportSize()?.width ?? 1440) < 1200;
    const label = language === 'en' ? 'More agent actions' : "Plus d'actions d'agent";

    const trigger = compact
      ? page.getByRole('button', { name: /^(Agent options|Options de l.agent)$/ })
      : page.getByRole('button', { name: label, exact: true });
    const menu = compact
      ? page.getByTestId('mobile-agent-menu-sheet')
      : page.getByRole('menu', { name: label, exact: true });
    await trigger.click();

    const oldTheme = await page.locator('html').getAttribute('data-theme');

    const themeButton = compact
      ? menu.getByTestId('mobile-agent-theme')
      : menu.getByRole('button', { name: /^(Switch light\/dark theme|Changer de thème clair\/sombre)$/ });
    await themeButton.click();
    await expect(menu).toBeHidden();

    if (!compact) {
      await expect(trigger).toBeFocused();
    }

    const newTheme = oldTheme === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', newTheme);
    await page.reload();
    await page.locator('.bolt-user-message-bubble').filter({ hasText: transcriptMarker }).first().waitFor();
    await expect(page.locator('html')).toHaveAttribute('data-theme', newTheme);
    await trigger.click();

    const settings = menu.getByRole(compact ? 'button' : 'menuitem', {
      name: /^(Agent settings|Paramètres des agents)$/,
    });
    await settings.click();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/panel=settings/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
