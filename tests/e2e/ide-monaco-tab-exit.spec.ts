import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

const readyMarker = 'Synthetic Monaco keyboard shell is ready';

async function createProject(page: Page, baseURL: string) {
  const api = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${api}/auth/register`, {
    data: {
      email: `monaco-tab-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Keyboard fixture',
      organizationName: `Keyboard fixture ${suffix}`,
    },
  });
  expect(registration.ok()).toBe(true);

  const auth = await registration.json();
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'Monaco keyboard fixture' },
  });
  expect(creation.ok()).toBe(true);

  const projectId = (await creation.json()).project.id;

  const conversationResponse = await page.request.post(`${api}/projects/${projectId}/ai/conversations`, {
    headers,
    data: { title: 'Keyboard fixture' },
  });
  expect(conversationResponse.ok()).toBe(true);

  const { conversation } = await conversationResponse.json();

  const transcript = await page.request.put(
    `${api}/projects/${projectId}/ai/conversations/${conversation.id}/transcript`,
    {
      headers,
      data: { messages: [{ clientId: 'keyboard-ready-user', role: 'user', content: readyMarker }] },
    },
  );
  expect(transcript.ok()).toBe(true);

  const state = await page.request.put(`${api}/projects/${projectId}/ide-state`, {
    headers,
    data: { state: { chat: { metadata: { aiConversationId: conversation.id } } } },
  });
  expect(state.ok()).toBe(true);

  const archive = new JSZip();
  archive.file('README.md', '# Keyboard fixture\nTab indents until navigation mode is enabled.\n');

  const imported = await page.request.post(`${api}/projects/${projectId}/files/import/zip`, {
    headers,
    data: { zipBase64: await archive.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok()).toBe(true);
  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
    { name: 'vibecore-lang', value: 'en', url: baseURL },
  ]);

  return projectId;
}

// Read the real model; getAction() does not list this native Action2/global command.
async function documentValue(page: Page) {
  return page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /\/assets\/vendor-monaco-core-[^/]+\.js$/.test(name));

    if (!url) {
      throw new Error('Loaded Monaco core resource was not found');
    }

    type MonacoProbe = {
      editor: {
        getEditors(): Array<{ getDomNode(): HTMLElement | null; getValue(): string }>;
      };
    };

    const bundle = await import(/* @vite-ignore */ url);

    // Rollup may share this chunk with contributions and alias the API namespace.
    const monaco = [bundle, ...Object.values(bundle)].find(
      (candidate) => typeof (candidate as Partial<MonacoProbe> | undefined)?.editor?.getEditors === 'function',
    ) as MonacoProbe | undefined;

    if (!monaco) {
      throw new Error('Loaded Monaco bundle does not expose the editor API');
    }

    const editor = monaco.editor.getEditors().find((candidate) => {
      const node = candidate.getDomNode();
      return node && node.getClientRects().length > 0;
    });

    if (!editor) {
      throw new Error('Visible Monaco editor was not found');
    }

    return editor.getValue() as string;
  });
}

test('Monaco keeps indentation by default and lets the keyboard leave and return', async ({ page, baseURL }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const projectId = await createProject(page, baseURL!);

  // All browser-side writes are blocked; edits below affect only the disposable in-memory model.
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      await route.abort();
      return;
    }

    await route.continue();
  });
  await page.goto(`/projects/${projectId}/ide?panel=editor`);

  // The transcript appears only after the startup shell has handed off to ChatImpl.
  await page.locator('.bolt-user-message-bubble').filter({ hasText: readyMarker }).first().waitFor();

  const input = page.locator('.monaco-editor textarea.inputarea').filter({ visible: true }).first();
  await expect(input).toBeVisible({ timeout: 30_000 });

  const original = await documentValue(page);
  await input.focus();
  await expect(input).toBeFocused();
  await page.keyboard.press('Tab');
  await expect.poll(() => documentValue(page)).not.toBe(original);
  await expect(input).toBeFocused();

  const indented = await documentValue(page);
  const toggle = (await page.evaluate(() => navigator.platform.includes('Mac'))) ? 'Control+Shift+m' : 'Control+m';
  await page.keyboard.press(toggle);
  await page.keyboard.press('Tab');
  await expect(input).not.toBeFocused();
  expect(await documentValue(page)).toBe(indented);
  expect(
    await page.evaluate(() => {
      const active = document.activeElement;
      return (
        active instanceof HTMLElement &&
        active !== document.body &&
        !active.closest('.monaco-editor') &&
        active.getClientRects().length > 0
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('tab-navigation-outside-editor.png') });
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(input).not.toBeFocused();
  expect(await documentValue(page)).toBe(indented);
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press(toggle);
  await page.keyboard.press('Tab');
  await expect.poll(() => documentValue(page)).not.toBe(indented);
  await expect(input).toBeFocused();
});
