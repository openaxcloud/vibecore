import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const evidenceDirectory = path.resolve('docs/ui-ux-evidence/2026-07-16/community-gallery/runtime');

const demoApps = [
  { id: 'react-saas', name: 'Orbit CRM' },
  { id: 'next-dashboard', name: 'Northstar Operations' },
  { id: 'fastify-api', name: 'Pulse API Monitor' },
  { id: 'ai-agent', name: 'Launchline Planner' },
  { id: 'landing-page', name: 'Kindred Booking' },
  { id: 'mobile-starter', name: 'Relay Field Service' },
] as const;

type AuthPayload = {
  token: string;
  organization: { id: string; slug: string };
};

type GalleryAppPayload = {
  id: string;
  name: string;
  previewUrl?: string;
  technologies: string[];
};

type WorkspacePayload = { id: string; projectId: string };

async function waitForApi(page: Page) {
  await expect
    .poll(
      async () => {
        try {
          return (await page.request.get(`${apiBaseUrl}/health`, { timeout: 2_000 })).ok();
        } catch {
          return false;
        }
      },
      { timeout: 60_000, message: 'The real API must be healthy before Community Gallery validation.' },
    )
    .toBe(true);
}

async function authenticate(page: Page): Promise<AuthPayload> {
  await waitForApi(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `community-gallery-functional-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Community Gallery Functional QA',
        organizationName: `Community Gallery Functional QA ${suffix}-${attempt}`,
      },
    });
    lastBody = await response.text();
    if (response.ok()) {
      const auth = JSON.parse(lastBody) as AuthPayload;
      await page
        .context()
        .addCookies([{ name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
      return auth;
    }
    if (response.status() !== 429 || attempt === 3) break;
    const retryAfter = Number(response.headers()['retry-after']);
    await new Promise((resolve) =>
      setTimeout(resolve, Number.isFinite(retryAfter) ? (retryAfter + 1) * 1_000 : 10_000),
    );
  }

  throw new Error(`Could not create the Gallery QA account: ${lastBody}`);
}

function authorization(auth: AuthPayload) {
  return { authorization: `Bearer ${auth.token}` };
}

async function openGallery(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'completed', step: 3 }));
    localStorage.setItem('vibecore-project-ide-guided-tour-v1', 'complete');
  });
  await page.goto('/dashboard/templates', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Community Gallery' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('template-gallery')).toBeVisible({ timeout: 30_000 });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
}

async function galleryApps(request: APIRequestContext): Promise<GalleryAppPayload[]> {
  const response = await request.get(`${apiBaseUrl}/gallery/apps?limit=50&sort=FEATURED`);
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return (JSON.parse(body) as { apps: GalleryAppPayload[] }).apps;
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test('discovers published applications with real thumbnails, filters, sorting, reporting and grid/list views', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openGallery(page);

  const gallery = page.getByTestId('template-gallery');
  const cards = gallery.locator('[data-testid="template-card"]');
  await expect(cards).toHaveCount(demoApps.length);

  const names = (await cards.locator('h2').allTextContents()).map((value) => value.trim());
  expect(names).toEqual(expect.arrayContaining(demoApps.map((app) => app.name)));
  expect((await cards.allTextContents()).join('\n')).not.toMatch(/\b(?:Python|Go|Rust)\b/i);

  for (const app of demoApps) {
    const card = gallery.locator(`[data-testid="template-card"][data-gallery-app-id="demo:${app.id}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('link', { name: `View ${app.name}` })).toBeVisible();
    await expect(card.getByRole('button', { name: `Remix ${app.name}` })).toBeVisible();
    await expect(card.getByRole('button', { name: `Report ${app.name}` })).toBeVisible();
    const thumbnail = card.getByTestId('template-thumbnail');
    await thumbnail.scrollIntoViewIfNeeded();
    await expect
      .poll(() => thumbnail.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
      .toBe(true);
  }

  const search = page.getByRole('searchbox', { name: 'Search published apps' });
  await search.fill('booking');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Kindred Booking');
  await page.getByRole('button', { name: 'Clear app search' }).click();
  await expect(cards).toHaveCount(demoApps.length);

  await page.getByRole('combobox', { name: 'Category' }).selectOption('sales');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Orbit CRM');
  await page.getByRole('button', { name: 'Reset filters' }).click();

  await page.getByRole('combobox', { name: 'Artifact type' }).selectOption('dashboard');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Northstar Operations');
  await page.getByRole('button', { name: 'Reset filters' }).click();

  await page.getByRole('combobox', { name: 'Technology' }).selectOption('Fastify');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Pulse API Monitor');
  await page.getByRole('button', { name: 'Reset filters' }).click();

  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('most-remixed');
  await expect(cards.first()).toContainText('Orbit CRM');
  await page.getByRole('button', { name: 'Featured only' }).click();
  await expect(page.getByRole('button', { name: 'Featured only' })).toHaveAttribute('aria-pressed', 'true');
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await cards.count()).toBeLessThan(demoApps.length);
  await page.getByRole('button', { name: 'Featured only' }).click();

  await page.getByRole('button', { name: 'List view' }).click();
  await expect(gallery).toHaveAttribute('data-view', 'list');
  await assertNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(gallery).toHaveAttribute('data-view', 'grid');

  await gallery
    .locator('[data-testid="template-card"][data-gallery-app-id="demo:fastify-api"]')
    .getByRole('button', { name: 'Report Pulse API Monitor' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Report Pulse API Monitor' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Reason' }).selectOption('SPAM');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByRole('status')).toContainText('Report sent to the moderation queue.');
});

test('every seeded application has a distinct, functional browser Preview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The complete preview matrix runs once in Chromium.');
  test.setTimeout(300_000);
  const apps = await galleryApps(page.request);
  await mkdir(evidenceDirectory, { recursive: true });

  for (const expected of demoApps) {
    const app = apps.find((candidate) => candidate.id === `demo:${expected.id}`);
    expect(app?.previewUrl, `${expected.name} must expose a Preview URL`).toBeTruthy();
    const pageErrors: string[] = [];
    const listener = (error: Error) => pageErrors.push(error.message);
    page.on('pageerror', listener);
    await page.goto(app!.previewUrl!, { waitUntil: 'networkidle' });
    await expect(page.locator(`[data-gallery-app-id="${expected.id}"]`).first()).toBeVisible();
    const probe = await page.locator('body').evaluate((body) => ({
      area: body.getBoundingClientRect().width * Math.max(body.getBoundingClientRect().height, body.scrollHeight),
      childCount: body.children.length,
      textLength: body.textContent?.replace(/\s+/g, ' ').trim().length ?? 0,
    }));
    expect(probe.childCount).toBeGreaterThan(0);
    expect(probe.area).toBeGreaterThan(40_000);
    expect(probe.textLength).toBeGreaterThan(20);
    expect(pageErrors).toEqual([]);
    await page.screenshot({
      path: path.join(evidenceDirectory, `${expected.id}-preview.png`),
      animations: 'disabled',
      fullPage: false,
    });
    page.off('pageerror', listener);
  }
});

test('View opens the application detail and renders its functional embedded Preview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The embedded Preview proof runs once in Chromium.');
  await openGallery(page);

  await page
    .locator('[data-testid="template-card"][data-gallery-app-id="demo:react-saas"]')
    .getByRole('link', { name: 'View Orbit CRM' })
    .click();

  await expect(page).toHaveURL(/\/gallery\/orbit-crm$/);
  await expect(page.getByRole('heading', { name: 'Orbit CRM' })).toBeVisible();
  const preview = page.frameLocator('iframe[title="Orbit CRM live Preview"]');
  await expect(preview.locator('[data-gallery-app-id="react-saas"]')).toBeVisible({ timeout: 30_000 });
});

test('Remix creates an isolated project that starts, renders Preview and opens publishable in the IDE', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The complete Remix runtime proof runs once in Chromium.');
  test.setTimeout(300_000);
  const auth = await authenticate(page);
  const apps = await galleryApps(page.request);
  const source = apps.find((app) => app.id === 'demo:react-saas');
  expect(source).toBeTruthy();

  const response = await page.request.post(
    `${apiBaseUrl}/organizations/${auth.organization.id}/gallery/apps/${encodeURIComponent(source!.id)}/remix`,
    {
      headers: { ...authorization(auth), 'Idempotency-Key': `e2e-remix-${Date.now()}` },
      data: { name: 'Orbit CRM Isolated E2E Remix' },
    },
  );
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  const result = JSON.parse(body) as {
    projectId: string;
    workspaceId: string;
    remix: { destinationRepositoryId: string };
  };
  expect(result.projectId).toBeTruthy();
  expect(result.workspaceId).toBeTruthy();
  expect(result.remix.destinationRepositoryId).toBe(`internal:${result.projectId}`);

  const [projectResponse, filesResponse, workspacesResponse] = await Promise.all([
    page.request.get(`${apiBaseUrl}/projects/${result.projectId}`, { headers: authorization(auth) }),
    page.request.get(`${apiBaseUrl}/projects/${result.projectId}/files`, { headers: authorization(auth) }),
    page.request.get(`${apiBaseUrl}/projects/${result.projectId}/workspaces`, { headers: authorization(auth) }),
  ]);
  expect(projectResponse.ok()).toBe(true);
  expect(filesResponse.ok()).toBe(true);
  expect(workspacesResponse.ok()).toBe(true);
  const project = (await projectResponse.json()) as {
    project: { sourceType: string; organizationId: string; slug: string };
  };
  const files = (await filesResponse.json()) as { files: Array<{ path: string; content: string }> };
  const workspaces = (await workspacesResponse.json()) as { workspaces: WorkspacePayload[] };
  expect(project.project).toMatchObject({ sourceType: 'gallery-remix', organizationId: auth.organization.id });
  expect(files.files.some((file) => file.path === 'package.json')).toBe(true);
  expect(files.files.some((file) => /^\.env(?:\.|$)/.test(file.path))).toBe(false);
  expect(files.files.map((file) => file.content).join('\n')).not.toMatch(
    /(?:api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]+/i,
  );
  expect(workspaces.workspaces.some((workspace) => workspace.id === result.workspaceId)).toBe(true);

  const boot = await page.request.post(`${apiBaseUrl}/api/runtime/workspaces`, {
    headers: authorization(auth),
    data: { projectId: result.projectId, workspaceId: result.workspaceId },
  });
  const bootBody = await boot.text();
  expect(boot.ok(), bootBody).toBeTruthy();

  const install = await page.request.post(`${apiBaseUrl}/api/runtime/workspaces/${result.workspaceId}/commands`, {
    headers: authorization(auth),
    data: {
      command: 'npm',
      args: ['install', '--no-audit', '--no-fund'],
      timeoutMs: 240_000,
    },
  });
  const installBody = await install.text();
  expect(install.ok(), installBody).toBeTruthy();
  expect(JSON.parse(installBody)).toMatchObject({ exitCode: 0, localRuntime: true });

  const previewPort =
    45_000 + (Number.parseInt(createHash('sha256').update(result.projectId).digest('hex').slice(0, 4), 16) % 1_000);
  const run = await page.request.post(`${apiBaseUrl}/api/runtime/workspaces/${result.workspaceId}/commands`, {
    headers: authorization(auth),
    data: {
      command: 'npm',
      args: [
        'run',
        'dev',
        '--',
        '--port',
        String(previewPort),
        '--base',
        `/api/runtime/workspaces/${result.workspaceId}/preview/${previewPort}/proxy/`,
      ],
      detached: true,
      readyPort: previewPort,
      timeoutMs: 60_000,
    },
  });
  const runBody = await run.text();
  expect(run.ok(), runBody).toBeTruthy();
  expect(JSON.parse(runBody)).toMatchObject({ exitCode: 0, running: true, localRuntime: true });

  await page.setExtraHTTPHeaders(authorization(auth));
  await page.goto(`${apiBaseUrl}/api/runtime/workspaces/${result.workspaceId}/preview/${previewPort}/proxy/`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('[data-gallery-app-id="react-saas"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Orbit', { exact: true })).toBeVisible();
  await page.setExtraHTTPHeaders({});

  await page.goto(`/@${auth.organization.slug}/${encodeURIComponent(project.project.slug)}`);
  await expect(page).toHaveURL(new RegExp(`/@${auth.organization.slug}/`));
  await expect(page.getByText(/Publish|Deploy/i).first()).toBeVisible({ timeout: 60_000 });
});

test('ZIP import validates first, creates a runnable project, starts its workspace and renders Preview', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The runtime proof runs once in Chromium.');
  test.setTimeout(600_000);
  const auth = await authenticate(page);
  const zip = new JSZip();
  zip.file(
    'package.json',
    `${JSON.stringify({ name: 'import-proof', private: true, type: 'module', scripts: { dev: 'node server.mjs' } }, null, 2)}\n`,
  );
  zip.file(
    'server.mjs',
    "import { createServer } from 'node:http';\nconst flag=process.argv.indexOf('--port');\nconst port=Number(flag>=0?process.argv[flag+1]:process.env.PORT||5173);\ncreateServer((_request,response)=>{response.setHeader('content-type','text/html; charset=utf-8');response.end('<main data-import-proof=\"true\"><h1>Imported application is running</h1><button>Publish ready</button></main>')}).listen(port,'0.0.0.0');\n",
  );
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const input = {
    file: {
      fileName: 'import-proof.zip',
      contentBase64: bytes.toString('base64'),
      sizeBytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      mediaType: 'application/zip',
    },
    name: 'Imported Runtime Proof',
    slug: 'imported-runtime-proof',
  };
  const headers = { ...authorization(auth), 'Idempotency-Key': `e2e-import-${Date.now()}` };
  const preflight = await page.request.post(
    `${apiBaseUrl}/organizations/${auth.organization.id}/project-imports/preflight`,
    { headers, data: { source: 'zip', input } },
  );
  const preflightBody = await preflight.text();
  expect(preflight.ok(), preflightBody).toBeTruthy();
  const ready = JSON.parse(preflightBody) as { job: { id: string; status: string; missingSecretNames: string[] } };
  expect(ready.job).toMatchObject({ status: 'READY', missingSecretNames: [] });

  const creation = await page.request.post(
    `${apiBaseUrl}/organizations/${auth.organization.id}/project-imports/${ready.job.id}/create`,
    { headers: authorization(auth), data: { input } },
  );
  const creationBody = await creation.text();
  expect(creation.ok(), creationBody).toBeTruthy();
  const created = JSON.parse(creationBody) as {
    projectId: string;
    metadata: { workspaceId: string; repositoryId: string; databaseDataCopied: boolean };
  };
  expect(created.metadata).toMatchObject({
    repositoryId: `internal:${created.projectId}`,
    databaseDataCopied: false,
  });

  const boot = await page.request.post(`${apiBaseUrl}/api/runtime/workspaces`, {
    headers: authorization(auth),
    data: { projectId: created.projectId, workspaceId: created.metadata.workspaceId },
  });
  const bootBody = await boot.text();
  expect(boot.ok(), bootBody).toBeTruthy();

  const previewPort =
    44_000 + (Number.parseInt(createHash('sha256').update(created.projectId).digest('hex').slice(0, 4), 16) % 1_000);
  const run = await page.request.post(`${apiBaseUrl}/api/runtime/workspaces/${created.metadata.workspaceId}/commands`, {
    headers: authorization(auth),
    data: {
      command: 'node',
      args: ['server.mjs', '--port', String(previewPort)],
      detached: true,
      readyPort: previewPort,
      timeoutMs: 30_000,
    },
  });
  const runBody = await run.text();
  expect(run.ok(), runBody).toBeTruthy();
  expect(JSON.parse(runBody)).toMatchObject({ exitCode: 0, running: true, localRuntime: true });

  const portsResponse = await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `${apiBaseUrl}/api/runtime/workspaces/${created.metadata.workspaceId}/ports`,
          { headers: authorization(auth) },
        );
        if (!response.ok()) return null;
        const ports = (await response.json()) as Array<{ port: number; ready: boolean; url: string }>;
        return ports.find((port) => port.ready) ?? null;
      },
      { timeout: 240_000, message: 'Imported runtime must expose a ready Preview port.' },
    )
    .not.toBeNull();
  void portsResponse;

  const ports = await page.request.get(`${apiBaseUrl}/api/runtime/workspaces/${created.metadata.workspaceId}/ports`, {
    headers: authorization(auth),
  });
  const port = ((await ports.json()) as Array<{ port: number; ready: boolean; url: string }>).find(
    (item) => item.ready,
  );
  expect(port).toBeTruthy();
  const preview = await page.request.get(port!.url.startsWith('http') ? port!.url : `${apiBaseUrl}${port!.url}`, {
    headers: authorization(auth),
  });
  const previewBody = await preview.text();
  expect(preview.ok(), previewBody).toBeTruthy();
  expect(previewBody).toContain('data-import-proof="true"');
  expect(previewBody).toContain('Imported application is running');

  await page.setExtraHTTPHeaders(authorization(auth));
  await page.goto(port!.url.startsWith('http') ? port!.url : `${apiBaseUrl}${port!.url}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('[data-import-proof="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Imported application is running' })).toBeVisible();
  await page.setExtraHTTPHeaders({});

  const projectResponse = await page.request.get(`${apiBaseUrl}/projects/${created.projectId}`, {
    headers: authorization(auth),
  });
  const projectBody = await projectResponse.text();
  expect(projectResponse.ok(), projectBody).toBeTruthy();
  const project = JSON.parse(projectBody) as { project: { slug: string } };
  await page.goto(`/@${auth.organization.slug}/${encodeURIComponent(project.project.slug)}`);
  await expect(page).toHaveURL(new RegExp(`/@${auth.organization.slug}/`));
  await expect(page.getByText(/Publish|Deploy/i).first()).toBeVisible({ timeout: 60_000 });

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, 'zip-import-runtime-proof.json'),
    `${JSON.stringify({ projectId: created.projectId, workspaceId: created.metadata.workspaceId, port: port!.port }, null, 2)}\n`,
  );
});
