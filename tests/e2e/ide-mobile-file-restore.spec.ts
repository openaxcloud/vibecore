import { expect, type PlaywrightTestArgs } from '@playwright/test';
import JSZip from 'jszip';
import { test } from './diagnostics/mobile-navigation.js';

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
  mobileNavigationDiagnostics,
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
  mobileNavigationDiagnostics.mark('first-back');
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
    mobileNavigationDiagnostics.mark('archive-held');
    requested();
    await held;
    await route.fulfill({ response });
  });

  try {
    mobileNavigationDiagnostics.mark('history-back-to-ide');
    await page.goBack();
    await started;
    await expect(page.getByTestId('mobile-ide-header')).toBeVisible();
    mobileNavigationDiagnostics.mark('second-back');
    await page.getByTestId('button-back').click();
    await expect(page).toHaveURL(/\/dashboard/);

    const finished = page.waitForResponse((response) => response.url().endsWith(`/projects/${projectId}/export/zip`));
    mobileNavigationDiagnostics.mark('release-archive');
    release();
    await finished;
    await page.goBack();
    await expect(page.getByTestId('mobile-ide-header')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('PERSISTENCE-ORIGINAL-20261012', { timeout: 10000 });
    await page.screenshot({ path: testInfo.outputPath('interruption-restored.png') });
  } finally {
    mobileNavigationDiagnostics.mark('release-archive');
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

  let deliveredResponses = 0;

  await page.exposeFunction('__holdDecodedProjectMemory', async () => {
    requested();
    await held;
    deliveredResponses += 1;
    delivered();
  });

  /*
   * Retain only the first real decoded GET response. Holding fetch itself can
   * trigger its five-second abort and let this test pass without any delivery.
   * The HTTP response, parsing errors and all later requests remain unchanged.
   */
  await page.addInitScript((projectId) => {
    const originalFetch = window.fetch;
    const observed = window as typeof window & { __lateProjectMemoryWrites: number };
    const originalSetItem = Storage.prototype.setItem;

    let released = false;
    let reserved = false;
    observed.__lateProjectMemoryWrites = 0;

    Storage.prototype.setItem = function (key, value) {
      originalSetItem.call(this, key, value);

      if (released && this === localStorage && key === `vibecore.projectIdeMemory:${projectId}`) {
        observed.__lateProjectMemoryWrites += 1;
      }
    };

    window.fetch = async (...args) => {
      const input = args[0];

      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        location.href,
      );

      const method = args[1]?.method ?? (input instanceof Request ? input.method : 'GET');

      const retain =
        !reserved &&
        method.toUpperCase() === 'GET' &&
        url.origin === location.origin &&
        url.pathname === `/api/projects/${projectId}/ide-state`;

      if (retain) {
        reserved = true;
      }

      const response = await originalFetch.apply(window, args);

      if (retain) {
        const decode = response.json.bind(response);

        response.json = async () => {
          const payload = await decode();
          await (
            window as typeof window & { __holdDecodedProjectMemory: () => Promise<void> }
          ).__holdDecodedProjectMemory();
          released = true;

          return payload;
        };
      }

      return response;
    };
  }, projectA);

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
    expect(deliveredResponses).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { __lateProjectMemoryWrites: number }).__lateProjectMemoryWrites,
        ),
      )
      .toBeGreaterThan(0);
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

for (const width of [390, 768]) {
  test(`explicit provisional README then immediate Back at ${width}`, async ({ page, request, context }, info) => {
    test.setTimeout(90000);

    const { projectId, file, replaceFixtureFiles } = await openPersistedFile({ page, request, context });

    const saved = () =>
      page.evaluate(
        (id) => JSON.parse(localStorage.getItem(`vibecore.projectIdeMemory:${id}`) ?? '{}').ui?.selectedFile,
        projectId,
      );
    await expect.poll(saved).toBe('/home/project/audit.txt');
    await page.goto('/dashboard');
    await replaceFixtureFiles({ 'README.md': 'TEMPORARY-README', 'other.txt': 'SECOND-DOCUMENT' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/projects/${projectId}/ide?panel=editor`);
    await expect(page.locator('.cm-content')).toContainText('TEMPORARY-README');
    await expect.poll(saved).toBe('/home/project/audit.txt');
    await page.getByTestId('mobile-ide-header').getByTestId('button-more').click();
    await page.getByTestId('mobile-more-menu-files').click();
    await file('README.md').click();
    await page.getByTestId('button-back').click();
    await expect(page).toHaveURL(/\/dashboard/);

    const afterExit = await saved();
    await replaceFixtureFiles({
      'README.md': 'TEMPORARY-README',
      'other.txt': 'SECOND-DOCUMENT',
      'audit.txt': 'PERSISTENCE-ORIGINAL-20261012',
    });
    await page.goBack();
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.screenshot({ path: info.outputPath('after-return.png') });
    await info.attach('selection-observation', {
      body: JSON.stringify({
        width,
        afterExit,
        afterReturn: await saved(),
        content: await page.locator('.cm-content').textContent(),
      }),
      contentType: 'application/json',
    });
    await expect(page.locator('.cm-content')).toContainText('TEMPORARY-README');
    await expect.poll(saved).toBe('/home/project/README.md');
    expect(afterExit, 'explicit choice is already persisted when leaving').toBe('/home/project/README.md');
  });
}

for (const width of [390, 768]) {
  test(`explicit provisional README stays in project A after switching to B at ${width}`, async ({
    page,
    request,
    context,
    mobileNavigationDiagnostics,
  }, info) => {
    test.setTimeout(90000);

    const { projectId, file, createOtherProject, replaceFixtureFiles } = await openPersistedFile({
      page,
      request,
      context,
    });

    const projectB = await createOtherProject();

    const saved = (id: string) =>
      page.evaluate(
        (project) => JSON.parse(localStorage.getItem(`vibecore.projectIdeMemory:${project}`) ?? '{}').ui?.selectedFile,
        id,
      );
    await expect.poll(() => saved(projectId)).toBe('/home/project/audit.txt');
    await page.goto(`/projects/${projectB}/ide?panel=files`);
    await file('project-b.txt').click();
    await expect.poll(() => saved(projectB)).toBe('/home/project/project-b.txt');
    await page.goto('/dashboard');
    await replaceFixtureFiles({ 'README.md': 'TEMPORARY-README', 'other.txt': 'SECOND-DOCUMENT' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/projects/${projectId}/ide?panel=editor`);
    await expect(page.locator('.cm-content')).toContainText('TEMPORARY-README');
    await expect.poll(() => saved(projectId)).toBe('/home/project/audit.txt');

    const writesToB: Array<string | undefined> = [];
    page.on('request', (outgoing) => {
      if (outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === `/api/projects/${projectB}/ide-state`) {
        writesToB.push(outgoing.postDataJSON()?.state?.ui?.selectedFile);
      }
    });
    await page.getByTestId('mobile-ide-header').getByTestId('button-more').click();
    await page.getByTestId('mobile-more-menu-files').click();
    await file('README.md').click();

    // Same-document navigation exercises the project scope guard without a page reload.
    await page.evaluate((id) => {
      history.pushState(history.state, '', `/projects/${id}/ide?panel=editor`);
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    }, projectB);
    await expect(page.locator('.cm-content')).toContainText('PROJECT-B-DOCUMENT');
    await expect.poll(() => saved(projectId)).toBe('/home/project/README.md');
    await expect.poll(() => saved(projectB)).toBe('/home/project/project-b.txt');
    await expect.poll(() => writesToB.filter(Boolean).length).toBeGreaterThan(0);
    expect(writesToB.filter(Boolean)).not.toContain('/home/project/README.md');
    expect(writesToB.filter(Boolean)).not.toContain('/home/project/audit.txt');
    await replaceFixtureFiles({
      'README.md': 'TEMPORARY-README',
      'other.txt': 'SECOND-DOCUMENT',
      'audit.txt': 'PERSISTENCE-ORIGINAL-20261012',
    });
    mobileNavigationDiagnostics.mark('return-to-project-A');
    await page.goBack();
    await expect(page.locator('.cm-content')).toContainText('TEMPORARY-README');
    mobileNavigationDiagnostics.mark('project-A-content-visible');
    await expect.poll(() => saved(projectId)).toBe('/home/project/README.md');
    await page.screenshot({ path: info.outputPath('readme-after-project-switch.png') });
  });
}

test('project A never displays project B while its archive is pending at 768', async ({
  page,
  request,
  context,
  mobileNavigationDiagnostics,
}, info) => {
  test.setTimeout(90000);

  const { projectId, file, createOtherProject, replaceFixtureFiles } = await openPersistedFile({
    page,
    request,
    context,
  });

  const projectB = await createOtherProject();

  const saved = (id: string) =>
    page.evaluate(
      (project) => JSON.parse(localStorage.getItem(`vibecore.projectIdeMemory:${project}`) ?? '{}').ui?.selectedFile,
      id,
    );
  await expect.poll(() => saved(projectId)).toBe('/home/project/audit.txt');
  await page.goto(`/projects/${projectB}/ide?panel=files`);
  await file('project-b.txt').click();
  await expect.poll(() => saved(projectB)).toBe('/home/project/project-b.txt');
  await page.goto('/dashboard');
  await replaceFixtureFiles({ 'README.md': 'TEMPORARY-README', 'other.txt': 'SECOND-DOCUMENT' });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(`/projects/${projectId}/ide?panel=editor`);
  await expect(page.locator('.cm-content')).toContainText('TEMPORARY-README');
  await expect.poll(() => saved(projectId)).toBe('/home/project/audit.txt');

  const writesToB: Array<string | undefined> = [];
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === `/api/projects/${projectB}/ide-state`) {
      writesToB.push(outgoing.postDataJSON()?.state?.ui?.selectedFile);
    }
  });
  await page.getByTestId('mobile-ide-header').getByTestId('button-more').click();
  await page.getByTestId('mobile-more-menu-files').click();
  await file('README.md').click();

  // Same-document navigation exercises the project scope guard without a page reload.
  await page.evaluate((id) => {
    history.pushState(history.state, '', `/projects/${id}/ide?panel=editor`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, projectB);
  await expect(page.locator('.cm-content')).toContainText('PROJECT-B-DOCUMENT');
  await expect.poll(() => saved(projectId)).toBe('/home/project/README.md');
  await expect.poll(() => saved(projectB)).toBe('/home/project/project-b.txt');
  await expect.poll(() => writesToB.filter(Boolean).length).toBeGreaterThan(0);
  expect(writesToB.filter(Boolean)).not.toContain('/home/project/README.md');
  expect(writesToB.filter(Boolean)).not.toContain('/home/project/audit.txt');
  await replaceFixtureFiles({
    'README.md': 'TEMPORARY-README',
    'other.txt': 'SECOND-DOCUMENT',
    'audit.txt': 'PERSISTENCE-ORIGINAL-20261012',
  });

  let release!: () => void;
  let observed!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    observed = resolve;
  });

  const archivePath = `/api/projects/${projectId}/export/zip`;

  // Retain the real request, not a fabricated archive or error response.
  await page.route(
    (url) => url.pathname === archivePath,
    async (route) => {
      observed();
      await gate;
      await route.continue();
    },
  );

  try {
    mobileNavigationDiagnostics.mark('return-to-project-A-with-pending-archive');
    await page.goBack();
    await seen;

    /*
     * The address bar changes on POP before React Router commits the loader.
     * Assert isolation only after A is applied, while its archive is still held.
     */
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const router = (
            window as typeof window & {
              __reactRouterDataRouter?: {
                state: { location: { pathname: string }; navigation: { state: string } };
              };
            }
          ).__reactRouterDataRouter?.state;
          return {
            projectApplied: router?.location.pathname === `/projects/${id}/ide`,
            navigation: router?.navigation.state,
          };
        }, projectId),
      )
      .toEqual({ projectApplied: true, navigation: 'idle' });

    await page.screenshot({ path: info.outputPath('project-A-archive-pending.png') });
    await expect(
      page.locator('.cm-content').filter({
        hasText: /PROJECT-B-DOCUMENT|# Selection project B/,
      }),
    ).toHaveCount(0);
    mobileNavigationDiagnostics.mark('project-A-isolated-before-archive');

    const archiveResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === archivePath && response.request().method() === 'GET',
    );
    release();

    const response = await archiveResponse;
    expect(response.status()).toBe(200);
    await response.finished();
    await info.attach('project-A-archive-response', {
      contentType: 'application/json',
      body: JSON.stringify({ status: response.status() }),
    });

    await expect(page.locator('.cm-content')).toContainText('TEMPORARY-README');
    await expect.poll(() => saved(projectId)).toBe('/home/project/README.md');
    await expect.poll(() => saved(projectB)).toBe('/home/project/project-b.txt');
    mobileNavigationDiagnostics.mark('project-A-content-visible');
    await page.screenshot({ path: info.outputPath('project-A-archive-loaded.png') });
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

for (const width of [390, 768]) {
  test(`file choice cancels a pending files navigation at ${width}`, async ({ page, request, context }, testInfo) => {
    test.setTimeout(90000);

    const { projectId, file } = await openPersistedFile({ page, request, context });
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('tab-editor').click();
    await expect(page.locator('.cm-content')).toContainText('PERSISTENCE-ORIGINAL-20261012');

    let release!: () => void;
    let reached!: () => void;

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const arrived = new Promise<void>((resolve) => {
      reached = resolve;
    });
    await page.route(
      (url) => url.pathname === `/projects/${projectId}/ide.data` && url.searchParams.get('panel') === 'files',
      async (route) => {
        const response = await route.fetch();
        reached();
        await held;

        if (route.request().failure()?.errorText === 'net::ERR_ABORTED') {
          return;
        }

        await route.fulfill({ response }).catch((error) => {
          if (route.request().failure()?.errorText !== 'net::ERR_ABORTED') {
            throw error;
          }
        });
      },
    );

    try {
      await page.getByTestId('mobile-ide-header').getByTestId('button-more').click();
      await page.getByTestId('mobile-more-menu-files').click();
      await arrived;
      await file('other.txt').click();
      release();

      // Wait for router settlement after the gesture, never before the file choice.
      await page.waitForFunction(() => {
        const router = (
          window as typeof window & {
            __reactRouterDataRouter?: { state: { navigation: { state: string } } };
          }
        ).__reactRouterDataRouter;
        return router?.state.navigation.state === 'idle';
      });
      await expect(page.locator('.cm-content')).toContainText('SECOND-DOCUMENT');
      await expect(page).toHaveURL(/panel=editor/);

      let reloads = 0;
      page.on('request', (outgoing) => {
        if (new URL(outgoing.url()).pathname === `/projects/${projectId}/ide.data`) {
          reloads++;
        }
      });
      await page.getByTestId('tab-editor').click();

      // Bounded observation of a re-click that must not issue a loader request.
      await page.waitForTimeout(250);
      expect(reloads).toBe(0);
      await expect(page.locator('.cm-content')).toContainText('SECOND-DOCUMENT');
      await page.screenshot({ path: testInfo.outputPath('navigation-settled.png') });
    } finally {
      release();
    }
  });
}
