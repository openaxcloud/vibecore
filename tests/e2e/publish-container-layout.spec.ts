import { expect, test, type Page, type Locator } from '@playwright/test';

const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const longHost = `${'a'.repeat(63)}.${'b'.repeat(63)}.example.test`;
const token = 'synthetic-verification-token-'.repeat(5);

const deployment = {
  id: 'synthetic-ready',
  provider: 'static',
  status: 'READY',
  environment: 'preview',
  url: `https://${longHost}`,
  productionUrl: `https://${longHost}`,
  createdAt: '2026-10-26T10:00:00.000Z',
  logs: ['Synthetic build completed.', 'Synthetic URL ready; no provider was contacted.'],
  rollbackUnavailableReason: 'Synthetic layout fixture',
};

async function fixture(page: Page, baseURL: string, history: boolean) {
  const registration = await page.request.post(`${api}/auth/register`, {
    data: {
      email: `publish-layout-${Date.now()}-${Math.random().toString(36).slice(2)}@local.test`,
      password: 'Password123!',
      name: 'Publish layout fixture',
    },
  });
  expect(registration.ok()).toBe(true);

  const auth = await registration.json();

  const created = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Isolated Publish layout' },
  });
  expect(created.ok()).toBe(true);

  const project = (await created.json()).project;
  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
    { name: 'vibecore-lang', value: 'en', url: baseURL },
  ]);

  const headers = { authorization: `Bearer ${auth.token}` };

  const conversationResponse = await page.request.post(`${api}/projects/${project.id}/ai/conversations`, {
    headers,
    data: { title: 'Publish layout' },
  });
  expect(conversationResponse.ok()).toBe(true);

  const { conversation } = await conversationResponse.json();

  const transcript = await page.request.put(
    `${api}/projects/${project.id}/ai/conversations/${conversation.id}/transcript`,
    {
      headers,
      data: { messages: [{ clientId: 'layout-ready', role: 'user', content: 'Synthetic Publish layout shell ready' }] },
    },
  );
  expect(transcript.ok()).toBe(true);

  const state = await page.request.put(`${api}/projects/${project.id}/ide-state`, {
    headers,
    data: { state: { chat: { metadata: { aiConversationId: conversation.id } } } },
  });
  expect(state.ok()).toBe(true);

  const blockedMutations: string[] = [];
  await page.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url());

    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      await route.abort();
      return;
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      blockedMutations.push(`${req.method()} ${url.pathname}`);
      await route.abort();

      return;
    }

    const panel = url.pathname.split('/').at(-1);

    if (
      url.pathname.startsWith(`/api/projects/${project.id}/ide-panel/`) &&
      ['deployments', 'domains'].includes(panel!)
    ) {
      const data =
        panel === 'domains'
          ? {
              domains: [
                {
                  id: 'synthetic-domain',
                  domain: longHost,
                  verificationToken: token,
                  createdAt: '2026-10-26T10:00:00.000Z',
                  sslStatus: 'pending',
                  wildcardEnabled: true,
                  redirectWww: true,
                },
              ],
              deployments: history ? [deployment] : [],
            }
          : {
              deployments: history ? [deployment] : [],
              gitCommits: [],
              connections: [],
              workspaceId: '',
              providerAvailability: [],
            };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ panel, project, status: 'ok', data }),
      });

      return;
    }

    await route.continue();
  });

  return { projectId: project.id as string, blockedMutations };
}

async function assertKeyboardTargetVisible(page: Page, host: Locator) {
  const active = await host.evaluate((root) => {
    const n = document.activeElement;

    if (!(n instanceof HTMLElement)) {
      return null;
    }

    const r = n.getBoundingClientRect();

    const x = Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2)),
      y = Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2));

    const hit = document.elementFromPoint(x, y);

    return {
      inside: root.contains(n),
      visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1,
      hit: hit === n || n.contains(hit),
    };
  });
  expect(active?.inside).toBe(true);
  expect(active?.visible).toBe(true);
  expect(active?.hit).toBe(true);
}

async function geometry(host: Locator) {
  return host.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const visible = (n: Element) => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';

    const children = Array.from(root.children)
      .filter(visible)
      .map((n) => ({
        tag: n.tagName,
        className: n.className,
        x: n.getBoundingClientRect().x,
        y: n.getBoundingClientRect().y,
        width: n.getBoundingClientRect().width,
        bottom: n.getBoundingClientRect().bottom,
      }));
    const outside = Array.from(
      root.querySelectorAll(
        'input:not([type=hidden]),select,textarea,button,h2,h3,h4,summary,.bolt-project-dns-record code',
      ),
    )
      .filter(visible)
      .filter((n) => !n.closest('.bolt-project-tool-tabs'))
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.left < box.left - 1 || r.right > box.right + 1;
      })
      .map((n) => ({ tag: n.tagName, text: n.textContent?.slice(0, 80), name: n.getAttribute('name') }));
    const dns = Array.from(root.querySelectorAll('.bolt-project-dns-record code'))
      .filter(visible)
      .map((n) => ({
        text: n.textContent,
        clientWidth: n.clientWidth,
        scrollWidth: n.scrollWidth,
        whiteSpace: getComputedStyle(n).whiteSpace,
        overflowX: getComputedStyle(n).overflowX,
      }));

    return { width: box.width, clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, children, outside, dns };
  });
}

for (const scenario of [
  ...[320, 390, 600, 820, 1120, 1200].map((width) => ({ width, history: true })),
  { width: 390, history: false },
  { width: 1120, history: false },
  { width: 1120, history: true, viewport: 2048 },
]) {
  test(`Publish container ${scenario.width}px history=${scenario.history} viewport=${'viewport' in scenario ? scenario.viewport : 2560}`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 'viewport' in scenario ? scenario.viewport : 2560, height: 1100 });

    const { projectId, blockedMutations } = await fixture(page, baseURL!, scenario.history);
    await page.goto(`/projects/${projectId}/ide?panel=deployments`, { waitUntil: 'domcontentloaded' });

    const host = page.locator('.bolt-project-deploy-tool');
    await expect(host).toBeVisible({ timeout: 45000 });

    await page
      .locator('.bolt-user-message-bubble')
      .filter({ hasText: 'Synthetic Publish layout shell ready' })
      .first()
      .waitFor({ state: 'attached' });

    const slot = page.locator('.bolt-project-panel-slot-workspace');
    await expect(slot).toBeVisible();

    const gutter = await host.evaluate(
      (n) =>
        n.closest('.bolt-project-panel-slot-workspace')!.getBoundingClientRect().width -
        n.getBoundingClientRect().width,
    );
    await page.addStyleTag({
      content: `.bolt-project-panel-slot-workspace{flex:0 0 ${scenario.width + gutter}px!important;min-width:0!important}.bolt-project-panel-slot-agent{flex:0 0 480px!important;min-width:0!important}.bolt-project-panel-slot-right{flex:0 0 380px!important;min-width:0!important}`,
    });
    await expect(page.locator('.bolt-project-panel-slot-agent')).toBeVisible();
    await expect(page.locator('.bolt-project-panel-slot-right')).toBeVisible();

    let expectedWidth = scenario.width;

    if ('viewport' in scenario && scenario.viewport === 2048) {
      // Let the workspace use the actual width left by both sidebars and IDE chrome.
      await page.addStyleTag({ content: '.bolt-project-panel-slot-workspace{flex:1 1 0!important}' });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect
        .poll(async () => (await page.locator('.bolt-project-panel-slot-agent').boundingBox())!.width)
        .toBeCloseTo(480, 0);
      await expect
        .poll(async () => (await page.locator('.bolt-project-panel-slot-right').boundingBox())!.width)
        .toBeCloseTo(380, 0);
      await expect.poll(async () => (await host.boundingBox())!.width).toBeLessThanOrEqual(scenario.width);
      expectedWidth = (await host.boundingBox())!.width;
      expect(expectedWidth).toBeGreaterThan(1000);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(2048);
    }

    const measurements = [];

    for (const view of ['Overview', 'Logs', 'Domains', 'Manage']) {
      const tab = host.locator('.bolt-project-tool-tabs').getByRole('button', { name: view, exact: true });
      await tab.click();

      if (view === 'Domains') {
        await expect(host.locator('.bolt-project-dns-record')).toHaveCount(4);

        const input = host.locator('input[name=domain]:not([type=hidden])');
        await input.fill('typed-only.example.test');
        await input.press('Tab');
        await assertKeyboardTargetVisible(page, host);
        await expect(input).toHaveValue('typed-only.example.test');
      }

      if (view === 'Manage') {
        await expect(host.locator('.vc-managed-publish-form')).toBeVisible();

        const other = host.locator(':scope > details > summary');
        await other.click();
        await expect(host.getByTestId('deploy-provider-select')).toBeVisible();
        await host.locator('.bolt-project-deploy-wizard > details > summary').click();

        const custom = host.locator('.vc-managed-publish-form input[name=customDomain]');
        await custom.fill('typed-only.example.test');
        await custom.press('Tab');
        await assertKeyboardTargetVisible(page, host);
        await expect(custom).toHaveValue('typed-only.example.test');
      }

      await host.scrollIntoViewIfNeeded();

      const metrics = await geometry(host);

      const sidebars = await page.evaluate(() => {
        const rect = (selector: string) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return { x: r.x, right: r.right, width: r.width };
        };
        return {
          agent: rect('.bolt-project-panel-slot-agent'),
          library: rect('.bolt-project-panel-slot-right'),
          publish: rect('.bolt-project-deploy-tool'),
          viewport: innerWidth,
        };
      });
      expect.soft(sidebars.agent.width).toBeCloseTo(480, 0);
      expect.soft(sidebars.library.width).toBeCloseTo(380, 0);
      expect.soft(sidebars.publish.x).toBeGreaterThanOrEqual(sidebars.agent.right - 1);
      expect.soft(sidebars.publish.right).toBeLessThanOrEqual(sidebars.library.x + 1);
      expect.soft(sidebars.library.right).toBeLessThanOrEqual(sidebars.viewport + 1);
      await info.attach(`${view}-sidebars.json`, {
        body: JSON.stringify(sidebars, null, 2),
        contentType: 'application/json',
      });
      measurements.push({ view, ...metrics });
      await info.attach(`${view}-geometry.json`, {
        body: JSON.stringify(metrics, null, 2),
        contentType: 'application/json',
      });

      if ('viewport' in scenario && scenario.viewport === 2048) {
        expect.soft(metrics.width).toBeGreaterThan(1000);
        expect.soft(metrics.width).toBeLessThanOrEqual(1120);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(2048);
      } else {
        expect.soft(metrics.width).toBeCloseTo(expectedWidth, 0);
      }

      expect
        .soft(metrics.children[1].y, `${view} content starts below navigation`)
        .toBeGreaterThanOrEqual(metrics.children[0].bottom - 1);
      expect.soft(metrics.scrollWidth, `${view} host horizontal overflow`).toBeLessThanOrEqual(metrics.clientWidth + 1);
      expect.soft(metrics.outside, `${view} controls fit the panel`).toEqual([]);

      for (const code of metrics.dns) {
        expect
          .soft(code.scrollWidth, `DNS value readable: ${code.text?.slice(0, 35)}`)
          .toBeLessThanOrEqual(code.clientWidth + 1);
      }

      const keyboard = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        connected: document.activeElement?.isConnected,
      }));
      expect(keyboard.connected).toBe(true);
      await page.screenshot({ path: info.outputPath(`${view}-${scenario.width}.png`) });
    }
    expect(blockedMutations.filter((value) => !value.endsWith('/ide-state'))).toEqual([]);
    await info.attach('layout-matrix.json', {
      body: JSON.stringify({ scenario, measurements, blockedMutations }, null, 2),
      contentType: 'application/json',
    });
  });
}
