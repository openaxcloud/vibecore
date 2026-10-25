import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test';
import { createDatabaseClient } from '@vibecore/database';
import { KubectlWorkspaceK8sClient } from 'packages/k8s-client/src/index';
import { buildApiApp } from 'services/api/src/app';
import { buildWorkspaceAgentApp } from 'services/workspace-agent/src/app';
import { buildWorkspaceManagerApp } from 'services/workspace-manager/src/app';
import { JsonWorkspaceStore, StructuredLogEventBus, WorkspaceManager } from 'services/workspace-manager/src/manager';
import { afterAll, beforeAll, expect, test } from 'vitest';

/*
 * Explicit opt-in recipe: compiled web → HTTP BFF → authenticated API/RBAC →
 * dedicated PostgreSQL → real workspace agent/Node Inspector. No route stubs.
 */
let api: Awaited<ReturnType<typeof buildApiApp>>;
let agent: ReturnType<typeof buildWorkspaceAgentApp>;
let managerApp: ReturnType<typeof buildWorkspaceManagerApp>;
let db: ReturnType<typeof createDatabaseClient>;
let web: ChildProcess;
let browser: Browser;
let page: Page;
let root: string;
let apiUrl: string;
let projectId: string;
let workspaceId: string;
let token: string;
let sessionId: string | undefined;

const appUrl = 'http://127.0.0.1:55442';
const sourceFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const webLogs: string[] = [];
const browserErrors: string[] = [];
const browserConsoleErrors: string[] = [];
const failedHttp: string[] = [];
const blockedExternalRequests: string[] = [];
const artifactDirectory = process.env.DEBUGGER_BROWSER_ARTIFACT_DIR ?? `/tmp/debugger-browser-${Date.now()}`;

async function http(path: string, body?: unknown) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token ?? ''}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const data = await response.json();
  expect(response.ok, JSON.stringify(data)).toBe(true);

  return data;
}

async function snapshot() {
  return http(`/api/runtime/workspaces/${workspaceId}/debugger/v1/${sessionId}`);
}

beforeAll(async () => {
  const database = new URL(process.env.DATABASE_URL ?? 'http://invalid');

  if (!['127.0.0.1', 'localhost'].includes(database.hostname) || !database.pathname.includes('debugger_qa')) {
    throw new Error('Dedicated local debugger_qa database required');
  }

  process.env.NODE_ENV = 'test';
  delete process.env.EMAIL_HTTP_ENDPOINT;
  delete process.env.EMAIL_HTTP_API_KEY;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Synthetic recipe forbids external HTTP');
    }

    return sourceFetch(input, init);
  }) as typeof fetch;
  await mkdir(artifactDirectory, { recursive: true });
  console.log(`Browser recipe artifacts: ${artifactDirectory}`);
  root = await mkdtemp(join(tmpdir(), 'debugger-browser-'));

  const fixtureSecret = randomUUID();
  process.env.WORKSPACE_MANAGER_SHARED_SECRET = fixtureSecret;

  const manager = new WorkspaceManager(
    new JsonWorkspaceStore(join(root, 'manager.json')),
    new KubectlWorkspaceK8sClient('/nonexistent/no-cluster-access'),
    new StructuredLogEventBus(),
    fixtureSecret,
  );
  managerApp = buildWorkspaceManagerApp(manager);
  await managerApp.listen({ host: '127.0.0.1', port: 0 });
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${(managerApp.server.address() as { port: number }).port}`;
  api = await buildApiApp();
  await api.listen({ host: '127.0.0.1', port: 0 });
  apiUrl = `http://127.0.0.1:${(api.server.address() as { port: number }).port}`;

  const owner = await http('/auth/register', {
    email: `debugger-browser-${randomUUID()}@local.test`,
    password: `Fixture-${randomUUID()}!`,
    name: 'Synthetic debugger browser',
    organizationName: 'Synthetic debugger browser',
  });
  token = owner.token;

  const creation = await http(`/orgs/${owner.organization.id}/projects`, { name: 'Synthetic Node browser debugger' });
  projectId = creation.project.id;
  db = createDatabaseClient();

  const workspace = await db.workspace.create({
    data: { projectId, name: 'Synthetic Node runtime', runtimeMode: 'remote', status: 'RUNNING' },
  });
  workspaceId = workspace.id;
  await writeFile(
    join(root, 'program.cjs'),
    [
      'let answer = 2;',
      'function twice(value) {',
      '  const doubled = value * 2;',
      '  return doubled;',
      '}',
      'answer = twice(answer);',
      'console.log("answer=" + answer);',
      'setInterval(() => {}, 1000);',
    ].join('\n'),
  );
  agent = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId, tokenSecret: fixtureSecret });
  await agent.listen({ host: '127.0.0.1', port: 0 });
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${(agent.server.address() as { port: number }).port}`;

  // Whitelist the compiled web process environment: no provider credentials or email delivery.
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(55442, '127.0.0.1', () => probe.close((error) => (error ? reject(error) : resolve())));
  });
  web = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      PORT: '55442',
      SAAS_API_URL: apiUrl,
      API_BASE_URL: apiUrl,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });
  web.stdout?.on('data', (chunk) => webLogs.push(String(chunk)));
  web.stderr?.on('data', (chunk) => webLogs.push(String(chunk)));

  let webSpawnError: Error | undefined;
  web.on('error', (error) => {
    webSpawnError = error;
  });

  const deadline = Date.now() + 30000;

  let ready = false;

  while (Date.now() < deadline && !ready) {
    if (webSpawnError || web.exitCode !== null) {
      throw webSpawnError ?? new Error('Compiled web child exited before readiness');
    }

    ready = await fetch(`${appUrl}/api/health`)
      .then((response) => response.status === 200)
      .catch(() => false);

    if (!ready) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (!ready) {
    throw new Error('Compiled web server did not become ready');
  }

  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());

    if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) {
      return route.continue();
    }

    blockedExternalRequests.push(`${url.origin}${url.pathname}`);

    return route.abort('blockedbyclient');
  });
  await context.addCookies([{ name: 'vc_session', value: token, url: appUrl, httpOnly: true, sameSite: 'Lax' }]);
  page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserConsoleErrors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedHttp.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
}, 60000);

afterAll(async () => {
  if (sessionId && api) {
    await http(`/api/runtime/workspaces/${workspaceId}/processes/${sessionId}/kill`, {}).catch(() => undefined);
  }

  if (page) {
    await page.screenshot({ path: join(artifactDirectory, 'final.png'), fullPage: true }).catch(() => undefined);
  }

  await browser?.close();

  if (web && web.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => web.kill('SIGKILL'), 5000);
      web.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      web.kill('SIGTERM');
    });
  }

  await writeFile(join(artifactDirectory, 'web.log'), webLogs.join(''));
  await writeFile(
    join(artifactDirectory, 'errors.json'),
    JSON.stringify({
      pageErrors: browserErrors,
      consoleErrors: browserConsoleErrors,
      failedHttp,
      blockedExternalRequests,
    }),
  );
  await api?.close();
  await agent?.close();
  await managerApp?.close();
  await db?.$disconnect();

  if (root) {
    await rm(root, { recursive: true, force: true });
  }

  globalThis.fetch = sourceFetch;

  for (const key of [
    'NODE_ENV',
    'EMAIL_HTTP_ENDPOINT',
    'EMAIL_HTTP_API_KEY',
    'WORKSPACE_MANAGER_SHARED_SECRET',
    'WORKSPACE_MANAGER_URL',
    'WORKSPACE_AGENT_URL_TEMPLATE',
  ]) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

for (const width of [1440, 820, 390]) {
  test(`compiled browser ${width}px configures Node, hits a breakpoint, steps into/over/out, inspects and stops`, async () => {
    sessionId = undefined;
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${appUrl}/projects/${projectId}/ide?panel=debugger`, { waitUntil: 'domcontentloaded' });

    const panel = page.locator('[data-testid="ide-service-panel"][data-panel="debugger"]').first();
    await browserExpect(panel).toBeVisible({ timeout: 60000 });

    const form = (intent: string) => {
      const forms = panel.locator('form').filter({ has: page.locator(`input[name="intent"][value="${intent}"]`) });
      return sessionId && ['continue', 'pause', 'step-into', 'step-over', 'step-out', 'stop-session'].includes(intent)
        ? forms.filter({ has: page.locator(`input[name="sessionId"][value="${sessionId}"]`) })
        : forms;
    };

    const configuration = form('save-config');
    await configuration.locator('input[name="name"]').fill(`Synthetic Node browser ${width}`);
    await configuration.locator('input[name="program"]').fill('program.cjs');
    await configuration.locator('input[name="stopOnEntry"]').check();
    await configuration.locator('button[type="submit"], button:not([type])').click();
    await browserExpect(form('start-session').locator('select')).toContainText(`Synthetic Node browser ${width}`);
    await form('add-breakpoint').locator('input[name="filePath"]').fill('program.cjs');
    await form('add-breakpoint').locator('input[name="line"]').fill('6');
    await form('add-breakpoint').locator('button').click();
    await browserExpect(panel).toContainText('program.cjs:6');
    await form('add-watch').locator('input[name="expression"]').fill('answer');
    await form('add-watch').locator('button').click();
    await browserExpect(panel).toContainText('answer');
    await form('start-session')
      .locator('select')
      .selectOption({ label: `Synthetic Node browser ${width}` });
    await browserExpect(form('start-session').locator('button')).toHaveText('Start Node debugging');
    await form('start-session').locator('button').click();
    await expect
      .poll(async () => {
        const persisted = await http(`/projects/${projectId}/env-vars`);

        const session = JSON.parse(
          persisted.envVars.find((row: { key: string }) => row.key === 'VIBECORE_DEBUGGER_STATE').value,
        ).sessions[0];

        if (session?.name === `Synthetic Node browser ${width}`) {
          sessionId = session.processId;
        }

        return Boolean(sessionId);
      })
      .toBe(true);
    await browserExpect(form('continue').locator('button')).toBeEnabled({ timeout: 15000 });
    await expect.poll(async () => (await snapshot()).callStack[0]?.line).toBe(1);
    await form('continue').locator('button').click();
    await expect.poll(async () => (await snapshot()).callStack[0]?.line).toBe(6);
    await browserExpect(panel).toContainText('answer = 2', { timeout: 10000 });
    await form('step-into').locator('button').click();
    await expect.poll(async () => (await snapshot()).callStack[0]?.name).toBe('twice');
    await browserExpect(panel).toContainText('twice', { timeout: 10000 });
    await form('step-over').locator('button').click();
    await expect
      .poll(async () => (await snapshot()).variables)
      .toContainEqual({ name: 'doubled', value: '4', type: 'number' });
    await browserExpect(panel).toContainText('doubled', { timeout: 10000 });

    const doubledRow = panel
      .locator('.bolt-panel-row')
      .filter({ has: page.locator('.bolt-panel-row-title', { hasText: /^doubled$/ }) });
    await browserExpect(doubledRow.locator('.bolt-panel-row-detail')).toHaveText('4');
    await browserExpect(panel.locator('.bolt-panel-row-detail').filter({ hasText: /^program\.cjs:4:/ })).toHaveCount(1);
    expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: join(artifactDirectory, `paused-${width}.png`), fullPage: true });
    await doubledRow.scrollIntoViewIfNeeded();
    await browserExpect(doubledRow).toBeVisible();
    await page.screenshot({ path: join(artifactDirectory, `variables-${width}.png`), fullPage: true });
    await form('step-out').locator('button').click();
    await expect.poll(async () => (await snapshot()).callStack[0]?.line).toBe(7);
    await form('continue').locator('button').click();
    await expect.poll(async () => (await snapshot()).status).toBe('running');
    await browserExpect(form('stop-session').locator('button')).toBeEnabled();
    await form('stop-session').locator('button').click();
    await expect.poll(async () => (await snapshot()).status).toBe('stopped');
    await browserExpect(form('stop-session')).toHaveCount(0, { timeout: 10000 });

    const final = await http(`/projects/${projectId}/env-vars`);

    const saved = JSON.parse(final.envVars.find((row: { key: string }) => row.key === 'VIBECORE_DEBUGGER_STATE').value)
      .sessions[0];
    expect(saved).toMatchObject({ status: 'stopped', variables: [], callStack: [] });

    const processes = await http(`/api/runtime/workspaces/${workspaceId}/processes`);
    expect((processes.processes ?? processes).some((process: { id: string }) => process.id === sessionId)).toBe(false);
    expect(browserErrors).toEqual([]);
    await page.screenshot({ path: join(artifactDirectory, `stopped-${width}.png`), fullPage: true });
  }, 120000);
}
