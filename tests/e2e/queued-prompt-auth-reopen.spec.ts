import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

  return { project, prompt, initial, state };
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
