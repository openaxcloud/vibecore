import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('a completed manual turn survives immediate reload after stopping and reopening a project', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';

  const registration = await request.post(api + '/auth/register', {
    data: { email: `manual-${crypto.randomUUID()}@local.test`, password: 'Password123!', name: 'Manual QA' },
  });
  expect(registration.ok()).toBe(true);

  const { token, organization } = await registration.json();
  const headers = { authorization: 'Bearer ' + token };

  const creation = await request.post(`${api}/orgs/${organization.id}/projects`, {
    headers,
    data: { name: 'Manual transcript proof' },
  });
  expect(creation.ok()).toBe(true);

  const { project } = await creation.json();

  // A restored greeting appears only after the live composer replaces the loading shell.
  const greeting = 'Synthetic project ready';

  const seeded = await request.put(`${api}/projects/${project.id}/ide-state`, {
    headers,
    data: { state: { chat: { messages: [{ id: 'welcome', role: 'assistant', content: greeting }] } } },
  });
  expect(seeded.ok()).toBe(true);
  await page.context().addCookies([{ name: 'vc_session', value: token, url: baseURL!, httpOnly: true }]);

  const first = 'Describe the first synthetic file';
  const second = 'Describe the second synthetic file';
  await page.addInitScript((secondPrompt) => {
    const original = window.fetch.bind(window);
    const reopened = sessionStorage.getItem('manual-turns') === '1';

    let releaseSave!: () => void;

    const leaving = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    window.addEventListener('pagehide', releaseSave, { once: true });

    window.fetch = (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;

      /*
       * Deliver the existing transcript to the real API, but keep its acknowledgement
       * in flight until navigation. The next turn must survive that ordering.
       */
      if (reopened && path.includes('/api/projects/') && path.endsWith('/ide-state') && init?.method === 'PUT') {
        const saved = JSON.parse(String(init.body)).state?.chat?.messages;

        if (
          saved?.some((m: { role: string }) => m.role === 'user') &&
          !saved.some((m: { content: string }) => m.content.includes(secondPrompt))
        ) {
          return original(input, init).then(async (response) => {
            sessionStorage.setItem('manual-save-held', 'yes');
            await leaving;

            return response;
          });
        }
      }

      if (path !== '/api/chat') {
        return original(input, init);
      }

      const turn = Number(sessionStorage.getItem('manual-turns') ?? 0) + 1;
      sessionStorage.setItem('manual-turns', String(turn));

      const stream = new ReadableStream({
        start(controller) {
          const frame = (type: string, value: unknown) =>
            controller.enqueue(new TextEncoder().encode(type + ':' + JSON.stringify(value) + '\n'));
          frame('f', { messageId: crypto.randomUUID() });
          frame('0', turn === 1 ? 'First reply in progress' : 'Second reply complete');

          if (turn === 1) {
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Stopped', 'AbortError')), {
              once: true,
            });
          } else {
            frame('8', [
              {
                type: 'streamTerminal',
                status: 'complete',
                reason: 'finished',
                finishReason: 'stop',
                segments: 1,
                fileActions: 0,
                openActions: 0,
                openArtifacts: 0,
              },
            ]);
            frame('d', { finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } });
            controller.close();
          }
        },
      });

      return Promise.resolve(new Response(stream, { headers: { 'x-vercel-ai-data-stream': 'v1' } }));
    };
  }, second);

  const composer = page.locator('.bolt-project-chatbox textarea');

  const send = async (prompt: string) => {
    await composer.fill(prompt);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
  };

  const history = page.getByRole('log');

  await page.goto(`/projects/${project.id}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(history.getByText(greeting, { exact: true })).toBeVisible({ timeout: 30000 });
  await send(first);
  await expect(history.getByText('First reply in progress', { exact: true })).toBeVisible({ timeout: 30_000 });

  const stop = page.getByRole('button', { name: 'Stop generation', exact: true });
  await stop.click();
  await expect(stop).toBeHidden();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(history.getByText(greeting, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(history.getByText(first, { exact: true })).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('manual-save-held')), { timeout: 15000 })
    .toBe('yes');
  await send(second);
  await expect(history.getByText('Second reply complete', { exact: true })).toBeVisible();
  await expect(stop).toBeHidden();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(history.getByText(greeting, { exact: true })).toBeVisible({ timeout: 30_000 });

  for (const text of [first, second, 'Second reply complete']) {
    await expect(history.getByText(text, { exact: true })).toHaveCount(1);
  }
  expect(await page.evaluate(() => sessionStorage.getItem('manual-turns'))).toBe('2');

  // Inspect the real API only after the immediate reload and UI assertions.
  const endpoint = `${api}/projects/${project.id}`;

  const messageCounts = (messages: { role: string; content: string }[]) =>
    [
      [first, 'user'],
      [second, 'user'],
      ['Second reply complete', 'assistant'],
    ].map(
      ([text, role]) => messages.filter((message) => message.role === role && message.content.includes(text)).length,
    );
  await expect
    .poll(async () => {
      const state = await request.get(endpoint + '/ide-state', { headers });
      expect(state.ok()).toBe(true);

      const chat = (await state.json()).ideState.state.chat;

      if (!chat?.metadata?.aiConversationId) {
        return [];
      }

      const stored = await request.get(endpoint + '/ai/conversations/' + chat.metadata.aiConversationId + '/messages', {
        headers,
      });
      expect(stored.ok()).toBe(true);

      return [messageCounts(chat.messages), messageCounts((await stored.json()).messages)];
    })
    .toEqual([
      [1, 1, 1],
      [1, 1, 1],
    ]);
});
