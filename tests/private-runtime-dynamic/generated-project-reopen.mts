import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import JSZip from 'jszip';

// Opt-in local Chromium proof. Start the disposable UI (:19871) and API (:19872)
// with PostgreSQL and local email capture, then run:
// pnpm exec tsx tests/private-runtime-dynamic/generated-project-reopen.mts
const web = 'http://127.0.0.1:19871';
const api = 'http://127.0.0.1:19872';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
try {
  const context = await browser.newContext({ serviceWorkers: 'block', locale: 'en-US' });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const version = randomUUID();
  const rule = { version, factor: 3 };
  const registration = await page.request.post(api + '/auth/register', {
    data: { name: 'Generated project fixture', email: version + '@example.test', password: 'Local-only!' + version },
  });
  expect(registration.status()).toBe(201);
  const { organization, token } = await registration.json();
  const organizationId = organization.id;
  const headers = { authorization: 'Bearer ' + token };
  await context.addCookies([{ name: 'vc_session', value: token, url: web, httpOnly: true }]);
  const prompt = `Build a Node calculator for version ${rule.version} using factor ${rule.factor}.`;
  const files = {
    'server.cjs': readFileSync(new URL('./server.cjs', import.meta.url), 'utf8').trimEnd(),
    'rule.json': JSON.stringify(rule),
    'package.json': JSON.stringify({
      name: 'dynamic-fixture',
      version: '1.0.0',
      scripts: { start: 'node server.cjs', dev: 'node server.cjs' },
    }),
  };
  const actions = Object.entries(files).map(
    ([path, content]) => `<boltAction type="file" filePath="${path}">${content}</boltAction>`,
  );
  let requests = 0;
  await page.route('**/api/chat', async (route) => {
    requests++;
    const messages = route.request().postDataJSON().messages as Array<{ role: string; content: unknown }>;
    expect(
      messages.filter((m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes(prompt)),
    ).toHaveLength(1);
    await route.fulfill({
      contentType: 'text/plain',
      headers: { 'x-vercel-ai-data-stream': 'v1' },
      body: [
        'f:' + JSON.stringify({ messageId: 'local-calculator' }),
        '0:' + JSON.stringify(`<boltArtifact id="calculator" title="Calculator">${actions.join('')}</boltArtifact>`),
        'd:' + JSON.stringify({ finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } }),
        '',
      ].join('\n'),
    });
  });

  await page.goto(web + '/projects/new?lang=en', { waitUntil: 'domcontentloaded' });
  const form = page.locator('form.vc-new-project-form');
  await form.locator('textarea[name=prompt]').fill(prompt);
  await form.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/@[^/]+\/[^/?#]+/, { timeout: 60_000 });

  const listed = await page.request.get(api + '/orgs/' + organizationId + '/projects', { headers });
  expect(listed.ok()).toBe(true);
  const { projects } = await listed.json();
  expect(projects).toHaveLength(1); // Fresh organization from this test's registration.
  const project = projects[0];
  expect(project.sourceType).toBe('ai');
  expect(decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!)).toBe(project.slug);

  // A pending proposal alone is insufficient. Inspect the persisted root files before Run.
  const assertPersisted = async () => {
    const response = await page.request.get(api + '/projects/' + project.id + '/export/zip', { headers });
    expect(response.ok()).toBe(true);
    const zip = await JSZip.loadAsync(Buffer.from((await response.json()).archive.base64, 'base64'));
    for (const [path, content] of Object.entries(files)) {
      expect((await zip.file(path)?.async('string'))?.trimEnd(), path).toBe(content);
    }
  };
  await expect(assertPersisted).toPass({ timeout: 90000 });
  expect(requests).toBe(1);
  const projectApi = api + '/projects/' + project.id;
  const chat = async () => {
    const res = await page.request.get(projectApi + '/ide-state', { headers });
    expect(res.ok()).toBe(true);
    return (await res.json()).ideState.state.chat;
  };
  const initial = await chat();
  const promptId = (initial.pendingPrompt ?? initial.consumedPrompt)?.id;
  expect(typeof promptId).toBe('string');
  const ide = page.url();
  await page.goto(web + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.goto(ide, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-chatbox textarea').first()).toBeVisible({ timeout: 60000 });
  await assertPersisted();
  // Wait for replay reconciliation, not just for the editor shell to mount.
  await expect(async () => {
    const reopened = await chat();
    expect(reopened.pendingPrompt).toBeNull();
    expect(reopened.consumedPrompt.id).toBe(promptId);
    expect(reopened.messages.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
  }).toPass({ timeout: 60_000 });
  const list = await page.request.get(api + '/orgs/' + organizationId + '/projects', { headers });
  expect(list.ok()).toBe(true);
  expect((await list.json()).projects.map((p: { id: string }) => p.id)).toEqual([project.id]);
  expect(requests).toBe(1);
  console.log(
    'PASS: one project, one simulated chat request, three persisted files after reopening',
    project.id,
    version,
  );
} finally {
  await browser.close();
}
