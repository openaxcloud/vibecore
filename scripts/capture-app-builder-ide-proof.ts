import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { chromium, expect, type Page } from '@playwright/test';

type CaptureLocale = 'en' | 'fr';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const API_BASE_URL = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const GENERATION_TIMEOUT_MS = 12 * 60 * 1000;
const PREVIEW_TIMEOUT_MS = 8 * 60 * 1000;

const REPAIR_PROMPT =
  process.env.APP_BUILDER_PROOF_REPAIR_PROMPT?.trim() ??
  'Fix the Vite syntax error in src/pages/Calendar.tsx around line 252 (Unexpected token, expected a comma). Run the app and verify the Preview renders the booking dashboard without errors. Preserve the existing calendar behavior.';

const LOCALE_CONFIG = {
  en: {
    prompt: 'Create a booking app for my hair salon, with a calendar, customer accounts, and email reminders.',
    accountName: 'App Builder proof EN',
    organizationName: 'App Builder proof EN',
  },
  fr: {
    prompt:
      'Crée une app de réservation pour mon salon de coiffure, avec agenda, comptes clients et rappels par email.',
    accountName: 'Preuve App Builder FR',
    organizationName: 'Preuve App Builder FR',
  },
} as const satisfies Record<CaptureLocale, { prompt: string; accountName: string; organizationName: string }>;

function readLocale(): CaptureLocale {
  const value = process.argv.find((argument) => argument.startsWith('--locale='))?.split('=')[1];

  if (value === 'en' || value === 'fr') {
    return value;
  }

  throw new Error('Pass --locale=en or --locale=fr');
}

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
}

async function authenticate(page: Page, locale: CaptureLocale) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const copy = LOCALE_CONFIG[locale];
  const existingEmail = process.env.APP_BUILDER_PROOF_EMAIL?.trim();
  const existingPassword = process.env.APP_BUILDER_PROOF_PASSWORD?.trim();
  const registrationPassword = `Ecode-${randomBytes(24).toString('base64url')}-9a!`;

  if (existingEmail && !existingPassword) {
    throw new Error('APP_BUILDER_PROOF_PASSWORD is required when APP_BUILDER_PROOF_EMAIL is set');
  }

  let responseText = '';
  let payload: { token: string } | undefined;
  let authenticatedEmail = existingEmail;

  if (existingEmail) {
    const response = await page.request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: existingEmail, password: existingPassword },
    });

    responseText = await response.text();

    if (!response.ok()) {
      throw new Error(`Login failed (${response.status()}): ${responseText}`);
    }

    payload = JSON.parse(responseText) as { token: string };
  }

  for (let attempt = 0; !payload && attempt < 4; attempt += 1) {
    const registrationEmail = `app-builder-proof-${locale}-${suffix}-${attempt}@local.test`;

    const response = await page.request.post(`${API_BASE_URL}/auth/register`, {
      data: {
        email: registrationEmail,
        password: registrationPassword,
        name: copy.accountName,
        organizationName: `${copy.organizationName} ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      payload = JSON.parse(responseText) as { token: string };
      authenticatedEmail = registrationEmail;
      break;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    throw new Error(`Registration failed (${response.status()}): ${responseText}`);
  }

  if (!payload) {
    throw new Error(`Registration did not return a session: ${responseText}`);
  }

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      url: APP_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'vibecore-lang',
      value: locale,
      url: APP_BASE_URL,
      sameSite: 'Lax',
    },
  ]);

  if (!authenticatedEmail) {
    throw new Error('Authentication completed without an email address');
  }

  return { token: payload.token, email: authenticatedEmail };
}

async function resolveProjectId(page: Page, token: string) {
  const url = new URL(page.url());
  const legacyProjectId = url.pathname.match(/\/projects\/([^/]+)\/ide/)?.[1];

  if (legacyProjectId) {
    return legacyProjectId;
  }

  const canonicalMatch = url.pathname.match(/^\/@([^/]+)\/([^/?]+)\/?$/);

  if (!canonicalMatch) {
    throw new Error(`Could not read project route from ${page.url()}`);
  }

  const [, accountSlug, projectSlug] = canonicalMatch;

  const response = await page.request.get(
    `${API_BASE_URL}/projects/resolve?accountSlug=${encodeURIComponent(decodeURIComponent(accountSlug))}&projectSlug=${encodeURIComponent(decodeURIComponent(projectSlug))}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (!response.ok()) {
    throw new Error(`Project resolution failed (${response.status()}): ${await response.text()}`);
  }

  const payload = (await response.json()) as { project?: { id?: string } };

  if (!payload.project?.id) {
    throw new Error(`Project resolution returned no id for ${page.url()}`);
  }

  return payload.project.id;
}

async function waitForGeneratedFiles(page: Page, projectId: string, token: string) {
  let lastPaths: string[] = [];

  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/files`, {
          headers: { authorization: `Bearer ${token}` },
        });

        if (!response.ok()) {
          return false;
        }

        const payload = (await response.json()) as { files?: Array<{ path?: string }> };
        lastPaths = (payload.files ?? []).flatMap((file) => (file.path ? [file.path] : []));

        const hasPackage = lastPaths.some((path) => /(^|\/)package\.json$/.test(path));
        const hasApplication = lastPaths.some((path) => /(^|\/)(App\.(?:tsx|jsx)|main\.(?:tsx|jsx|js))$/.test(path));

        return hasPackage && hasApplication;
      },
      {
        message: 'The real agent run must create package.json and application source files',
        timeout: GENERATION_TIMEOUT_MS,
      },
    )
    .toBe(true);

  return lastPaths;
}

async function projectFilesRevision(page: Page, projectId: string, token: string) {
  const response = await page.request.get(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/files`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok()) {
    return undefined;
  }

  const payload = (await response.json()) as {
    files?: Array<{ path?: string; updatedAt?: string; sizeBytes?: number }>;
  };

  return (payload.files ?? [])
    .map((file) => `${file.path ?? ''}:${file.updatedAt ?? ''}:${file.sizeBytes ?? 0}`)
    .sort()
    .join('|');
}

async function repairGeneratedPreview(
  page: Page,
  agentPanel: ReturnType<Page['getByTestId']>,
  projectId: string,
  token: string,
) {
  const initialRevision = await projectFilesRevision(page, projectId, token);
  const composer = agentPanel.getByRole('textbox', { name: 'Agent prompt' });

  await expect(composer).toBeVisible({ timeout: 60_000 });
  await composer.fill(REPAIR_PROMPT);
  await composer.press('Enter');

  const repairBubble = agentPanel.locator('.bolt-chat-message-row-user').last();

  await expect(repairBubble).toBeVisible({ timeout: 60_000 });
  await expect(repairBubble).toContainText(REPAIR_PROMPT.slice(0, 80), { timeout: 60_000 });

  const stopButton = agentPanel.getByRole('button', { name: /^Stop/i }).first();

  await stopButton.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => undefined);

  await expect
    .poll(() => projectFilesRevision(page, projectId, token), {
      message: 'The repair prompt must update at least one generated project file',
      timeout: GENERATION_TIMEOUT_MS,
    })
    .not.toBe(initialRevision);

  if (await stopButton.isVisible().catch(() => false)) {
    await expect(stopButton).toBeHidden({ timeout: GENERATION_TIMEOUT_MS });
  }

  return repairBubble;
}

async function waitForPreview(page: Page, evidenceRoot: string) {
  const webviewButton = page.getByRole('button', { name: 'Webview' }).first();

  await expect(webviewButton).toBeVisible({ timeout: 60_000 });
  await webviewButton.click();

  const iframe = page.locator('iframe[data-testid="preview-iframe"]:visible').last();
  await expect(iframe).toBeVisible({ timeout: PREVIEW_TIMEOUT_MS });

  const body = page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last().locator('body');

  let previewText = '';

  const readPreviewText = async () => {
    previewText = (await body.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

    return previewText.length;
  };

  const existingPreviewAttached = await expect
    .poll(readPreviewText, {
      message: 'Attach to an already-running project preview before starting another dev server',
      timeout: 60_000,
    })
    .toBeGreaterThan(120)
    .then(() => true)
    .catch(() => false);

  if (!existingPreviewAttached) {
    const previewRunButton = page.getByRole('button', { name: 'Run to preview your app' }).first();

    const previewRunVisible = await previewRunButton
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (previewRunVisible) {
      await previewRunButton.click({ noWaitAfter: true });
    } else {
      const topRunButton = page.getByTestId('button-run-stop');
      const topRunLabel = (await topRunButton.textContent().catch(() => ''))?.trim() ?? '';

      if (topRunLabel === 'Stop') {
        await topRunButton.click({ noWaitAfter: true });
        await expect(topRunButton).toContainText('Run', { timeout: 60_000 });
        await topRunButton.click({ noWaitAfter: true });
      } else if (topRunLabel === 'Run') {
        await topRunButton.click({ noWaitAfter: true });
      }
    }
  }

  try {
    if (!existingPreviewAttached) {
      await expect
        .poll(readPreviewText, {
          message: 'Preview must render substantial application content',
          timeout: PREVIEW_TIMEOUT_MS,
        })
        .toBeGreaterThan(120);
    }
  } catch (error) {
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '02-preview-failed.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    const previewStatus = await page
      .getByTestId('preview-not-running-state')
      .innerText()
      .catch(() => 'No visible preview status');

    throw new Error(`Preview stayed empty. Visible status: ${previewStatus.replace(/\s+/g, ' ').trim()}`, {
      cause: error,
    });
  }

  if (
    /internal server error|failed to resolve import|cannot find module|vite error|unexpected token|uncaught typeerror|plugin:vite/i.test(
      previewText,
    )
  ) {
    throw new Error(`Preview contains a runtime error: ${previewText.slice(0, 500)}`);
  }

  const previewShot = await iframe.screenshot({ animations: 'disabled', type: 'png' });

  if (previewShot.byteLength < 20_000) {
    throw new Error(`Preview screenshot is unexpectedly small (${previewShot.byteLength} bytes)`);
  }

  return { iframe, previewText };
}

async function main() {
  const locale = readLocale();
  const copy = LOCALE_CONFIG[locale];
  const repairOnly = process.argv.includes('--repair-only');
  const iterationOnly = process.argv.includes('--iteration-only');
  const existingEmail = process.env.APP_BUILDER_PROOF_EMAIL?.trim();
  const existingProjectId = process.env.APP_BUILDER_PROOF_PROJECT_ID?.trim();
  const iterationPrompt = process.env.APP_BUILDER_PROOF_ITERATION_PROMPT?.trim();
  const browserProfile = process.env.APP_BUILDER_PROOF_BROWSER_PROFILE?.trim();
  const outputRoot = resolve(process.cwd(), 'public/assets/solutions/app-builder', locale);
  const evidenceRoot = resolve(process.cwd(), 'outputs/solutions/app-builder/ide-proof', locale);

  if (Boolean(existingEmail) !== Boolean(existingProjectId)) {
    throw new Error('APP_BUILDER_PROOF_EMAIL and APP_BUILDER_PROOF_PROJECT_ID must be provided together');
  }

  const contextOptions = {
    baseURL: APP_BASE_URL,
    colorScheme: 'dark' as const,
    locale: locale === 'fr' ? 'fr-FR' : 'en-US',
    reducedMotion: 'reduce' as const,
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
  };

  const browser = browserProfile ? undefined : await chromium.launch({ headless: true });

  let context = browserProfile
    ? await chromium.launchPersistentContext(resolve(browserProfile), { headless: true, ...contextOptions })
    : await browser!.newContext(contextOptions);

  try {
    await context.addInitScript(`
      localStorage.setItem('bolt_theme', 'dark');
      localStorage.setItem('vibecore-project-ide-guided-tour-v1', 'complete');
    `);

    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.setDefaultNavigationTimeout(180_000);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const { token, email } = await authenticate(page, locale);

    let projectId = existingProjectId;

    if (projectId) {
      await page.goto(`/projects/${encodeURIComponent(projectId)}/ide`, {
        waitUntil: 'domcontentloaded',
        timeout: 180_000,
      });
    } else {
      await page.goto('/projects/new', { waitUntil: 'domcontentloaded', timeout: 180_000 });

      await mkdir(evidenceRoot, { recursive: true });
      await page.screenshot({
        path: resolve(evidenceRoot, '00-project-new.png'),
        animations: 'disabled',
        caret: 'hide',
      });

      const promptField = page.locator('textarea[name="prompt"]');

      await expect(promptField).toBeVisible({ timeout: 120_000 });
      await expect(
        page.getByTestId('ai-provider-dropdown').getByRole('combobox', { name: 'AI provider' }),
      ).toContainText(/Anthropic|OpenAI|Google/, { timeout: 30_000 });
      await expect(page.getByTestId('ai-model-dropdown').getByRole('combobox', { name: 'AI model' })).not.toContainText(
        'No option available',
      );
      await promptField.fill(copy.prompt);
      await page.getByRole('button', { name: 'Create project' }).click();
      await page.waitForURL(/(?:\/projects\/[^/]+\/ide|\/@[^/]+\/[^/?]+)(?:\?.*)?$/, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });

      projectId = await resolveProjectId(page, token);
    }

    if (!projectId) {
      throw new Error('No project id available for capture');
    }

    process.stdout.write(`${JSON.stringify({ status: 'project-ready', locale, projectId, email })}\n`);

    const agentPanel = page.getByTestId('ide-agent-panel');
    const promptBubble = page.getByText(copy.prompt, { exact: true }).first();
    await expect(agentPanel).toBeVisible({ timeout: 180_000 });

    if (!repairOnly && !iterationOnly) {
      await expect(promptBubble).toBeVisible({ timeout: 60_000 });
    }

    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '01-agent-started.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    const generatedFiles = await waitForGeneratedFiles(page, projectId, token);
    const stopButton = agentPanel.getByRole('button', { name: /^Stop/i }).first();

    if (await stopButton.isVisible().catch(() => false)) {
      await expect(stopButton).toBeHidden({ timeout: GENERATION_TIMEOUT_MS });
    }

    if (repairOnly) {
      const repairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token);

      await repairBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(evidenceRoot, '03-agent-repair-finished.png'),
        animations: 'disabled',
        caret: 'hide',
      });
      process.stdout.write(
        `${JSON.stringify({ locale, projectId, repairPrompt: REPAIR_PROMPT, generatedFilesUpdated: true })}\n`,
      );
      await context.close();
      context = undefined!;

      return;
    }

    const { previewText } = await waitForPreview(page, evidenceRoot);

    if (!iterationOnly) {
      await promptBubble.scrollIntoViewIfNeeded();
    }

    await page.evaluate(`document.activeElement && document.activeElement.blur();`);
    await page.evaluate(`document.fonts && document.fonts.ready`);

    const previewOutput = resolve(outputRoot, 'ide-agent-preview.png');
    await mkdir(dirname(previewOutput), { recursive: true });

    if (!iterationOnly) {
      await page.screenshot({ path: previewOutput, animations: 'disabled', caret: 'hide' });
    }

    let iterationOutput: string | undefined;

    if (iterationPrompt) {
      const iterationBubble = agentPanel.locator('.bolt-chat-message-row-user').last();
      const iterationText = (await iterationBubble.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

      if (
        iterationText.includes(iterationPrompt.slice(0, 80)) &&
        (await iterationBubble.isVisible().catch(() => false))
      ) {
        const dismissPreviewError = agentPanel.getByRole('button', { name: 'Dismiss' }).last();

        if (await dismissPreviewError.isVisible().catch(() => false)) {
          await dismissPreviewError.click();
        }

        const hideLogsButton = page.getByRole('button', { name: /Hide workspace logs/i }).first();

        if (await hideLogsButton.isVisible().catch(() => false)) {
          await hideLogsButton.click();
        }

        await iterationBubble.scrollIntoViewIfNeeded();
        iterationOutput = resolve(outputRoot, 'ide-agent-iteration.png');
        await page.screenshot({ path: iterationOutput, animations: 'disabled', caret: 'hide' });
      }
    }

    const editorButton = page.getByRole('button', { name: 'Editor' }).first();

    if (await editorButton.isVisible().catch(() => false)) {
      await editorButton.click();

      const appFile = page
        .locator('.bolt-file-tree-name[title="App.tsx"], .bolt-file-tree-name[title="App.jsx"]')
        .first();

      if (await appFile.isVisible().catch(() => false)) {
        await appFile.click();
      }

      await promptBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(outputRoot, 'ide-agent-files.png'),
        animations: 'disabled',
        caret: 'hide',
      });
    }

    const problemsButton = page.getByRole('button', { name: /^Open Problems\./ }).first();
    const problemsSummary = await problemsButton.getAttribute('aria-label').catch(() => null);

    let problemDetails: string[] = [];

    if (await problemsButton.isVisible().catch(() => false)) {
      await problemsButton.click();

      const problemsPanel = page.getByRole('region', { name: 'Problems' });

      if (await problemsPanel.isVisible().catch(() => false)) {
        problemDetails = await problemsPanel.locator('.bolt-project-problem-item').allInnerTexts();
      }
    }

    process.stdout.write(
      JSON.stringify(
        {
          locale,
          projectId,
          projectUrl: page.url(),
          prompt: copy.prompt,
          generatedFileCount: generatedFiles.length,
          previewTextSample: previewText.slice(0, 240),
          consoleErrors,
          pageErrors,
          previewOutput,
          iterationOutput,
          problemsSummary,
          problemDetails,
        },
        null,
        2,
      ) + '\n',
    );

    await context.close();
    context = undefined!;
  } finally {
    await context?.close();
    await browser?.close();
  }
}

await main();
