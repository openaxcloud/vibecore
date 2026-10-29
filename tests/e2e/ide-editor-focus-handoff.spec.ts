import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

const readyMarker = 'Synthetic editor handoff shell is ready';

/** Bounded, read-only failure telemetry. Never emit paths, labels, source, or credentials. */
function collectReadmeVisibilityDiagnostics(projectId: string) {
  const visible = (element: Element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  };
  const normalized = (element: Element) =>
    (element.textContent ?? '')
      .replace(/[\u200b\u00ad]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

  const nodes = [...document.querySelectorAll('.bolt-file-tree-node')];

  const names = [...document.querySelectorAll('.bolt-file-tree-name')].filter(
    (element) => normalized(element) === 'README.md',
  );

  const readmeRows = nodes.filter((node) => names.some((name) => node.contains(name)));
  const exactRows = nodes.filter((node) => normalized(node) === 'README.md');

  const count = (elements: Element[]) => ({
    total: Math.min(elements.length, 1000),
    visible: Math.min(elements.filter(visible).length, 1000),
  });

  const countSelector = (selector: string) => count([...document.querySelectorAll(selector)]);

  const allowed = (value: string | null | undefined, choices: string[]) =>
    value && choices.includes(value) ? value : 'other';
  const routeKind = (path: string | undefined) =>
    /^\/projects\/[^/]+\/ide$/.test(path ?? '')
      ? 'ide'
      : path === '/dashboard'
        ? 'dashboard'
        : path === '/login'
          ? 'login'
          : 'other';
  const router = (
    window as typeof window & {
      __reactRouterDataRouter?: { state: { location?: { pathname?: string }; navigation?: { state?: string } } };
    }
  ).__reactRouterDataRouter?.state;

  return {
    treeNodes: count(nodes),
    readmeNames: count(names),
    readmeRows: count(readmeRows),
    exactReadmeRows: count(exactRows),
    rowsWithAdditionalText: Math.min(readmeRows.filter((node) => normalized(node) !== 'README.md').length, 1000),
    gitBadgeCandidates: Math.min(
      readmeRows.reduce((sum, node) => sum + node.querySelectorAll('span[aria-label][title] > span.sr-only').length, 0),
      1000,
    ),
    codeMirror: countSelector('.cm-content'),
    monaco: countSelector('.monaco-editor'),
    routeKind: routeKind(location.pathname),
    projectApplied: router?.location?.pathname === `/projects/${projectId}/ide`,
    routerRouteKind: routeKind(router?.location?.pathname),
    navigation: allowed(router?.navigation?.state, ['idle', 'loading', 'submitting']),
    panel: allowed(new URLSearchParams(location.search).get('panel'), [
      'files',
      'editor',
      'agent',
      'search',
      'terminal',
      'preview',
    ]),
    mobileSurface: allowed(document.querySelector('.bolt-responsive-ide')?.getAttribute('data-mobile-panel'), [
      'files',
      'editor',
      'chat',
      'search',
      'terminal',
      'preview',
    ]),
    activeWorkbench: Boolean(document.querySelector('[data-testid="mobile-workbench-keepalive"][data-active="true"]')),
    busy: countSelector('[aria-busy="true"]'),
    progress: countSelector('[role="progressbar"]'),
  };
}

async function createProject(page: Page, baseURL: string) {
  const api = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${api}/auth/register`, {
    data: {
      email: `editor-handoff-${suffix}@local.test`,
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

for (const moveOutside of [false, true]) {
  test(`editor focus handoff respects ${moveOutside ? 'focus moved outside' : 'active editor'}`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const projectId = await createProject(page, baseURL!);

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Keep the actual startup GET pending. Only isolated fixture setup writes above are allowed.
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

    try {
      await page.goto(`/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });

      const input = page.locator('.monaco-editor textarea.inputarea').filter({ visible: true }).first();
      await expect(input).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.bolt-user-message-bubble').filter({ hasText: readyMarker })).toHaveCount(0);

      // Read the actual loaded model before the single initial focus, never refocus after handoff.
      const original = await documentValue(page);
      await input.focus();
      await expect(input).toBeFocused();

      if (!moveOutside) {
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('End');
      }

      const oldInput = await input.elementHandle();
      expect(oldInput).not.toBeNull();

      if (moveOutside) {
        await page.getByTestId('ide-dock-files').focus();
        await expect(input).not.toBeFocused();
      }

      release();
      await page.locator('.bolt-user-message-bubble').filter({ hasText: readyMarker }).first().waitFor();
      await expect.poll(() => oldInput!.evaluate((node) => node.isConnected)).toBe(false);
      await expect(input).toBeVisible();

      if (moveOutside) {
        await expect(input).not.toBeFocused();
        expect(await documentValue(page)).toBe(original);
      } else {
        await expect(input).toBeFocused();
        await page.keyboard.type('handoff');
        await expect.poll(() => documentValue(page)).toBe(original.replace('\n', 'handoff\n'));
        await expect(input).toBeFocused();
      }

      await info.attach('editor-handoff-evidence.json', {
        body: JSON.stringify(
          {
            moveOutside,
            oldInputConnected: await oldInput!.evaluate((node) => node.isConnected),
            focused: await input.evaluate((node) => node === document.activeElement),
            originalModel: original,
            finalModel: await documentValue(page),
          },
          null,
          2,
        ),
        contentType: 'application/json',
      });
      await page.screenshot({ path: info.outputPath('editor-focus-after-handoff.png') });
    } finally {
      release();
    }
  });
}

test('Files editor preserves its selection through desktop, mobile and desktop', async ({ page, baseURL }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  const projectId = await createProject(page, baseURL!);

  // Fixture creation above is isolated. Editing below must never write to a backend.
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      await route.abort();
      return;
    }

    await route.continue();
  });

  await page.goto(`/projects/${projectId}/ide?panel=files`, { waitUntil: 'domcontentloaded' });

  const file = page
    .locator('.bolt-file-tree-node')
    .filter({ visible: true })
    .filter({ hasText: /^README\.md$/ });

  try {
    await expect(file).toBeVisible({ timeout: 30_000 });
  } catch (originalError) {
    try {
      console.warn(
        'README row visibility diagnostic',
        JSON.stringify(await page.evaluate(collectReadmeVisibilityDiagnostics, projectId)),
      );
    } catch {
      try {
        console.warn('README row visibility diagnostic', JSON.stringify({ diagnosticUnavailable: true }));
      } catch {
        // Telemetry must never replace the original assertion failure.
      }
    }
    throw originalError;
  }
  await file.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/panel=editor/);

  const desktop = page.locator('.monaco-editor textarea.inputarea').filter({ visible: true }).first();
  await expect(desktop).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.bolt-user-message-bubble').filter({ hasText: readyMarker }).first()).toBeVisible();

  const original = await documentValue(page);
  expect(original).toBe('# Keyboard fixture\nTab indents until navigation mode is enabled.\n');
  await desktop.focus();
  await page.keyboard.press('Control+Home');

  for (let index = 0; index < 3; index++) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.down('Shift');

  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.up('Shift');

  const originalDesktop = await desktop.elementHandle();
  expect(originalDesktop).not.toBeNull();
  await page.setViewportSize({ width: 390, height: 900 });

  const mobile = page.locator('.cm-content[contenteditable=true]').filter({ visible: true }).first();
  await expect(mobile).toBeVisible();
  await expect.poll(() => originalDesktop!.evaluate((node) => node.isConnected)).toBe(false);

  // No focus()/locator.press() after either engine handoff: native focus must survive.
  await expect(mobile).toBeFocused();
  await expect
    .poll(() => mobile.locator('.cm-line').evaluateAll((lines) => lines.map((line) => line.textContent).join('\n')))
    .toBe(original);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const selection = window.getSelection();
        const line = document.querySelector('.cm-content .cm-line');

        const lineOffset = (node: Node | null | undefined, offset: number | undefined) => {
          if (!line || !node || !line.contains(node) || offset === undefined) {
            return null;
          }

          // Syntax highlighting splits a line into text nodes; DOM offsets are node-relative.
          const prefix = document.createRange();
          prefix.setStart(line, 0);
          prefix.setEnd(node, offset);

          return prefix.toString().length;
        };

        return {
          text: selection?.toString(),
          anchor: lineOffset(selection?.anchorNode, selection?.anchorOffset),
          head: lineOffset(selection?.focusNode, selection?.focusOffset),
        };
      }),
    )
    .toEqual({ text: original.slice(3, 7), anchor: 3, head: 7 });

  const originalMobile = await mobile.elementHandle();
  expect(originalMobile).not.toBeNull();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(desktop).toBeVisible();
  await expect.poll(() => originalMobile!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(desktop).toBeFocused();
  expect(await documentValue(page)).toBe(original);

  // A native replacement proves Monaco restored the range, rather than just focus.
  await page.keyboard.insertText('ROUNDTRIP');

  const expected = `${original.slice(0, 3)}ROUNDTRIP${original.slice(7)}`;
  await expect.poll(() => documentValue(page)).toBe(expected);
  await expect(desktop).toBeFocused();
  await info.attach('editor-responsive-selection.json', {
    body: JSON.stringify({ projectId, original, expected, final: await documentValue(page) }, null, 2),
    contentType: 'application/json',
  });
});
