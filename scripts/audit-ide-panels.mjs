import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
let appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const outFile = process.env.IDE_PANEL_AUDIT_OUT ?? 'tmp/ide-panel-audit.json';
const explicitApiBaseUrl = Boolean(process.env.SAAS_API_URL || process.env.API_BASE_URL);
const explicitAppBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const spawnedProcesses = [];

const backendPanels = [
  'overview',
  'database',
  'object-storage',
  'packages',
  'monitoring',
  'extensions',
  'integrations',
  'workflows',
  'deployments',
  'env',
  'secrets',
  'git',
  'activity',
  'logs',
  'collaborators',
  'snapshots',
  'settings',
  'domains',
];

const workspacePanels = ['editor', 'files', 'search', 'locks', 'preview', 'terminal', ...backendPanels];

function pnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function localUrlPort(url) {
  try {
    const parsed = new URL(url);

    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
      return null;
    }

    return parsed.port;
  } catch {
    return null;
  }
}

function collectChildOutput(child, label) {
  const lines = [];
  const collect = (stream, prefix) => {
    stream?.on('data', (chunk) => {
      const text = chunk.toString();
      text
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => {
          lines.push(`[${label}:${prefix}] ${line}`);

          if (lines.length > 80) {
            lines.shift();
          }
        });
    });
  };

  collect(child.stdout, 'stdout');
  collect(child.stderr, 'stderr');

  return lines;
}

function spawnLocalService(label, scriptName, extraEnv = {}) {
  const child = spawn(pnpmCommand(), ['run', scriptName], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = collectChildOutput(child, label);
  spawnedProcesses.push({ child, label, logs });

  child.once('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      logs.push(`[${label}:exit] code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    }
  });

  return { child, logs };
}

function killChildTree(child, signal) {
  try {
    if (process.platform === 'win32') {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error;
    }
  }
}

async function isReachable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json,text/html' } });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReachable(url, label, logs, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError = '';

  while (Date.now() - startedAt < timeoutMs) {
    if (await isReachable(url)) {
      return;
    }

    const childExited = spawnedProcesses.find((processInfo) => processInfo.label === label)?.child.exitCode !== null;

    if (childExited) {
      lastError = `${label} exited before ${url} became reachable.`;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const logTail = logs?.length ? `\nRecent ${label} output:\n${logs.slice(-30).join('\n')}` : '';
  throw new Error(`${lastError || `${label} did not become reachable at ${url}.`}${logTail}`);
}

function viteLocalUrlFromLogs(logs) {
  for (const line of logs.slice().reverse()) {
    const match = line.match(/Local:\s+(http:\/\/[^\s/]+(?::\d+)?\/?)/);

    if (match) {
      return match[1].replace(/\/$/, '');
    }
  }

  return null;
}

async function waitForWebReachable(initialUrl, logs) {
  const startedAt = Date.now();
  let targetUrl = initialUrl;

  while (Date.now() - startedAt < 90_000) {
    const advertisedUrl = viteLocalUrlFromLogs(logs);

    if (advertisedUrl) {
      targetUrl = advertisedUrl;
    }

    if (await isReachable(targetUrl)) {
      appBaseUrl = targetUrl;
      return;
    }

    const childExited = spawnedProcesses.find((processInfo) => processInfo.label === 'web')?.child.exitCode !== null;

    if (childExited) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const logTail = logs?.length ? `\nRecent web output:\n${logs.slice(-30).join('\n')}` : '';
  throw new Error(`web did not become reachable at ${targetUrl}.${logTail}`);
}

async function ensureLocalServices() {
  const apiHealthUrl = `${apiBaseUrl}/synthetic/health`;
  const appHealthUrl = appBaseUrl;

  if (!(await isReachable(apiHealthUrl))) {
    const apiPort = localUrlPort(apiBaseUrl);

    if (explicitApiBaseUrl || apiPort === null) {
      throw new Error(
        `API audit endpoint is not reachable at ${apiHealthUrl}. Start the API or set SAAS_API_URL/API_BASE_URL to a reachable local service.`,
      );
    }

    const { logs } = spawnLocalService('api', 'dev:api', {
      API_HOST: new URL(apiBaseUrl).hostname,
      API_PORT: apiPort || '3001',
    });
    await waitForReachable(apiHealthUrl, 'api', logs);
  }

  if (!(await isReachable(appHealthUrl))) {
    const appPort = localUrlPort(appBaseUrl);

    if (explicitAppBaseUrl || appPort === null) {
      throw new Error(
        `IDE app is not reachable at ${appHealthUrl}. Start the web app or set PLAYWRIGHT_BASE_URL to a reachable local service.`,
      );
    }

    const { logs } = spawnLocalService('web', 'dev:web', {
      HOST: new URL(appBaseUrl).hostname,
      PORT: appPort || '5173',
    });
    await waitForWebReachable(appHealthUrl, logs);
  }
}

async function stopSpawnedProcesses() {
  await Promise.all(
    spawnedProcesses.map(
      ({ child }) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }

          child.once('exit', resolve);

          killChildTree(child, 'SIGTERM');

          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              killChildTree(child, 'SIGKILL');
            }
          }, 5_000).unref();
        }),
    ),
  );
}

async function http(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  return { response, text, body };
}

async function registerAuditUser() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await http(`${apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `ide-panel-audit-${suffix}@local.test`,
      password: 'Password123!',
      name: 'IDE Panel Audit',
      organizationName: `IDE Panel Audit ${suffix}`,
    }),
  });

  if (!result.response.ok) {
    throw new Error(`Audit user registration failed (${result.response.status}): ${result.text}`);
  }

  return result.body;
}

async function createAuditProject(token, organizationId) {
  const result = await http(`${apiBaseUrl}/orgs/${organizationId}/projects/from-template`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'IDE Panel Audit App', templateName: 'react-basic-starter' }),
  });

  if (!result.response.ok) {
    throw new Error(`Audit project creation failed (${result.response.status}): ${result.text}`);
  }

  return result.body.project;
}

function form(values) {
  return new URLSearchParams(values);
}

async function auditBackendPanels(projectId, cookie) {
  const results = [];

  for (const panel of backendPanels) {
    const result = await http(`${appBaseUrl}/api/projects/${projectId}/ide-panel/${panel}`, {
      headers: { accept: 'application/json', cookie },
    });

    results.push({
      kind: 'panel_get',
      panel,
      status: result.response.status,
      ok: result.response.ok,
      envelopeStatus: result.body?.status,
      error: result.body?.error?.message ?? result.body?.error,
    });
  }

  const safeActions = [
    ['env', form({ key: 'PANEL_AUDIT_FLAG', value: 'enabled' })],
    ['secrets', form({ key: 'PANEL_AUDIT_SECRET', value: 'secret-value' })],
    ['snapshots', form({ intent: 'create', label: 'Panel audit checkpoint' })],
    [
      'deployments',
      form({ provider: 'static', environment: 'preview', buildCommand: 'npm run build', outputDirectory: 'dist' }),
    ],
    ['database', form({ key: 'DATABASE_URL', value: 'postgres://audit.local/db' })],
    ['object-storage', form({ key: 'OBJECT_STORAGE_BUCKET', value: 'audit-bucket' })],
    ['packages', form({ packages: 'zod react-router-dom' })],
    ['extensions', form({ extension: 'prettier' })],
    [
      'integrations',
      form({ intent: 'connect', integrationId: 'slack', organization: 'audit', apiToken: 'slack-token' }),
    ],
    ['workflows', form({ intent: 'create-workflow', name: 'Panel Audit Workflow', executionMode: 'sequential' })],
    ['collaborators', form({ intent: 'comment', filePath: 'src/App.tsx', line: '1', body: 'Panel audit comment' })],
    [
      'settings',
      form({ name: 'IDE Panel Audit App Updated', description: 'Panel audit update', gitDefaultBranch: 'main' }),
    ],
  ];

  for (const [panel, body] of safeActions) {
    const result = await http(`${appBaseUrl}/api/projects/${projectId}/ide-panel/${panel}`, {
      method: 'POST',
      headers: { accept: 'application/json', cookie },
      body,
    });

    results.push({
      kind: 'panel_action',
      panel,
      status: result.response.status,
      ok: result.response.ok || (panel === 'deployments' && result.response.status === 429),
      blockedByQuota: panel === 'deployments' && result.response.status === 429,
      error: result.body?.error ?? (!result.response.ok ? result.text.slice(0, 240) : undefined),
    });
  }

  const secretGuard = await http(
    `${appBaseUrl}/api/projects/${projectId}/ide-panel/secrets?reveal=true&key=PANEL_AUDIT_SECRET`,
    { headers: { accept: 'application/json', cookie } },
  );
  results.push({
    kind: 'security_guard',
    panel: 'secrets_reveal_without_confirm',
    status: secretGuard.response.status,
    ok: secretGuard.response.ok,
    expectedGuard: secretGuard.body?.error?.code === 'PANEL_REVEAL_REQUIRES_CONFIRMATION',
    code: secretGuard.body?.error?.code,
  });

  return results;
}

async function auditPanelRender(projectId, token) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const results = [];

  for (const panel of workspacePanels) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (error) => errors.push(`[${panel}] ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/net::ERR_ABORTED/.test(message.text())) {
        errors.push(`[${panel}] ${message.text()}`);
      }
    });

    await page
      .context()
      .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

    await page.goto(`${appBaseUrl}/projects/${projectId}/ide${panel === 'editor' ? '' : `?panel=${panel}`}`, {
      waitUntil: 'domcontentloaded',
    });

    let locator;
    let marker;

    if (panel === 'editor') {
      locator = page.locator('[data-testid="responsive-code-editor"]').first();
      marker = 'responsive-code-editor';
    } else if (panel === 'preview') {
      locator = page.locator('.bolt-project-webview-tool, iframe').first();
      marker = 'preview-webview';
    } else if (panel === 'terminal') {
      locator = page.locator('.bolt-project-terminal-direct-panel').first();
      marker = 'interactive-terminal-panel';
    } else if (panel === 'files') {
      locator = page.locator('.bolt-project-files-tool').first();
      marker = 'project-files-tool';
    } else if (panel === 'search') {
      locator = page.getByText(/Search|Find in files/i).first();
      marker = 'search';
    } else if (panel === 'locks') {
      locator = page.getByText(/Locked|lock/i).first();
      marker = 'locks';
    } else {
      locator = page.locator(`[data-testid="ide-service-panel"][data-panel="${panel}"]`).first();
      marker = `service-panel:${panel}`;
    }

    const rendered = await locator
      .waitFor({ state: 'visible', timeout: panel === 'preview' || panel === 'terminal' ? 30_000 : 15_000 })
      .then(() => true)
      .catch(() => false);
    const applicationError = (await page.getByText('Application Error').count()) > 0;

    results.push({
      kind: 'panel_render',
      panel,
      rendered,
      marker,
      url: page.url(),
      applicationError,
    });
    await page.close();
  }

  await browser.close();

  return { results, errors };
}

async function auditCriticalUiInteractions(projectId, token) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const results = [];

  async function withPanel(panel, action) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const backendCalls = [];

    page.on('pageerror', (error) => errors.push(`[ui:${panel}] ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/net::ERR_ABORTED/.test(message.text())) {
        errors.push(`[ui:${panel}] ${message.text()}`);
      }
    });
    page.on('response', (response) => {
      const url = response.url();

      if (!url.includes(`/api/projects/${projectId}/ide-panel/${panel}`)) {
        return;
      }

      backendCalls.push({
        method: response.request().method(),
        status: response.status(),
        url: url.replace(appBaseUrl, ''),
      });
    });

    await page
      .context()
      .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

    try {
      await page.goto(`${appBaseUrl}/projects/${projectId}/ide?panel=${panel}`, { waitUntil: 'domcontentloaded' });
      await page.locator(`[data-testid="ide-service-panel"][data-panel="${panel}"]`).waitFor({
        state: 'visible',
        timeout: 15_000,
      });
      await action(page);

      const applicationError = (await page.getByText('Application Error').count()) > 0;
      return { ok: !applicationError, applicationError, backendCalls };
    } finally {
      await page.close();
    }
  }

  function waitForPanelResponse(page, panel, method, timeout = 15_000) {
    return page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${projectId}/ide-panel/${panel}`) &&
        response.request().method() === method &&
        response.status() < 500,
      { timeout },
    );
  }

  async function run(panel, action, check, expectedBackendMethods = ['GET', 'POST']) {
    try {
      const result = await withPanel(panel, action);
      const missingBackendMethods = expectedBackendMethods.filter(
        (method) => !result.backendCalls.some((call) => call.method === method && call.status < 500),
      );

      results.push({
        kind: 'ui_interaction',
        panel,
        action: check,
        ok: result.ok && missingBackendMethods.length === 0,
        applicationError: result.applicationError,
        backendCalls: result.backendCalls,
        missingBackendMethods,
      });
    } catch (error) {
      results.push({
        kind: 'ui_interaction',
        panel,
        action: check,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await run(
    'env',
    async (page) => {
      const key = `PANEL_AUDIT_UI_ENV_${Date.now()}`;
      await page.getByRole('button', { name: 'New variable' }).click();
      await page.getByPlaceholder('VITE_API_URL').fill(key);
      await page.locator('input[name="value"]').fill('ui-enabled');
      await Promise.all([
        waitForPanelResponse(page, 'env', 'POST'),
        page.getByRole('button', { name: 'Save variable' }).click(),
      ]);
      await page.getByText(key).waitFor({ state: 'visible', timeout: 10_000 });
      await page.getByText('ui-enabled').waitFor({ state: 'visible', timeout: 10_000 });
    },
    'create_env_variable_visible_after_backend_reload',
  );

  await run(
    'secrets',
    async (page) => {
      const key = `PANEL_AUDIT_UI_SECRET_${Date.now()}`;
      const value = `secret-ui-${Date.now()}`;
      await page.getByPlaceholder('STRIPE_SECRET_KEY').fill(key);
      await page.getByPlaceholder('Secret value').fill(value);
      await Promise.all([
        waitForPanelResponse(page, 'secrets', 'POST'),
        page.getByRole('button', { name: '+ New secret' }).click(),
      ]);
      await page.getByText(key).waitFor({ state: 'visible', timeout: 10_000 });
      page.once('dialog', (dialog) => void dialog.accept());
      await page.getByRole('button', { name: `Reveal ${key}` }).click();
      await page.getByText(value).waitFor({ state: 'visible', timeout: 10_000 });
    },
    'create_secret_and_reveal_after_explicit_confirmation',
  );

  await run(
    'snapshots',
    async (page) => {
      const label = `Panel audit UI checkpoint ${Date.now()}`;
      await page.getByPlaceholder('Manual checkpoint').fill(label);
      await Promise.all([
        waitForPanelResponse(page, 'snapshots', 'POST'),
        page.getByRole('button', { name: '+ New checkpoint' }).click(),
      ]);
      await page.locator('.bolt-project-snapshot-card', { hasText: label }).first().waitFor({
        state: 'visible',
        timeout: 10_000,
      });
    },
    'create_snapshot_visible_after_backend_reload',
  );

  await run(
    'database',
    async (page) => {
      const value = `postgres://audit.local/ui-${Date.now()}`;
      const onboardingInput = page.getByPlaceholder('postgresql://user:password@host/db?sslmode=require');

      if ((await onboardingInput.count()) > 0 && (await onboardingInput.first().isVisible())) {
        await onboardingInput.first().fill(value);
        await Promise.all([
          waitForPanelResponse(page, 'database', 'POST'),
          page.getByRole('button', { name: 'Add your first database' }).click(),
        ]);
      } else {
        const databasePanel = page.locator('[data-testid="ide-service-panel"][data-panel="database"]');
        await databasePanel.getByRole('button', { name: 'Secrets' }).click();
        await databasePanel.locator('input[name="key"]:visible').last().fill('DATABASE_URL');
        await databasePanel.locator('input[name="value"]:visible').last().fill(value);
        await Promise.all([
          waitForPanelResponse(page, 'database', 'POST'),
          databasePanel.getByRole('button', { name: 'Save encrypted secret' }).click(),
        ]);
      }

      await page.getByText('DATABASE_URL').first().waitFor({
        state: 'visible',
        timeout: 10_000,
      });
    },
    'save_database_url_visible_after_backend_reload',
  );

  await run(
    'packages',
    async (page) => {
      const packageName = 'is-odd';
      await page.getByPlaceholder('@scope/name, react-query, vite@latest').fill(packageName);
      await Promise.all([
        waitForPanelResponse(page, 'packages', 'POST', 60_000),
        page.getByRole('button', { name: 'Install package' }).click(),
      ]);
      await page
        .getByText(/add package/i)
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 });
    },
    'create_package_install_plan_visible_after_backend_reload',
  );

  await run(
    'settings',
    async (page) => {
      const projectName = `IDE Panel Audit UI ${Date.now()}`;
      const panel = page.locator('[data-testid="ide-service-panel"][data-panel="settings"]');
      await panel.locator('input[name="name"]').fill(projectName);
      await panel.locator('input[name="description"]').fill('Updated by UI interaction audit');
      await Promise.all([
        waitForPanelResponse(page, 'settings', 'POST'),
        panel.getByRole('button', { name: 'Save settings' }).click(),
      ]);
      await panel.locator('input[name="name"]').waitFor({ state: 'visible', timeout: 10_000 });
      const persistedName = await panel.locator('input[name="name"]').inputValue();

      if (persistedName !== projectName) {
        throw new Error(`settings name did not persist, got "${persistedName}"`);
      }
    },
    'save_project_settings_visible_after_backend_reload',
  );

  await run(
    'object-storage',
    async (page) => {
      const value = `audit-bucket-${Date.now()}`;
      await page.getByPlaceholder('vibecore-project-assets').fill(value);
      await Promise.all([
        waitForPanelResponse(page, 'object-storage', 'POST'),
        page.getByRole('button', { name: 'Save storage config' }).click(),
      ]);
      await page.locator('.text-sm.font-medium', { hasText: 'OBJECT_STORAGE_BUCKET' }).first().waitFor({
        state: 'visible',
        timeout: 10_000,
      });
    },
    'save_object_storage_config_visible_after_backend_reload',
  );

  await run(
    'extensions',
    async (page) => {
      await page.getByPlaceholder('Theme, language, linter, debugger...').fill('Material Icon Theme');
      const extensionCard = page.locator('.bolt-project-extension-card', { hasText: 'Material Icon Theme' }).first();
      await Promise.all([
        waitForPanelResponse(page, 'extensions', 'POST'),
        extensionCard.getByRole('button', { name: 'Install' }).click(),
      ]);
      await page
        .locator('.bolt-project-installed-extensions', { hasText: 'Material Icon Theme' })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });
    },
    'persist_extension_visible_after_backend_reload',
  );

  await run(
    'integrations',
    async (page) => {
      await page.getByPlaceholder('Search integrations...').fill('Notion');
      await page.getByTestId('integration-card-notion').waitFor({ state: 'visible', timeout: 10_000 });
      await page.getByTestId('button-connect-notion').click();
      await page.getByPlaceholder('API token, OAuth token or app password').fill(`notion-token-${Date.now()}`);
      await page.getByPlaceholder('Organization or workspace').fill('Panel Audit Workspace');
      await Promise.all([
        waitForPanelResponse(page, 'integrations', 'POST'),
        page.getByRole('button', { name: 'Connect Notion' }).click(),
      ]);
      await page.getByRole('button', { name: /Connected \(/ }).click();
      await page.getByText('Notion').first().waitFor({ state: 'visible', timeout: 10_000 });
      await page
        .locator('.bolt-project-integrations-tabs')
        .getByRole('button', { name: /Webhooks/ })
        .click();
      await page.getByRole('button', { name: 'Create Webhook' }).click();
      await page.getByPlaceholder('Deployment Notifications').fill(`Integration Audit Webhook ${Date.now()}`);
      await page.getByPlaceholder('https://example.com/webhook').fill('https://example.com/integrations-audit');
      await Promise.all([
        waitForPanelResponse(page, 'integrations', 'POST'),
        page.getByRole('button', { name: 'Create Webhook' }).last().click(),
      ]);
      await page.getByText('https://example.com/integrations-audit').waitFor({ state: 'visible', timeout: 10_000 });
    },
    'connect_integration_and_create_webhook_visible_after_backend_reload',
  );

  await run(
    'workflows',
    async (page) => {
      const workflowName = `Workflow Audit ${Date.now()}`;
      await page.getByTestId('new-workflow-button').click();
      await page.getByTestId('workflow-name-input').fill(workflowName);
      await page.getByPlaceholder('npm run dev').fill(`echo ${workflowName}`);
      await Promise.all([
        waitForPanelResponse(page, 'workflows', 'POST'),
        page.getByRole('button', { name: 'Create Workflow' }).click(),
      ]);
      const workflowCard = page.locator('.bolt-project-workflow-card', { hasText: workflowName }).first();
      await workflowCard.waitFor({ state: 'visible', timeout: 10_000 });
      await workflowCard.locator('header button').first().click();
      await Promise.all([
        waitForPanelResponse(page, 'workflows', 'POST'),
        workflowCard.getByRole('button', { name: 'Run', exact: true }).click(),
      ]);
      await workflowCard.locator('.bolt-project-workflow-runs').waitFor({ state: 'visible', timeout: 20_000 });
      await workflowCard.getByRole('button', { name: 'Shell Command' }).click();
      await waitForPanelResponse(page, 'workflows', 'POST');
      await workflowCard.getByText('Shell Command').first().waitFor({ state: 'visible', timeout: 10_000 });
    },
    'create_run_workflow_and_add_task_visible_after_backend_reload',
  );

  await run(
    'monitoring',
    async (page) => {
      await page.getByRole('button', { name: '24h' }).click();
      await page
        .getByText(/24h window/)
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });
      await page.getByRole('button', { name: 'Refresh metrics' }).click();
      await page.getByText('Workspace').first().waitFor({ state: 'visible', timeout: 10_000 });
    },
    'change_monitoring_window_and_refresh',
    ['GET'],
  );

  await run(
    'logs',
    async (page) => {
      await page.getByLabel('Toggle split log view').click();
      await page.locator('button', { hasText: 'Close split' }).waitFor({ state: 'visible', timeout: 10_000 });
      await page.getByLabel('Clear visible logs').click();
      await page
        .getByText(/Visible logs were cleared|No .* logs/i)
        .first()
        .waitFor({
          state: 'visible',
          timeout: 10_000,
        });
    },
    'split_and_clear_logs_panel',
    ['GET'],
  );

  await run(
    'collaborators',
    async (page) => {
      const comment = `Panel audit UI comment ${Date.now()}`;
      await page.getByPlaceholder('Comment').fill(comment);
      await Promise.all([
        waitForPanelResponse(page, 'collaborators', 'POST'),
        page.getByRole('button', { name: 'Add comment' }).click(),
      ]);
      await page.getByText(comment).waitFor({ state: 'visible', timeout: 10_000 });
      await Promise.all([
        waitForPanelResponse(page, 'collaborators', 'POST'),
        page.getByRole('button', { name: 'Create expiring link' }).click(),
      ]);
      await page
        .getByText(/Expires/i)
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });
      await Promise.all([
        waitForPanelResponse(page, 'collaborators', 'POST'),
        page.getByRole('button', { name: 'Enable shared AI' }).click(),
      ]);
      await page.getByRole('button', { name: 'Disable shared AI' }).waitFor({ state: 'visible', timeout: 10_000 });
    },
    'collaboration_comment_share_link_and_ai_policy',
  );

  await run(
    'domains',
    async (page) => {
      const domain = `audit-${Date.now()}.example.com`;
      await page.locator('input[name="domain"]').fill(domain);
      await Promise.all([
        waitForPanelResponse(page, 'domains', 'POST'),
        page.getByRole('button', { name: 'Add domain' }).click(),
      ]);
      await waitForPanelResponse(page, 'domains', 'GET');
      await page.getByText(domain).first().waitFor({ state: 'visible', timeout: 10_000 });
    },
    'add_custom_domain_visible_after_backend_reload',
  );

  await browser.close();

  return { results, errors };
}

async function auditWorkspaceUiInteractions(projectId, token) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const results = [];

  async function withWorkspacePanel(panel, action) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (error) => errors.push(`[workspace:${panel}] ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/net::ERR_ABORTED/.test(message.text())) {
        errors.push(`[workspace:${panel}] ${message.text()}`);
      }
    });

    await page
      .context()
      .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

    try {
      await page.goto(`${appBaseUrl}/projects/${projectId}/ide?panel=${panel}`, { waitUntil: 'domcontentloaded' });
      await action(page);

      const applicationError = (await page.getByText('Application Error').count()) > 0;
      return { ok: !applicationError, applicationError };
    } finally {
      await page.close();
    }
  }

  async function run(panel, action, check) {
    try {
      const result = await withWorkspacePanel(panel, action);
      results.push({
        kind: 'workspace_interaction',
        panel,
        action: check,
        ok: result.ok,
        applicationError: result.applicationError,
      });
    } catch (error) {
      results.push({
        kind: 'workspace_interaction',
        panel,
        action: check,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function waitForWorkspacePanelResponse(page, panel, method) {
    return page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${projectId}/ide-panel/${panel}`) &&
        response.request().method() === method &&
        response.status() < 500,
      { timeout: 20_000 },
    );
  }

  await run(
    'editor',
    async (page) => {
      const editor = page.locator('[data-testid="responsive-code-editor"]').first();
      await editor.waitFor({ state: 'visible', timeout: 20_000 });

      const saveButton = page.getByRole('button', { name: 'Save' }).first();

      if ((await saveButton.count()) > 0 && (await saveButton.isEnabled().catch(() => false))) {
        await saveButton.click();
      } else {
        await page.getByRole('button', { name: 'Open Files' }).click();
        await page.locator('.bolt-project-files-tool').first().waitFor({ state: 'visible', timeout: 10_000 });
      }
    },
    'editor_save_or_open_files_action',
  );

  await run(
    'files',
    async (page) => {
      const fileName = `panel-audit-${Date.now()}.txt`;
      const filesPanel = page.locator('.bolt-project-files-tool').first();
      await filesPanel.waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByLabel('Refresh files').click();
      await page.getByLabel('Collapse all files').click();
      page.once('dialog', (dialog) => void dialog.accept(fileName));
      await page.getByLabel('New file').click();
      await page
        .locator('[data-testid="responsive-code-editor"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByText(fileName).first().waitFor({ state: 'visible', timeout: 15_000 });
    },
    'create_refresh_and_collapse_file_tree',
  );

  await run(
    'search',
    async (page) => {
      await page.getByPlaceholder('Search').fill(`no-match-${Date.now()}`);
      await page.getByText('No results found.').waitFor({ state: 'visible', timeout: 15_000 });
    },
    'search_no_results_state_after_query',
  );

  await run(
    'locks',
    async (page) => {
      await page.getByPlaceholder('Search...').fill('panel-audit');
      await page.locator('select').selectOption('files');
      await page.getByText('No locked items found').waitFor({ state: 'visible', timeout: 10_000 });
    },
    'filter_locked_files_empty_state',
  );

  await run(
    'preview',
    async (page) => {
      await page.locator('.bolt-project-webview-tool').first().waitFor({ state: 'visible', timeout: 30_000 });
      await page.getByLabel('Preview device').selectOption('mobile');
      await page.locator('.bolt-project-webview-frame[data-preview-device="mobile"]').waitFor({
        state: 'visible',
        timeout: 10_000,
      });
      await page.getByTitle('Webview logs').click();
      await page.locator('.bolt-preview-logs-panel').first().waitFor({ state: 'visible', timeout: 10_000 });
    },
    'switch_preview_device_and_open_logs',
  );

  await run(
    'terminal',
    async (page) => {
      await page.locator('.bolt-project-terminal-direct-panel').first().waitFor({ state: 'visible', timeout: 30_000 });
      await page.getByRole('button', { name: 'Vibecore Terminal' }).first().waitFor({
        state: 'visible',
        timeout: 30_000,
      });
      await page.getByRole('button', { name: 'Runtime panels' }).click();
      await page.locator('[data-testid="terminal-hub-panel"]').first().waitFor({ state: 'visible', timeout: 30_000 });
      await page.getByTestId('tab-scripts').click();
      await page.getByTestId('button-create-script').click();
      const marker = `terminal-audit-${Date.now()}`;
      await page.getByTestId('input-script-name').fill('Terminal audit script');
      await page.getByTestId('textarea-script-content').fill(`echo ${marker}`);
      await Promise.all([
        waitForWorkspacePanelResponse(page, 'terminal', 'POST'),
        page.getByTestId('button-run-custom-script').click(),
      ]);
      await page.getByText('Terminal audit script').waitFor({ state: 'visible', timeout: 20_000 });
      await page.getByTestId('tab-environment').click();
      await page.getByTestId('button-add-env-var').click();
      const key = `TERMINAL_AUDIT_${Date.now()}`;
      await page.getByTestId('input-env-key').fill(key);
      await page.getByTestId('input-env-value').fill('enabled');
      await Promise.all([
        waitForWorkspacePanelResponse(page, 'terminal', 'POST'),
        page.getByTestId('button-save-env').click(),
      ]);
      await page.getByText(key).waitFor({ state: 'visible', timeout: 10_000 });
    },
    'reset_terminal_run_script_and_save_env',
  );

  await browser.close();

  return { results, errors };
}

async function auditResponsiveViewports(projectId, token) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const results = [];
  const viewports = [
    { name: 'desktop', width: 1440, height: 900, mode: 'desktop' },
    { name: 'laptop', width: 1280, height: 800, mode: 'desktop' },
    { name: 'tablet-landscape', width: 1024, height: 768, mode: 'mobile' },
    { name: 'tablet-portrait', width: 820, height: 1180, mode: 'mobile' },
    { name: 'mobile', width: 390, height: 844, mode: 'mobile' },
    { name: 'small-mobile', width: 360, height: 740, mode: 'mobile' },
  ];

  async function hasHorizontalOverflow(page) {
    return page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const viewportWidth = window.innerWidth;
      const maxScrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
      const rootBox = document.querySelector('.bolt-responsive-ide')?.getBoundingClientRect();

      return {
        overflow: maxScrollWidth > viewportWidth + 2 || (rootBox ? rootBox.width > viewportWidth + 2 : false),
        viewportWidth,
        maxScrollWidth,
        rootWidth: rootBox?.width ?? 0,
      };
    });
  }

  async function waitForMobileChrome(page) {
    await page.getByTestId('mobile-bottom-navigation').waitFor({ state: 'visible', timeout: 15_000 });
  }

  async function assertMobileRoutedPanel(page, panel, locatorFactory) {
    await page.goto(`${appBaseUrl}/projects/${projectId}/ide?panel=${panel}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.bolt-responsive-ide').first().waitFor({ state: 'visible', timeout: 20_000 });
    await waitForMobileChrome(page);
    await locatorFactory(page).waitFor({
      state: 'visible',
      timeout: panel === 'terminal' || panel === 'preview' ? 30_000 : 15_000,
    });
  }

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    page.on('pageerror', (error) => errors.push(`[responsive:${viewport.name}] ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/net::ERR_ABORTED/.test(message.text())) {
        errors.push(`[responsive:${viewport.name}] ${message.text()}`);
      }
    });

    await page
      .context()
      .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

    try {
      await page.goto(`${appBaseUrl}/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });
      await page.locator('.bolt-responsive-ide').first().waitFor({ state: 'visible', timeout: 20_000 });

      if (viewport.mode === 'mobile') {
        await waitForMobileChrome(page);
        await page.getByTestId('tab-agent').click();
        await page.locator('[data-testid="ide-agent-panel"]').first().waitFor({ state: 'visible', timeout: 15_000 });
        await assertMobileRoutedPanel(page, 'files', (activePage) =>
          activePage.getByTestId('mobile-files-panel').first(),
        );
        await assertMobileRoutedPanel(page, 'editor', (activePage) =>
          activePage.locator('[data-testid="responsive-code-editor"]').first(),
        );
        await assertMobileRoutedPanel(page, 'terminal', (activePage) =>
          activePage.getByTestId('mobile-terminal-panel').first(),
        );
        await assertMobileRoutedPanel(page, 'preview', (activePage) =>
          activePage
            .locator(
              '.bolt-project-webview-tool, [data-testid="preview-not-running-state"], [data-testid="preview-splash-sequence"]',
            )
            .first(),
        );
        await assertMobileRoutedPanel(page, 'deployments', (activePage) =>
          activePage.locator('[data-testid="ide-service-panel"][data-panel="deployments"]').first(),
        );
      } else {
        await page.locator('.bolt-project-ide-panels').first().waitFor({ state: 'visible', timeout: 15_000 });
        await page.locator('[data-testid="ide-agent-panel"]').first().waitFor({ state: 'visible', timeout: 15_000 });
      }

      const overflow = await hasHorizontalOverflow(page);
      const applicationError = (await page.getByText('Application Error').count()) > 0;

      results.push({
        kind: 'responsive_viewport',
        panel: viewport.name,
        viewport: { width: viewport.width, height: viewport.height },
        ok: !overflow.overflow && !applicationError,
        applicationError,
        overflow,
      });
    } catch (error) {
      results.push({
        kind: 'responsive_viewport',
        panel: viewport.name,
        viewport: { width: viewport.width, height: viewport.height },
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  return { results, errors };
}

function summarize(results) {
  const failed = results.filter(
    (result) =>
      result.ok === false ||
      result.rendered === false ||
      result.applicationError === true ||
      result.expectedGuard === false,
  );

  return { total: results.length, failed: failed.length, passed: results.length - failed.length };
}

function countByKind(results) {
  return results.reduce((counts, result) => {
    counts[result.kind] = (counts[result.kind] ?? 0) + 1;

    return counts;
  }, {});
}

function networkEvidence(results) {
  const serviceInteractions = results.filter((result) => result.kind === 'ui_interaction');

  return {
    serviceInteractions: serviceInteractions.length,
    serviceInteractionsWithBackendCalls: serviceInteractions.filter((result) => result.backendCalls?.length).length,
    missingBackendMethods: serviceInteractions.filter((result) => result.missingBackendMethods?.length).length,
  };
}

async function runAuditPass() {
  const auth = await registerAuditUser();
  const project = await createAuditProject(auth.token, auth.organization.id);
  const cookie = `vc_session=${auth.token}`;
  const endpointResults = await auditBackendPanels(project.id, cookie);
  const renderAudit = await auditPanelRender(project.id, auth.token);
  const interactionAudit = await auditCriticalUiInteractions(project.id, auth.token);
  const workspaceInteractionAudit = await auditWorkspaceUiInteractions(project.id, auth.token);
  const responsiveAudit = await auditResponsiveViewports(project.id, auth.token);
  const pageErrors = [
    ...renderAudit.errors,
    ...interactionAudit.errors,
    ...workspaceInteractionAudit.errors,
    ...responsiveAudit.errors,
  ].slice(0, 100);
  const browserErrorResults = pageErrors.map((error, index) => ({
    kind: 'page_error',
    panel: 'browser',
    ok: false,
    index,
    error,
  }));
  const results = [
    ...endpointResults,
    ...renderAudit.results,
    ...interactionAudit.results,
    ...workspaceInteractionAudit.results,
    ...responsiveAudit.results,
    ...browserErrorResults,
  ];

  return {
    generatedAt: new Date().toISOString(),
    appBaseUrl,
    apiBaseUrl,
    projectId: project.id,
    summary: summarize(results),
    groupCounts: countByKind(results),
    networkEvidence: networkEvidence(results),
    results,
    pageErrors,
  };
}

function hasTransientViteOptimizerFailure(output) {
  if (explicitAppBaseUrl || output.summary.failed === 0) {
    return false;
  }

  return output.pageErrors.some((error) =>
    /Invalid hook call|Failed to fetch dynamically imported module|optimized dependencies changed|Outdated Optimize Dep/i.test(
      error,
    ),
  );
}

function writeAuditReport(output) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  console.log(JSON.stringify(output.summary, null, 2));
  console.log(`projectId=${output.projectId}`);
  console.log(`report=${outFile}`);

  if (output.summary.failed > 0) {
    console.log(
      JSON.stringify(
        output.results.filter(
          (result) =>
            result.ok === false ||
            result.rendered === false ||
            result.applicationError === true ||
            result.expectedGuard === false,
        ),
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

try {
  await ensureLocalServices();

  let output = await runAuditPass();

  if (hasTransientViteOptimizerFailure(output)) {
    console.warn('Detected transient Vite dependency optimizer errors; retrying audit once after cache stabilization.');
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    output = await runAuditPass();
  }

  writeAuditReport(output);
} finally {
  await stopSpawnedProcesses();
}
