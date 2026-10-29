import { expect, test, type Page } from '@playwright/test';

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

for (const language of ['en', 'fr']) {
  test(`clipboard refused then retry ${language} at320`, async ({ page, baseURL }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => {
      (window as any).__clipboardWrites = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as any).__clipboardWrites.push(value);

            if ((window as any).__clipboardWrites.length === 1) {
              throw new DOMException('Synthetic clipboard denial', 'NotAllowedError');
            }
          },
        },
      });
    });

    const { projectId, blockedMutations } = await fixture(page, baseURL!, true);
    await page.context().addCookies([{ name: 'vibecore-lang', value: language, url: baseURL! }]);
    await page.goto(`/projects/${projectId}/ide?panel=deployments`, { waitUntil: 'domcontentloaded' });

    const host = page.locator('.bolt-project-deploy-tool');
    await expect(host).toBeVisible({ timeout: 45000 });
    await page
      .locator('.bolt-user-message-bubble')
      .filter({ hasText: 'Synthetic Publish layout shell ready' })
      .first()
      .waitFor({ state: 'attached' });

    const copyName = language === 'en' ? 'Copy URL' : 'Copier l’URL';
    const copy = host.getByRole('button', { name: copyName, exact: true }).first();

    const qr = host
      .getByRole('button', { name: language === 'en' ? 'Show QR code' : 'Afficher le code QR', exact: true })
      .first();

    const sizes = { copy: await copy.boundingBox(), qr: await qr.boundingBox() };
    await copy.click();
    await expect.poll(() => page.evaluate(() => (window as any).__clipboardWrites.length)).toBe(1);

    const message =
      language === 'en'
        ? 'Could not copy the URL. Copy it manually from the field below.'
        : 'Impossible de copier l’URL. Copiez-la manuellement depuis le champ ci-dessous.';
    await expect.soft(host.getByRole('status').filter({ hasText: message })).toBeVisible({ timeout: 2000 });

    const manual = host.getByRole('textbox', { name: copyName, exact: true });
    await expect.soft(manual).toBeVisible({ timeout: 1000 });

    let selection = null;

    if (await manual.count()) {
      await manual.click();
      await expect(manual).toHaveValue(deployment.url);
      selection = await manual.evaluate((n: HTMLInputElement) => ({
        start: n.selectionStart,
        end: n.selectionEnd,
        length: n.value.length,
      }));
      expect(selection.start).toBe(0);
      expect(selection.end).toBe(deployment.url.length);
    }

    await page.screenshot({ path: info.outputPath('clipboard-refused.png') });
    await info.attach('clipboard-behavior.json', {
      body: JSON.stringify({
        language,
        sizes,
        manualCount: await manual.count(),
        selection,
        status: await host.getByRole('status').allTextContents(),
      }),
      contentType: 'application/json',
    });

    for (const box of Object.values(sizes)) {
      expect.soft(box!.width).toBeGreaterThanOrEqual(44);
      expect.soft(box!.height).toBeGreaterThanOrEqual(44);
    }
    await copy.click();
    await expect(
      host.getByRole('button', { name: language === 'en' ? 'URL copied' : 'URL copiée', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).__clipboardWrites)).toEqual([deployment.url, deployment.url]);
    await expect(manual).toHaveCount(0);
    expect(blockedMutations.filter((value) => !value.endsWith('/ide-state'))).toEqual([]);
  });
}
