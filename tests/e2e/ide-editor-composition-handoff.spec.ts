import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

const readyMarker = 'Synthetic composition shell is ready';

async function createProject(page: Page, baseURL: string) {
  const api = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${api}/auth/register`, {
    data: {
      email: `composition-handoff-${suffix}@local.test`,
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
    data: { name: 'Editor focus handoff fixture' },
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

// Chromium CDP exercises browser composition events, not a physical operating-system IME.
for (const scenario of ['stable', 'handoff', 'outside'] as const) {
  test(`Chromium composition ${scenario}`, async ({ page, baseURL }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const projectId = await createProject(page, baseURL!);

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      ) {
        await route.abort();
        return;
      }

      if (url.pathname.endsWith('/ide-state')) {
        await gate;
      }

      await route.continue();
    });

    const client = await page.context().newCDPSession(page);

    try {
      await page.goto(`/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });

      const input = page.locator('.monaco-editor textarea.inputarea').filter({ visible: true }).first();
      const readyMessage = page.locator('.bolt-user-message-bubble').filter({ hasText: readyMarker }).first();
      await expect(input).toBeVisible();

      if (scenario === 'stable') {
        release();
        await readyMessage.waitFor();
      }

      const original = await documentValue(page);
      await input.focus();
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('End');

      const oldInput = await input.elementHandle();
      expect(oldInput).not.toBeNull();
      await client.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
      await client.send('Input.imeSetComposition', { text: '日本', selectionStart: 2, selectionEnd: 2 });
      await expect.poll(() => documentValue(page)).toBe(original.replace('\n', '日本\n'));

      if (scenario !== 'stable') {
        // The actual restored transcript has arrived, so startup data is no longer the barrier.
        const historyResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            /\/ai\/conversations\/[^/]+\/messages(?:\?|$)/.test(response.url()),
        );
        release();
        await historyResponse;
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
        );
        expect(await oldInput!.evaluate((node) => node.isConnected)).toBe(true);
        await expect(readyMessage).toHaveCount(0);
        await expect(input).toBeFocused();
      }

      if (scenario === 'outside') {
        // Use a real product control; no synthetic outside input and no forced focus after clicking.
        await page.getByTestId('ide-dock-search').click();
        await readyMessage.waitFor();
        await expect.poll(() => oldInput!.evaluate((node) => node.isConnected)).toBe(false);

        const search = page.getByPlaceholder('Search files', { exact: true });
        await search.click();
        await page.keyboard.type('README');
        await expect(search).toBeFocused();
        await expect(search).toHaveValue('README');
      } else {
        await client.send('Input.insertText', { text: '日本' });

        if (scenario === 'handoff') {
          await readyMessage.waitFor();
          await expect.poll(() => oldInput!.evaluate((node) => node.isConnected)).toBe(false);
        }

        await expect(input).toBeFocused();
        await page.keyboard.type('Z');
        await expect.poll(() => documentValue(page)).toBe(original.replace('\n', '日本Z\n'));
      }

      await info.attach('composition-evidence.json', {
        body: JSON.stringify(
          {
            scenario,
            original,
            final: scenario === 'outside' ? null : await documentValue(page),
            searchValue:
              scenario === 'outside' ? await page.getByPlaceholder('Search files', { exact: true }).inputValue() : null,
            oldInputConnected: await oldInput!.evaluate((node) => node.isConnected),
            documentFocused: await page.evaluate(() => document.hasFocus()),
          },
          null,
          2,
        ),
        contentType: 'application/json',
      });
      await page.screenshot({ path: info.outputPath('composition-after.png') });
    } finally {
      release();
      await client.detach();
    }
  });
}
