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
  'The Webview Preview is completely white and the Problems panel reports errors. Inspect the actual runtime and build diagnostics plus the generated files, fix every blocking error, run typecheck and build, then verify the booking app renders in Preview. Preserve the booking calendar, customer accounts, and reminder features.';

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
        const projectState = await readProjectIdeState(page, projectId, token);

        if (!projectState) {
          return false;
        }

        lastPaths = projectState.files.flatMap((file) => (file.path ? [file.path] : []));

        const hasPackage = lastPaths.some((path) => /(^|\/)package\.json$/.test(path));
        const hasApplication = lastPaths.some((path) => /(^|\/)(App\.(?:tsx|jsx)|main\.(?:tsx|jsx|js))$/.test(path));

        return hasPackage && hasApplication;
      },
      {
        message: 'The real agent run must create package.json and application source files',
        intervals: [1_000, 2_000, 3_000],
        timeout: GENERATION_TIMEOUT_MS,
      },
    )
    .toBe(true);

  return lastPaths;
}

async function readProjectIdeState(page: Page, projectId: string, token: string) {
  try {
    const response = await page.request.get(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/ide-state`,
      {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      },
    );

    if (!response.ok()) {
      return undefined;
    }

    const payload = (await response.json()) as {
      ideState?: {
        version?: number;
        state?: {
          files?: {
            entries?: Array<{ path?: string; content?: string }>;
          };
        };
      } | null;
    };

    if (!payload.ideState) {
      return undefined;
    }

    return {
      version: payload.ideState.version,
      files: payload.ideState.state?.files?.entries ?? [],
    };
  } catch {
    return undefined;
  }
}

async function waitForProjectToSettle(
  page: Page,
  agentPanel: ReturnType<Page['getByTestId']>,
  projectId: string,
  token: string,
  message: string,
) {
  let previousRevision: string | undefined;
  let stableChecks = 0;

  await expect
    .poll(
      async () => {
        const revision = await projectFilesRevision(page, projectId, token);

        if (revision && revision === previousRevision) {
          stableChecks += 1;
        } else {
          stableChecks = 0;
          previousRevision = revision;
        }

        const composer = agentPanel.getByRole('textbox', { name: 'Agent prompt' });
        const composerReady = await composer.isEnabled().catch(() => false);

        const completedProgress = await agentPanel
          .locator('[aria-label*="Agent Done"][aria-label*="100%"]')
          .last()
          .isVisible()
          .catch(() => false);

        return Boolean(revision) && stableChecks >= 7 && composerReady && completedProgress;
      },
      {
        message,
        intervals: [2_000, 3_000, 5_000],
        timeout: 4 * 60 * 1000,
      },
    )
    .toBe(true);
}

async function projectFilesRevision(page: Page, projectId: string, token: string) {
  const projectState = await readProjectIdeState(page, projectId, token);

  return projectState?.version === undefined ? undefined : String(projectState.version);
}

async function submitAgentPrompt(
  agentPanel: ReturnType<Page['getByTestId']>,
  prompt: string,
) {
  const composer = agentPanel.getByRole('textbox', { name: 'Agent prompt' });
  const stopButton = agentPanel.getByRole('button', { name: 'Stop generation' }).first();

  await expect(composer).toBeVisible({ timeout: 60_000 });

  if (await stopButton.isVisible().catch(() => false)) {
    const completedProgress = agentPanel.locator('[aria-label*="Agent Done"][aria-label*="100%"]').last();

    await expect(completedProgress).toBeVisible({ timeout: 60_000 });
    await stopButton.click();
    await expect(stopButton).toBeHidden({ timeout: 60_000 });
  }

  await composer.fill(prompt);
  await expect(composer).toHaveValue(prompt);
  await composer.press('Enter');

  return composer;
}

async function repairGeneratedPreview(
  page: Page,
  agentPanel: ReturnType<Page['getByTestId']>,
  projectId: string,
  token: string,
) {
  const initialRevision = await projectFilesRevision(page, projectId, token);

  await submitAgentPrompt(agentPanel, REPAIR_PROMPT);

  const repairBubble = agentPanel.locator('.bolt-chat-message-row-user').last();

  await expect(repairBubble).toBeVisible({ timeout: 60_000 });
  await expect(repairBubble).toContainText(REPAIR_PROMPT.slice(0, 80), { timeout: 60_000 });

  const stopButton = agentPanel.getByRole('button', { name: /^Stop/i }).first();

  await stopButton.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => undefined);

  await expect
    .poll(() => projectFilesRevision(page, projectId, token), {
      message: 'The repair prompt must update at least one generated project file',
      intervals: [1_000, 2_000, 3_000],
      timeout: GENERATION_TIMEOUT_MS,
    })
    .not.toBe(initialRevision);

  await waitForProjectToSettle(
    page,
    agentPanel,
    projectId,
    token,
    'Repair files must stabilize and the agent must report completion',
  );

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

async function waitForOrangePreview(page: Page, evidenceRoot: string) {
  let lastAudit = { orangeCount: 0, purpleCount: 0 };

  try {
    await expect
      .poll(
        async () => {
          const body = page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last().locator('body');

          lastAudit = await body.evaluate((previewBody) => {
            const previewDocument = previewBody.ownerDocument;
            const previewWindow = previewDocument.defaultView;

            if (!previewWindow) {
              return { orangeCount: 0, purpleCount: 0 };
            }

            const colors = new Set<string>();

            for (const element of previewDocument.querySelectorAll('*')) {
              const style = previewWindow.getComputedStyle(element);

              for (const value of [
                style.color,
                style.backgroundColor,
                style.borderTopColor,
                style.borderRightColor,
                style.borderBottomColor,
                style.borderLeftColor,
                style.outlineColor,
                style.fill,
                style.stroke,
              ]) {
                if (value && value !== 'none' && value !== 'transparent') {
                  colors.add(value);
                }
              }
            }

            const hueFor = (red: number, green: number, blue: number) => {
              const r = red / 255;
              const g = green / 255;
              const b = blue / 255;
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              const delta = max - min;

              if (delta === 0) {
                return { hue: 0, saturation: 0, lightness: max };
              }

              let hue = 0;

              if (max === r) {
                hue = ((g - b) / delta) % 6;
              } else if (max === g) {
                hue = (b - r) / delta + 2;
              } else {
                hue = (r - g) / delta + 4;
              }

              hue = Math.round(hue * 60);

              if (hue < 0) {
                hue += 360;
              }

              const lightness = (max + min) / 2;
              const saturation = delta / (1 - Math.abs(2 * lightness - 1));

              return { hue, saturation, lightness };
            };

            let orangeCount = 0;
            let purpleCount = 0;

            for (const color of colors) {
              const match = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*\/\s*([\d.]+)|[,\s]+([\d.]+))?/i);

              if (!match) {
                continue;
              }

              const alpha = Number(match[4] ?? match[5] ?? 1);

              if (alpha === 0) {
                continue;
              }

              const { hue, saturation, lightness } = hueFor(Number(match[1]), Number(match[2]), Number(match[3]));
              const visibleAccent = saturation >= 0.38 && lightness >= 0.2 && lightness <= 0.82;

              if (!visibleAccent) {
                continue;
              }

              if (hue >= 10 && hue <= 42) {
                orangeCount += 1;
              }

              if (hue >= 255 && hue <= 345) {
                purpleCount += 1;
              }
            }

            return { orangeCount, purpleCount };
          });

          return lastAudit.orangeCount > 0 && lastAudit.purpleCount === 0;
        },
        {
          message: 'The refreshed Preview must contain orange accents and no purple, violet, mauve, or pink accents',
          timeout: PREVIEW_TIMEOUT_MS,
        },
      )
      .toBe(true);
  } catch (error) {
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '04-orange-preview-audit-failed.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    throw new Error(
      `Preview accent audit failed (orange=${lastAudit.orangeCount}, purple=${lastAudit.purpleCount})`,
      { cause: error },
    );
  }

  return lastAudit;
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

  if (existingProjectId && !existingEmail) {
    throw new Error('APP_BUILDER_PROOF_EMAIL is required when APP_BUILDER_PROOF_PROJECT_ID is provided');
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

      const dismissOnboarding = page.getByRole('button', { name: 'Not now' });

      if (await dismissOnboarding.isVisible().catch(() => false)) {
        await dismissOnboarding.click();
      }

      const providerDropdown = page.getByTestId('ai-provider-dropdown').getByRole('combobox', { name: 'AI provider' });

      if (await providerDropdown.isVisible().catch(() => false)) {
        await expect(providerDropdown).toContainText(/Anthropic|OpenAI|Google/, { timeout: 30_000 });
        await expect(
          page.getByTestId('ai-model-dropdown').getByRole('combobox', { name: 'AI model' }),
        ).not.toContainText('No option available');
      }

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
    await expect(promptBubble).toBeVisible({ timeout: 180_000 });
    await expect(page.locator('.bolt-file-tree-name').first()).toBeVisible({ timeout: 180_000 });

    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '01-agent-started.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    const generatedFiles = await waitForGeneratedFiles(page, projectId, token);
    if (!repairOnly && !iterationOnly) {
      await waitForProjectToSettle(
        page,
        agentPanel,
        projectId,
        token,
        'Generated files must stabilize and the agent composer must become active again',
      );
    }
    process.stdout.write(`${JSON.stringify({ status: 'initial-generation-settled', locale, generatedFiles: generatedFiles.length })}\n`);

    if (repairOnly) {
      const repairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token);
      const { previewText } = await waitForPreview(page, evidenceRoot);

      await repairBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(evidenceRoot, '03-agent-repair-finished.png'),
        animations: 'disabled',
        caret: 'hide',
      });
      process.stdout.write(
        `${JSON.stringify({
          locale,
          projectId,
          repairPrompt: REPAIR_PROMPT,
          generatedFilesUpdated: true,
          previewVerified: true,
          previewTextSample: previewText.slice(0, 240),
        })}\n`,
      );
      await context.close();
      context = undefined!;

      return;
    }

    let previewText = '';

    try {
      ({ previewText } = await waitForPreview(page, evidenceRoot));
    } catch (previewError) {
      if (iterationOnly) {
        throw previewError;
      }

      const repairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token);

      ({ previewText } = await waitForPreview(page, evidenceRoot));
      await repairBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(evidenceRoot, '03-agent-repair-finished.png'),
        animations: 'disabled',
        caret: 'hide',
      });
      process.stdout.write(
        `${JSON.stringify({
          status: 'preview-repaired',
          locale,
          projectId,
          repairPrompt: REPAIR_PROMPT,
          previewTextSample: previewText.slice(0, 240),
        })}\n`,
      );
    }

    let iterationBubble: ReturnType<typeof agentPanel.locator> | undefined;
    let accentAudit: { orangeCount: number; purpleCount: number } | undefined;

    if (iterationPrompt) {
      const initialRevision = await projectFilesRevision(page, projectId, token);
      const previousLastBubble = agentPanel.locator('.bolt-chat-message-row-user').last();
      const previousIterationText = (await previousLastBubble.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

      if (!previousIterationText.includes(iterationPrompt.slice(0, 80))) {
        await submitAgentPrompt(agentPanel, iterationPrompt);
      }

      iterationBubble = agentPanel.locator('.bolt-chat-message-row-user').last();
      await expect(iterationBubble).toBeVisible({ timeout: 60_000 });
      await expect(iterationBubble).toContainText(iterationPrompt.slice(0, 80), { timeout: 60_000 });

      await expect
        .poll(() => projectFilesRevision(page, projectId, token), {
          message: 'The orange-theme iteration must update at least one generated project file',
          intervals: [1_000, 2_000, 3_000],
          timeout: GENERATION_TIMEOUT_MS,
        })
        .not.toBe(initialRevision);
      await waitForProjectToSettle(
        page,
        agentPanel,
        projectId,
        token,
        'Orange-theme files must stabilize and the agent composer must become active again',
      );
      process.stdout.write(`${JSON.stringify({ status: 'orange-iteration-settled', locale })}\n`);

      ({ previewText } = await waitForPreview(page, evidenceRoot));
      accentAudit = await waitForOrangePreview(page, evidenceRoot);
    }

    if (!iterationOnly) {
      await promptBubble.scrollIntoViewIfNeeded();
    }

    await page.evaluate(`document.activeElement && document.activeElement.blur();`);
    await page.evaluate(`document.fonts && document.fonts.ready`);

    const previewOutput = resolve(outputRoot, 'ide-agent-preview.png');
    await mkdir(dirname(previewOutput), { recursive: true });

    if (!iterationOnly || iterationPrompt) {
      await page.screenshot({ path: previewOutput, animations: 'disabled', caret: 'hide' });
    }

    let iterationOutput: string | undefined;

    if (iterationPrompt && iterationBubble) {
      if (await iterationBubble.isVisible().catch(() => false)) {
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
          accentAudit,
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
