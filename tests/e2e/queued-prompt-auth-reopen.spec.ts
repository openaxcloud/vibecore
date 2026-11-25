import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('a rejected provider key leaves the initial prompt available without replay on reopen', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);

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

  let requests = 0;
  await page.context().addCookies([{ name: 'vc_session', value: token, url: baseURL!, httpOnly: true }]);
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
