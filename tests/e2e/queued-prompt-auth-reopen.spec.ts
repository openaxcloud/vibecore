import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import JSZip from 'jszip';

test.use({ serviceWorkers: 'block' });

async function createQueuedProject(request: APIRequestContext, page: Page, baseURL: string) {
  const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';

  const registration = await request.post(`${api}/auth/register`, {
    data: { email: `reopen-${crypto.randomUUID()}@local.test`, password: 'Password123!', name: 'Reopen QA' },
  });
  expect(registration.ok()).toBe(true);

  const { token, organization } = await registration.json();
  const headers = { authorization: `Bearer ${token}` };
  const prompt = 'Build the synthetic reopen fixture';

  const creation = await request.post(`${api}/orgs/${organization.id}/projects/from-ai`, {
    headers,
    data: { name: 'Queued prompt reopen', prompt },
  });
  expect(creation.ok()).toBe(true);

  const { project } = await creation.json();
  const stateUrl = `${api}/projects/${project.id}/ide-state`;
  const state = async () => (await (await request.get(stateUrl, { headers })).json()).ideState.state.chat;
  const initial = (await state()).pendingPrompt;

  await page.context().addCookies([{ name: 'vc_session', value: token, url: baseURL, httpOnly: true }]);

  return { project, prompt, initial, state, api, headers };
}

test('a rejected provider key leaves the initial prompt available without replay on reopen', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const { project, prompt, initial, state } = await createQueuedProject(request, page, baseURL!);

  let requests = 0;
  await page.context().route(
    (url) => url.pathname === '/api/chat',
    async (route) => {
      requests += 1;
      await route.fulfill({
        status: 401,
        json: { message: 'Synthetic rejected provider key', statusCode: 401 },
      });
    },
  );

  await page.goto(`/projects/${project.id}/ide`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => (await state()).manualRetryPromptId, { timeout: 60_000 }).toBe(initial.id);
  expect(requests).toBe(1);
  expect((await state()).pendingPrompt.prompt).toBe(prompt);

  for (let reopen = 0; reopen < 2; reopen++) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(prompt, { exact: true }).filter({ visible: true })).toHaveCount(1, { timeout: 30_000 });
  }

  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByText(prompt, { exact: true }).filter({ visible: true })).toHaveCount(1);
});

test('stopping a queued turn keeps its prompt and reopening never dispatches it again', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const { project, prompt, initial, state } = await createQueuedProject(request, page, baseURL!);

  let requests = 0;
  await page.route('**/api/chat', () => {
    // Hold the synthetic response open until the user stops it.
    requests += 1;
  });
  await page.goto(`/projects/${project.id}/ide`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => requests, { timeout: 60_000 }).toBe(1);

  const progress = page.getByTestId('project-agent-run-status');
  await expect(progress.getByRole('status')).toBeVisible();
  await progress.getByRole('button').click();
  await expect(progress).toBeHidden();
  await expect
    .poll(async () => (await state()).consumedPrompt)
    .toMatchObject({
      id: initial.id,
      prompt,
      reason: 'cancelled',
    });
  expect((await state()).pendingPrompt).toBeNull();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(prompt, { exact: true }).filter({ visible: true })).toHaveCount(1, { timeout: 30_000 });

  const followUp = 'Describe the synthetic fixture in one sentence';
  await page.unroute('**/api/chat');
  await page.route('**/api/chat', (route) => {
    requests += 1;
    return route.fulfill({ status: 401, json: { message: 'Synthetic rejected provider key', statusCode: 401 } });
  });

  const composer = page.locator('.bolt-project-chatbox textarea');
  await composer.fill(followUp);
  await composer.press('Enter');
  await expect(page.getByText('Authentication error', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible();
  expect(requests).toBe(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(followUp, { exact: true }).filter({ visible: true })).toHaveCount(1, { timeout: 30_000 });
  expect(requests).toBe(2);
});

test('a streamed file proposal persists only the completed contents', async ({ page, request, baseURL }) => {
  test.setTimeout(90_000);

  const { project } = await createQueuedProject(request, page, baseURL!);

  const chunks = [
    '<boltArtifact id="fixture" title="Synthetic file"><boltAction type="file" filePath="fixture.txt">',
    'Synthetic first line.\n',
    'Second line.\n',
    'Last line.\n',
    '</boltAction></boltArtifact>',
  ];
  await page.addInitScript((parts) => {
    const original = window.fetch.bind(window);

    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);

      if (url.pathname !== '/api/chat') {
        return original(input, init);
      }

      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const frame = (type: string, value: unknown) =>
            controller.enqueue(encoder.encode(type + ':' + JSON.stringify(value) + '\n'));
          frame('f', { messageId: crypto.randomUUID() });

          for (const part of parts) {
            frame('0', part);
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
          frame('d', { finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } });
          controller.close();
        },
      });

      return Promise.resolve(new Response(stream, { headers: { 'x-vercel-ai-data-stream': 'v1' } }));
    };
  }, chunks);

  const writes: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && new URL(req.url()).pathname.includes('/agent-patch-proposals/')) {
      const body = req.postDataJSON();

      if (body.relativePath === 'fixture.txt' && body.status === 'pending') {
        writes.push(body.proposedContent);
      }
    }
  });
  await page.goto(`/projects/${project.id}/ide`, { waitUntil: 'domcontentloaded' });

  const complete = chunks.slice(1, -1).join('');
  await expect.poll(() => writes.includes(complete), { timeout: 60_000 }).toBe(true);
  await expect(page.getByTestId('project-agent-run-status')).toBeHidden();
  expect(writes).toEqual([complete]);
});

for (const interruption of ['stop', 'length', 'stalled restore'] as const) {
  const title =
    interruption === 'stalled restore'
      ? 'a stalled restore after truncation releases the queue for the next user prompt'
      : `a ${interruption} before file close keeps only the earlier completed file across reopen`;
  test(title, async ({ page, request, baseURL }) => {
    test.setTimeout(120_000);

    const missingMethods =
      interruption === 'stalled restore' ? ['any', 'timeout'] : [interruption === 'stop' ? 'any' : 'timeout'];
    await page.addInitScript((methods) => {
      for (const method of methods) {
        Object.defineProperty(AbortSignal, method, { configurable: true, value: undefined });
      }
    }, missingMethods);

    const { project, state, api, headers, prompt } = await createQueuedProject(request, page, baseURL!);
    const endpoint = api + '/projects/' + project.id;
    const completed = 'Completed synthetic text.\n';
    const userEdit = 'Later user revision.\n';

    const archive = async () => {
      const response = await request.get(endpoint + '/export/zip', { headers });
      expect(response.ok()).toBe(true);

      return JSZip.loadAsync(Buffer.from((await response.json()).archive.base64, 'base64'));
    };
    const readFile = async (path: string) => {
      const zip = await archive();
      const entry = Object.values(zip.files).find((file) => file.name === path || file.name.endsWith('/' + path));

      return entry?.async('string');
    };
    const openProposals = async () => {
      const response = await request.get(endpoint + '/agent-patch-proposals', { headers });
      expect(response.ok()).toBe(true);

      return (await response.json()).proposals as { relativePath: string; proposedContent: string }[];
    };

    await page.addInitScript(
      ({ text }) => {
        const original = window.fetch.bind(window);

        window.fetch = (input, init) => {
          const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;

          if (path.endsWith('/agent-patch-proposals') && sessionStorage.getItem('fixture-stall')) {
            sessionStorage.setItem('fixture-restore-started', 'yes');
            return new Promise<Response>((_, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => {
                  sessionStorage.setItem('fixture-restore-aborted', 'yes');
                  reject(init.signal?.reason);
                },
                { once: true },
              );
            });
          }

          if (path !== '/api/chat') {
            return original(input, init);
          }

          sessionStorage.setItem(
            'fixture-dispatches',
            String(Number(sessionStorage.getItem('fixture-dispatches')) + 1),
          );

          const encoder = new TextEncoder();

          const stream = new ReadableStream({
            async start(controller) {
              const frame = (type: string, value: unknown) =>
                controller.enqueue(encoder.encode(type + ':' + JSON.stringify(value) + '\n'));
              frame('f', { messageId: crypto.randomUUID() });

              if (Number(sessionStorage.getItem('fixture-dispatches')) > 1) {
                frame(
                  '0',
                  '<boltArtifact id="new" title="New file"><boltAction type="file" filePath="next.txt">New turn.\n',
                );
                await new Promise((resolve) => setTimeout(resolve, 400));
                frame('0', '</boltAction></boltArtifact>');
                await new Promise((resolve) => setTimeout(resolve, 400));
                frame('d', { finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } });
                controller.close();

                return;
              }

              frame(
                '0',
                '<boltArtifact id="fixture" title="Synthetic files"><boltAction type="file" filePath="finished.txt">' +
                  text +
                  '</boltAction><boltAction type="file" filePath="unfinished.txt">Partial first line.\n',
              );
              window.addEventListener('fixture-continue', () => frame('0', 'Partial second line.\n'), { once: true });
              window.addEventListener(
                'fixture-length',
                () => {
                  frame('d', { finishReason: 'length', usage: { promptTokens: 0, completionTokens: 0 } });
                  controller.close();
                },
                { once: true },
              );
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('Stopped', 'AbortError')),
                { once: true },
              );
            },
          });

          return Promise.resolve(new Response(stream, { headers: { 'x-vercel-ai-data-stream': 'v1' } }));
        };
      },
      { text: completed },
    );

    const writes: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PUT' && new URL(req.url()).pathname.includes('/agent-patch-proposals/')) {
        writes.push(req.postDataJSON().relativePath);
      }
    });
    await page.goto(`/projects/${project.id}/ide`, { waitUntil: 'domcontentloaded' });

    const savedContent = async (path: string) =>
      (await openProposals()).find((proposal) => proposal.relativePath === path)?.proposedContent ??
      (await readFile(path));
    await expect.poll(() => savedContent('finished.txt'), { timeout: 60_000 }).toBe(completed);
    await page.evaluate(() => window.dispatchEvent(new Event('fixture-continue')));

    await expect
      .poll(async () => JSON.stringify((await state()).messages), { timeout: 15_000 })
      .toContain('Partial second line.');

    const run = page.getByTestId('project-agent-run-status');
    await expect(run).toBeVisible();

    if (interruption === 'stop') {
      await run.getByRole('button').click();
      await expect.poll(async () => (await state()).consumedPrompt?.reason).toBe('cancelled');
    } else {
      await page.evaluate(() => window.dispatchEvent(new Event('fixture-length')));
    }

    await expect(run).toBeHidden();
    expect(writes).toContain('finished.txt');
    expect(writes).not.toContain('unfinished.txt');
    expect(await openProposals()).not.toContainEqual(expect.objectContaining({ relativePath: 'unfinished.txt' }));
    expect(await readFile('unfinished.txt')).toBeUndefined();

    expect(await savedContent('finished.txt')).toBe(completed);

    const revision = new JSZip();
    revision.file('finished.txt', userEdit);

    const updated = await request.post(endpoint + '/files/import/zip', {
      headers,
      data: { zipBase64: await revision.generateAsync({ type: 'base64' }) },
    });
    expect(updated.ok()).toBe(true);
    expect(await readFile('finished.txt')).toBe(userEdit);

    const beforeReopen = [...writes];

    const stalled = interruption === 'stalled restore';

    if (stalled) {
      await page.evaluate(() => sessionStorage.setItem('fixture-stall', 'yes'));
    }

    const hydrated = stalled
      ? undefined
      : page.waitForResponse((resp) => new URL(resp.url()).pathname.endsWith('/agent-patch-proposals') && resp.ok());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await hydrated;
    await expect(page.getByText(prompt, { exact: true }).filter({ visible: true })).toHaveCount(1);
    expect(await page.evaluate(() => sessionStorage.getItem('fixture-dispatches'))).toBe('1');
    expect(writes).toEqual(beforeReopen);
    expect(await readFile('finished.txt')).toBe(userEdit);
    expect(await readFile('unfinished.txt')).toBeUndefined();
    expect(await openProposals()).not.toContainEqual(expect.objectContaining({ relativePath: 'unfinished.txt' }));

    if (stalled) {
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('fixture-restore-started'))).toBe('yes');

      const composer = page.locator('.bolt-project-chatbox textarea');
      await composer.fill('Create the next synthetic file');
      await composer.press('Enter');
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('fixture-dispatches'))).toBe('2');
      await expect
        .poll(() => page.evaluate(() => sessionStorage.getItem('fixture-restore-aborted')), { timeout: 15_000 })
        .toBe('yes');
      await expect.poll(() => writes.includes('next.txt'), { timeout: 20_000 }).toBe(true);
      await expect.poll(async () => (await savedContent('next.txt'))?.trimEnd()).toBe('New turn.');
      expect(writes.filter((path) => path === 'finished.txt')).toEqual(
        beforeReopen.filter((path) => path === 'finished.txt'),
      );
      expect(await readFile('finished.txt')).toBe(userEdit);
    }
  });
}

for (const interveningSave of ['none', 'new bytes', 'same bytes', 'other path'] as const) {
  test(`a delayed confirmed ZIP preserves a preexisting file (intervening save: ${interveningSave})`, async ({
    page,
    request,
    baseURL,
  }) => {
    const { project, api, headers } = await createQueuedProject(request, page, baseURL!);
    const endpoint = `${api}/projects/${project.id}`;
    const path = 'finished.txt';
    const previous = 'Earlier saved file.\n';
    const accepted = 'Completed synthetic text.\n';
    const later = 'Later user revision.\n';
    const encode = (content: string, file = path) => new JSZip().file(file, content).generateAsync({ type: 'base64' });

    const save = async (content: string, file = path) => {
      const response = await request.post(endpoint + '/files/import/zip', {
        headers,
        data: { zipBase64: await encode(content, file) },
      });
      expect(response.status()).toBe(200);
    };
    const read = async (file = path) => {
      const response = await request.get(endpoint + '/export/zip', { headers });
      expect(response.status()).toBe(200);

      const zip = await JSZip.loadAsync((await response.json()).archive.base64, { base64: true });

      return zip.file(file)?.async('string');
    };
    await save(previous);
    expect(await read()).toBe(previous);

    const sourceVersion = (await (await request.get(endpoint + '/ide-state', { headers })).json()).ideState.version;
    await page.goto('/robots.txt');

    const routePath = `/api/projects/${project.id}/files/import/zip`;

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**' + routePath, async (route) => {
      await gate;
      await route.continue();
    });

    const arrival = page.waitForRequest((req) => new URL(req.url()).pathname === routePath);

    const pending = page.evaluate(
      async ({ url, body }) =>
        (
          await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        ).status,
      {
        url: routePath,
        body: { zipBase64: await encode(accepted), previousContents: { [path]: previous }, sourceVersion },
      },
    );

    try {
      await arrival;

      if (interveningSave !== 'none') {
        const saved = interveningSave === 'same bytes' ? previous : later;
        const editedPath = interveningSave === 'other path' ? 'independent.txt' : path;
        await save(saved, editedPath);
        expect(await read(editedPath)).toBe(saved);
      }
    } finally {
      release();
    }

    const concurrentEdit = interveningSave === 'same bytes' || interveningSave === 'new bytes';
    expect(await pending).toBe(concurrentEdit ? 409 : 200);
    expect(await read()).toBe(!concurrentEdit ? accepted : interveningSave === 'same bytes' ? previous : later);

    if (interveningSave === 'other path') {
      expect(await read('independent.txt')).toBe(later);
    }
  });
}
