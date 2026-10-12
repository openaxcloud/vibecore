import { expect, test, type PlaywrightTestArgs } from '@playwright/test';
import JSZip from 'jszip';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function openPersistedFile({ page, request, context }: Pick<PlaywrightTestArgs, 'page' | 'request' | 'context'>) {
  // The local restoration fixture never needs an external browser service.
  await context.route(
    (url) => !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
    (route) => route.abort('blockedbyclient'),
  );

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `file-tabs-${suffix}@local.test`;

  const registration = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { email, password: 'Password123!', name: 'File tab audit', organizationName: `File tabs ${suffix}` },
  });
  expect(registration.ok()).toBeTruthy();

  const auth = await registration.json();
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'File tab identity audit' },
  });
  expect(creation.ok()).toBeTruthy();

  const projectId = (await creation.json()).project.id as string;
  const zip = new JSZip();
  zip.file('audit.txt', 'PERSISTENCE-ORIGINAL-20261012\nsecond line\n');
  zip.file('other.txt', 'SECOND-DOCUMENT\n');

  const imported = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers,
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });
  expect(imported.ok()).toBeTruthy();

  /*
   * In remote mode, exercise persisted files with an unavailable runtime.
   * The local audit builds VITE_RUNTIME_MODE=remote-kubernetes and configures
   * no workspace manager; these aborts never substitute successful responses.
   */
  await context.route(/\/api\/(runtime|runtime-token|chat)(\/|\?|$)/, (route) => route.abort('blockedbyclient'));
  await context.routeWebSocket('**/*', (socket) => socket.close());

  // This restoration test reads imported files and does not exercise Save.
  await context.route(/\/api\/projects\/[^/]+\/files(?:\/|\?|$)/, (route) =>
    route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient'),
  );
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Password123!');
  await page.locator('button[type=submit]').click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await page.goto(`/projects/${projectId}/ide?panel=files`);

  const file = (name: string) =>
    page.getByText(name, { exact: true }).and(page.locator('.bolt-file-tree-name')).filter({ visible: true });

  await expect(page.locator('.monaco-editor .view-lines')).toContainText('File tab identity audit', {
    timeout: 10_000,
  });
  await file('audit.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('PERSISTENCE-ORIGINAL-20261012', {
    timeout: 10_000,
  });

  const createOtherProject = async () => {
    const created = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
      headers,
      data: { name: 'Selection project B' },
    });
    expect(created.ok()).toBeTruthy();

    const id = (await created.json()).project.id as string;
    const archive = new JSZip();
    archive.file('project-b.txt', 'PROJECT-B-DOCUMENT');

    const imported = await request.post(`${apiBaseUrl}/projects/${id}/files/import/zip`, {
      headers,
      data: { zipBase64: await archive.generateAsync({ type: 'base64' }) },
    });
    expect(imported.ok()).toBeTruthy();

    return id;
  };

  const replaceFixtureFiles = async (files: Record<string, string>) => {
    const zip = new JSZip();

    for (const [name, content] of Object.entries(files)) {
      zip.file(name, content);
    }

    const response = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
      headers,
      data: { zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true },
    });
    expect(response.ok()).toBe(true);
  };

  return { projectId, file, createOtherProject, replaceFixtureFiles };
}

/*
 * The saved file is a precondition: this case isolates restoration after a
 * route remount from a selection made immediately before leaving the page.
 */
for (const width of [768, 390]) {
  test(`restores the selected mobile file through locale, Back, Forward and reload at ${width}px`, async ({
    page,
    request,
    context,
  }, testInfo) => {
    test.setTimeout(90_000);

    const { projectId } = await openPersistedFile({ page, request, context });
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('tab-editor').click();

    const editor = page.locator('.cm-content');
    const assertDocument = () => expect(editor).toContainText('PERSISTENCE-ORIGINAL-20261012', { timeout: 10000 });
    await assertDocument();
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const raw = localStorage.getItem(`vibecore.projectIdeMemory:${id}`);
          return raw ? JSON.parse(raw).ui?.selectedFile : undefined;
        }, projectId),
      )
      .toBe('/home/project/audit.txt');

    const localized = new URL(page.url());
    localized.searchParams.set('lang', 'fr');
    await page.goto(localized.toString());
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await assertDocument();
    await page.screenshot({ path: testInfo.outputPath('locale.png') });

    await page.getByTestId('button-back').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goBack();
    await expect(page.getByTestId('mobile-ide-header')).toBeVisible();
    await assertDocument();
    await page.screenshot({ path: testInfo.outputPath('back.png') });

    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goBack();
    await expect(page.getByTestId('mobile-ide-header')).toBeVisible();
    await assertDocument();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await assertDocument();
    await page.screenshot({ path: testInfo.outputPath('reload.png') });
  });
}

for (const width of [768, 390]) {
  test(`immediate locale after selecting audit at ${width}`, async ({ page, request, context }, testInfo) => {
    test.setTimeout(90_000);

    const { file, projectId } = await openPersistedFile({ page, request, context });
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('tab-editor').click();
    await expect(page.locator('.cm-content')).toContainText('PERSISTENCE-ORIGINAL-20261012');

    const choose = async (name: string) => {
      await page.getByTestId('mobile-ide-header').getByTestId('button-more').click();
      await page.getByTestId('mobile-more-menu-files').click();
      await file(name).click();
    };
    await choose('other.txt');
    await expect(page.locator('.cm-content')).toContainText('SECOND-DOCUMENT');
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const raw = localStorage.getItem(`vibecore.projectIdeMemory:${id}`);
          return raw ? JSON.parse(raw).ui?.selectedFile : undefined;
        }, projectId),
      )
      .toBe('/home/project/other.txt');
    await choose('audit.txt');

    const localized = new URL(page.url());
    localized.searchParams.set('lang', 'fr');
    await page.goto(localized.toString());
    await expect(page.getByTestId('mobile-ide-header')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('PERSISTENCE-ORIGINAL-20261012', { timeout: 10000 });
    await page.screenshot({ path: testInfo.outputPath('immediate-locale.png') });
  });
}

test('restores the mobile file after leaving during archive hydration', async ({
  page,
  request,
  context,
}, testInfo) => {
  test.setTimeout(90_000);

  const { projectId } = await openPersistedFile({ page, request, context });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByTestId('tab-editor').click();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const raw = localStorage.getItem(`vibecore.projectIdeMemory:${id}`);
        return raw ? JSON.parse(raw).ui?.selectedFile : undefined;
      }, projectId),
    )
    .toBe('/home/project/audit.txt');
  await page.getByTestId('button-back').click();
  await expect(page).toHaveURL(/\/dashboard/);

  let release!: () => void;
  let requested!: () => void;

  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });

  let intercepted = false;
  await context.route(`**/api/projects/${projectId}/export/zip`, async (route) => {
    if (intercepted) {
      await route.continue();
      return;
    }

    intercepted = true;

    const response = await route.fetch();
    requested();
    await held;
    await route.fulfill({ response });
  });

  try {
    await page.goBack();
    await started;
    await expect(page.getByTestId('mobile-ide-header')).toBeVisible();
    await page.getByTestId('button-back').click();
    await expect(page).toHaveURL(/\/dashboard/);

    const finished = page.waitForResponse((response) => response.url().endsWith(`/projects/${projectId}/export/zip`));
    release();
    await finished;
    await page.goBack();
    await expect(page.getByTestId('mobile-ide-header')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('PERSISTENCE-ORIGINAL-20261012', { timeout: 10000 });
    await page.screenshot({ path: testInfo.outputPath('interruption-restored.png') });
  } finally {
    release();
  }
});

test('does not persist project A selection into project B during a client route change', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(90_000);

  const { projectId: projectA, file, createOtherProject } = await openPersistedFile({ page, request, context });
  const projectB = await createOtherProject();
  await page.goto(`/projects/${projectB}/ide?panel=files`);
  await file('project-b.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('PROJECT-B-DOCUMENT');

  const saved = (id: string) =>
    page.evaluate((id) => {
      const raw = localStorage.getItem(`vibecore.projectIdeMemory:${id}`);
      return raw ? JSON.parse(raw).ui?.selectedFile : undefined;
    }, id);
  await expect.poll(() => saved(projectB)).toBe('/home/project/project-b.txt');
  await page.goto(`/projects/${projectA}/ide?panel=files`);
  await file('audit.txt').click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByTestId('tab-editor').click();
  await expect.poll(() => saved(projectA)).toBe('/home/project/audit.txt');

  /*
   * Replay a browser history transition on the live router, without reloading
   * the document or first unmounting the IDE through the dashboard route.
   */
  await page.evaluate((id) => {
    (window as Window & { selectionTestDocument?: boolean }).selectionTestDocument = true;
    history.pushState(history.state, '', `/projects/${id}/ide?panel=editor`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, projectB);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectB}/ide`));
  await expect(page.locator('.cm-content')).toContainText('PROJECT-B-DOCUMENT', { timeout: 10000 });
  await expect.poll(() => saved(projectB)).toBe('/home/project/project-b.txt');
  expect(
    await page.evaluate(() => (window as Window & { selectionTestDocument?: boolean }).selectionTestDocument),
  ).toBe(true);
  expect(await saved(projectA)).toBe('/home/project/audit.txt');
});

test('a late project A memory response does not write its selection into project B', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(90_000);

  const { projectId: projectA, file, createOtherProject } = await openPersistedFile({ page, request, context });
  const projectB = await createOtherProject();
  await page.goto(`/projects/${projectB}/ide?panel=files`);
  await file('project-b.txt').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('PROJECT-B-DOCUMENT');
  await page.goto(`/projects/${projectA}/ide?panel=files`);
  await file('audit.txt').click();

  let release!: () => void;
  let requested!: () => void;
  let delivered!: () => void;

  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  await context.route(`**/api/projects/${projectA}/ide-state`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    requested();
    await held;

    try {
      await route.fulfill({ response });
    } finally {
      delivered();
    }
  });

  const writesToB: Array<string | undefined> = [];
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === `/api/projects/${projectB}/ide-state`) {
      writesToB.push(outgoing.postDataJSON()?.state?.ui?.selectedFile);
    }
  });

  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await started;
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate((id) => {
      history.pushState(history.state, '', `/projects/${id}/ide?panel=editor`);
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    }, projectB);
    await expect(page.locator('.cm-content')).toContainText('PROJECT-B-DOCUMENT', { timeout: 10000 });
    release();
    await finished;
    await expect
      .poll(() =>
        page.evaluate(
          (id) => JSON.parse(localStorage.getItem(`vibecore.projectIdeMemory:${id}`) ?? '{}').ui?.selectedFile,
          projectB,
        ),
      )
      .toBe('/home/project/project-b.txt');
    await expect.poll(() => writesToB.filter(Boolean).length).toBeGreaterThan(0);
    expect(writesToB.filter(Boolean)).not.toContain('/home/project/audit.txt');
    await expect(page.locator('.cm-content')).toContainText('PROJECT-B-DOCUMENT');
  } finally {
    release();
  }
});

for (const explicitChoice of [false, true]) {
  test(`preserves pending audit through temporary README; explicit choice ${explicitChoice}`, async ({
    page,
    request,
    context,
  }, testInfo) => {
    test.setTimeout(90000);

    const { projectId, file, replaceFixtureFiles } = await openPersistedFile({ page, request, context });

    const saved = () =>
      page.evaluate(
        (id) => JSON.parse(localStorage.getItem(`vibecore.projectIdeMemory:${id}`) ?? '{}').ui?.selectedFile,
        projectId,
      );
    await expect.poll(saved).toBe('/home/project/audit.txt');
    await page.goto('/dashboard');

    // Real archive of a synthetic project in an intermediate state, not a mocked successful service.
    await replaceFixtureFiles({ 'README.md': 'TEMPORARY-README', 'other.txt': 'SECOND-DOCUMENT' });
    await page.setViewportSize({ width: 390, height: 900 });

    const persisted = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname === `/api/projects/${projectId}/ide-state` &&
        Boolean(r.request().postDataJSON()?.state?.ui?.selectedFile),
    );
    await page.goto(`/projects/${projectId}/ide?panel=editor`);
    await expect(page.locator('.cm-content')).toContainText('TEMPORARY-README');
    await persisted;
    await expect.poll(saved).toBe('/home/project/audit.txt');

    if (explicitChoice) {
      await page.getByTestId('mobile-ide-header').getByTestId('button-more').click();
      await page.getByTestId('mobile-more-menu-files').click();
      await file('other.txt').click();
      await expect(page.locator('.cm-content')).toContainText('SECOND-DOCUMENT');
      await expect.poll(saved).toBe('/home/project/other.txt');
    }

    await replaceFixtureFiles({
      'README.md': 'TEMPORARY-README',
      'other.txt': 'SECOND-DOCUMENT',
      'audit.txt': 'PERSISTENCE-ORIGINAL-20261012',
    });
    await page.reload();
    await expect(page.locator('.cm-content')).toContainText(
      explicitChoice ? 'SECOND-DOCUMENT' : 'PERSISTENCE-ORIGINAL-20261012',
    );
    await expect.poll(saved).toBe(explicitChoice ? '/home/project/other.txt' : '/home/project/audit.txt');
    await page.screenshot({ path: testInfo.outputPath('pending-selection-restored.png') });
  });
}
