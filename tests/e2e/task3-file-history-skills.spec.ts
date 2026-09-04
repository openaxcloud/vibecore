import { expect, test, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const HISTORY_PATH = 'index.html';
const PREVIEW_MARKER = 'task3-preview';
const WORKSPACE_BOOT_TIMEOUT = 180_000;

interface AuthFixture {
  token: string;
  organization: { id: string };
}

interface ProjectFixture {
  auth: AuthFixture;
  projectId: string;
  workspaceId: string;
}

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function register(page: Page): Promise<AuthFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let auth: AuthFixture | undefined;
  let responseText = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.request.post(`${API_BASE_URL}/auth/register`, {
      data: {
        email: `task3-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Task 3 live QA',
        organizationName: `Task 3 live QA ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      auth = JSON.parse(responseText) as AuthFixture;
      break;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    expect(response.ok(), responseText).toBeTruthy();
  }

  expect(auth, responseText).toBeTruthy();

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: auth!.token,
      url: APP_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return auth!;
}

async function createProject(page: Page): Promise<ProjectFixture> {
  const auth = await register(page);

  const created = await page.request.post(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: `Task 3 File History ${Date.now()}` },
  });

  expect(created.ok(), await created.text()).toBeTruthy();

  const projectId = ((await created.json()) as { project: { id: string } }).project.id;
  const zip = new JSZip();
  zip.file(HISTORY_PATH, versionContent('baseline'));

  const imported = await page.request.post(`${API_BASE_URL}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();

  const createdWorkspace = await page.request.post(`${API_BASE_URL}/projects/${projectId}/workspaces`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Task 3 live QA workspace', runtimeMode: 'remote-kubernetes' },
  });
  expect(createdWorkspace.ok(), await createdWorkspace.text()).toBeTruthy();

  const workspaceId = ((await createdWorkspace.json()) as { workspace: { id: string } }).workspace.id;

  return { auth, projectId, workspaceId };
}

async function openRunningEditor(page: Page, fixture: ProjectFixture) {
  await page.goto(`/projects/${fixture.projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('responsive-code-editor').first()).toBeVisible({ timeout: WORKSPACE_BOOT_TIMEOUT });

  const runtimeStatus = page.getByRole('button', { name: /Workspace:/i }).first();

  if (await runtimeStatus.isVisible().catch(() => false)) {
    await expect(runtimeStatus).not.toHaveAccessibleName(/Workspace:\s*(?:error|failed)/i);
  }
}

function versionContent(label: string) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>',
    `  <body><main id="${PREVIEW_MARKER}" data-version="${label}">File History ${label}</main></body>`,
    '</html>',
    '',
  ].join('\n');
}

async function writeVersion(request: APIRequestContext, fixture: ProjectFixture, label: string, operationId: string) {
  const response = await request.put(
    `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(fixture.workspaceId)}/files/write`,
    {
      headers: {
        authorization: `Bearer ${fixture.auth.token}`,
        'x-file-history-operation-id': operationId,
        'x-file-history-source': 'editor',
      },
      data: {
        path: HISTORY_PATH,
        content: versionContent(label),
        encoding: 'utf8',
      },
    },
  );

  expect(response.ok(), await response.text()).toBeTruthy();
}

async function openFileHistory(page: Page, options: { touchTarget?: boolean } = {}) {
  await page.evaluate((filePath) => {
    window.dispatchEvent(new CustomEvent('vibecore:open-editor-file', { detail: { filePath } }));
  }, HISTORY_PATH);

  const trigger = page.getByTestId('file-history-trigger');
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await expect(trigger).toHaveAccessibleName('Open file history');

  const readPlacement = () =>
    trigger.evaluate((button) => {
      const host = button.closest('.vc-file-history-host');

      if (!(host instanceof HTMLElement)) {
        throw new Error('History must be anchored inside the open editor host.');
      }

      const buttonRect = button.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();

      return {
        bottomGap: hostRect.bottom - buttonRect.bottom,
        rightGap: hostRect.right - buttonRect.right,
        height: buttonRect.height,
        width: buttonRect.width,
      };
    });

  await expect
    .poll(
      async () => {
        const placement = await readPlacement();

        return (
          placement.rightGap >= 8 && placement.rightGap <= 16 && placement.bottomGap >= 8 && placement.bottomGap <= 16
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  const placement = await readPlacement();

  expect(placement.rightGap).toBeGreaterThanOrEqual(8);
  expect(placement.rightGap).toBeLessThanOrEqual(16);
  expect(placement.bottomGap).toBeGreaterThanOrEqual(8);
  expect(placement.bottomGap).toBeLessThanOrEqual(16);
  expect(placement.width).toBeGreaterThan(0);

  if (options.touchTarget) {
    expect(placement.height).toBeGreaterThanOrEqual(43.5);
    expect(placement.width).toBeGreaterThanOrEqual(43.5);
  }

  await trigger.click();

  const overlay = page.getByTestId('file-history-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('aria-modal', 'true');
  await expect(overlay).toHaveAccessibleName('File History');
  await expect(overlay.getByRole('slider', { name: 'File history version' })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => overlay.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expectNamedControls(overlay);

  return overlay;
}

async function listHistory(request: APIRequestContext, fixture: ProjectFixture) {
  const search = new URLSearchParams({ workspaceId: fixture.workspaceId, path: HISTORY_PATH, limit: '100' });

  const response = await request.get(`${API_BASE_URL}/projects/${fixture.projectId}/file-history?${search}`, {
    headers: { authorization: `Bearer ${fixture.auth.token}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();

  return (await response.json()) as {
    versions: Array<{ id: string; operation: string }>;
    latestVersionId?: string;
    total: number;
  };
}

async function readWorkspaceFile(request: APIRequestContext, fixture: ProjectFixture) {
  const response = await request.get(
    `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(fixture.workspaceId)}/files/read?path=${encodeURIComponent(HISTORY_PATH)}`,
    { headers: { authorization: `Bearer ${fixture.auth.token}` } },
  );
  expect(response.ok(), await response.text()).toBeTruthy();

  return (await response.json()) as { path: string; content: string; encoding?: string };
}

async function selectFirstVersion(overlay: Locator) {
  const slider = overlay.getByRole('slider', { name: 'File history version' });
  await slider.fill('0');
  await expect(slider).toHaveValue('0');
  await expect(overlay.getByRole('button', { name: 'Restore' })).toBeEnabled({ timeout: 15_000 });
}

async function assertSurfaceFitsViewport(page: Page, selector: string, options: { verticalFit?: boolean } = {}) {
  const metrics = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();

    return {
      documentWidth: document.documentElement.scrollWidth,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);

  if (options.verticalFit) {
    expect(metrics.top).toBeGreaterThanOrEqual(-1);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  }
}

async function expectNamedControls(scope: Locator) {
  const unnamed = await scope
    .locator('button:visible, input[type="range"]:visible, [role="switch"]:visible')
    .evaluateAll((controls) =>
      controls
        .map((control) => ({
          tag: control.tagName.toLowerCase(),
          label:
            control.getAttribute('aria-label')?.trim() ||
            control.getAttribute('title')?.trim() ||
            control.textContent?.trim() ||
            '',
        }))
        .filter((control) => !control.label),
    );

  expect(unnamed, JSON.stringify(unnamed)).toEqual([]);
}

async function expectTouchTargets(scope: Locator) {
  const shortTargets = await scope
    .locator(
      'button:visible, a[href]:visible, input:not([type="hidden"]):visible, select:visible, textarea:visible, [role="switch"]:visible',
    )
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const rect = control.getBoundingClientRect();
          return {
            label:
              control.getAttribute('aria-label')?.trim() ||
              control.getAttribute('title')?.trim() ||
              control.textContent?.trim() ||
              control.getAttribute('name') ||
              control.tagName,
            height: rect.height,
            width: rect.width,
          };
        })
        .filter((control) => control.height < 43.5 || control.width < 43.5),
    );

  expect(shortTargets, JSON.stringify(shortTargets)).toEqual([]);
}

async function expectNoMobileChromeOverlap(page: Page, surface: Locator) {
  const overlaps = await surface.evaluate((element) => {
    const chrome = [
      document.querySelector('[data-testid="mobile-bottom-navigation"]'),
      document.querySelector('.bolt-project-statusbar-mobile'),
    ]
      .filter((candidate): candidate is Element => candidate instanceof Element)
      .filter((candidate) => {
        const style = window.getComputedStyle(candidate);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

    const interactiveSelector =
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="switch"], [tabindex]:not([tabindex="-1"])';
    const candidates = [
      ...(element.matches(interactiveSelector) ? [element] : []),
      ...Array.from(element.querySelectorAll(interactiveSelector)),
    ].filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement);

    return candidates.flatMap((candidate) => {
      const candidateStyle = window.getComputedStyle(candidate);
      const candidateRect = candidate.getBoundingClientRect();

      if (
        candidateStyle.display === 'none' ||
        candidateStyle.visibility === 'hidden' ||
        candidateRect.width === 0 ||
        candidateRect.height === 0 ||
        candidateRect.bottom <= 0 ||
        candidateRect.top >= window.innerHeight
      ) {
        return [];
      }

      return chrome
        .map((chromeElement) => {
          const chromeRect = chromeElement.getBoundingClientRect();

          const width = Math.max(
            0,
            Math.min(candidateRect.right, chromeRect.right) - Math.max(candidateRect.left, chromeRect.left),
          );
          const height = Math.max(
            0,
            Math.min(candidateRect.bottom, chromeRect.bottom) - Math.max(candidateRect.top, chromeRect.top),
          );

          return {
            control:
              candidate.getAttribute('aria-label')?.trim() ||
              candidate.getAttribute('title')?.trim() ||
              candidate.textContent?.trim() ||
              candidate.tagName,
            chrome: chromeElement.getAttribute('data-testid') ?? chromeElement.className,
            area: width * height,
          };
        })
        .filter((overlap) => overlap.area > 1);
    });
  });

  expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
}

async function setThemeWithVisibleToggle(page: Page, theme: 'dark' | 'light') {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const toggle = page
    .locator('[data-testid="button-theme-toggle"]:visible, [data-testid="public-theme-toggle"]:visible')
    .first();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await expect(toggle).toHaveAccessibleName(/\S/);

  if ((await page.locator('html').getAttribute('data-theme')) !== theme) {
    await toggle.click();
  }

  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('bolt_theme'))).toBe(theme);
}

async function expectPreviewNonBlank(page: Page, fixture: ProjectFixture, expectedLabel: string) {
  await page.goto(`/projects/${fixture.projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('responsive-code-editor').first()).toBeVisible({ timeout: WORKSPACE_BOOT_TIMEOUT });
  await page.getByRole('button', { name: 'Webview' }).click();

  const frame = page.locator('iframe[title="preview"]').first();
  await expect(frame).toBeVisible({ timeout: 180_000 });

  const marker = page.frameLocator('iframe[title="preview"]').locator(`#${PREVIEW_MARKER}`);
  await expect(marker).toContainText(`File History ${expectedLabel}`, { timeout: 180_000 });

  const rendered = await marker.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, text: element.textContent?.trim(), width: rect.width };
  });
  expect(rendered.text).toBe(`File History ${expectedLabel}`);
  expect(rendered.width).toBeGreaterThan(0);
  expect(rendered.height).toBeGreaterThan(0);
}

async function openSkillsCatalog(page: Page, fixture: ProjectFixture, theme: 'dark' | 'light') {
  await page.goto(`/projects/${fixture.projectId}/ide?panel=skills`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  const skillsPanel = page.locator('[data-testid="ide-service-panel"][data-panel="skills"]').first();
  await expect(skillsPanel).toBeVisible({ timeout: 45_000 });

  const surface = skillsPanel.getByRole('region', { name: 'Open-standard Agent Skills' });
  await expect(surface).toBeVisible({ timeout: 30_000 });
  await expect(skillsPanel.getByText(/Metadata is discovered first/i)).toBeVisible();
  await expect(skillsPanel.getByText('.agents/skills/<name>/SKILL.md')).toBeVisible();
  await expect(skillsPanel.getByRole('link', { name: /agentskills\.io/i })).toHaveAttribute(
    'href',
    'https://agentskills.io/specification',
  );
  await skillsPanel.getByRole('button', { name: /^Open catalog/i }).click();
  await expect(skillsPanel.getByText(/Catalog inclusion is not an approval/i)).toBeVisible();
  await expect(skillsPanel.getByText('Audit required').first()).toBeVisible();
  await expect(skillsPanel.getByRole('button', { name: 'Import & audit' }).first()).toBeEnabled();
  await expectNamedControls(surface);

  return { skillsPanel, surface };
}

test('File History performs real navigation, diff, playback, and append-only restore', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'One real backend mutation proof is sufficient; layout runs on all devices.',
  );
  test.setTimeout(600_000);

  const fixture = await createProject(page);
  await openRunningEditor(page, fixture);
  await expectPreviewNonBlank(page, fixture, 'baseline');
  await openRunningEditor(page, fixture);
  await writeVersion(page.request, fixture, 'first', `task3-first-${Date.now()}`);
  await writeVersion(page.request, fixture, 'second', `task3-second-${Date.now()}`);
  await writeVersion(page.request, fixture, 'latest', `task3-latest-${Date.now()}`);

  const before = await listHistory(page.request, fixture);
  expect(before.total).toBeGreaterThanOrEqual(4);

  const immutableIds = before.versions.map((version) => version.id);
  const overlay = await openFileHistory(page);
  const slider = overlay.getByRole('slider', { name: 'File history version' });

  await selectFirstVersion(overlay);
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('1');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveValue('0');
  await overlay.getByRole('button', { name: 'Next version' }).click();
  await expect(slider).toHaveValue('1');
  await overlay.getByRole('button', { name: 'Previous version' }).click();
  await expect(slider).toHaveValue('0');

  await overlay.getByRole('switch', { name: 'Compare selected version with latest' }).click();
  await expect(overlay.locator('.vc-file-history-diff-row').first()).toBeVisible();
  await expect(overlay).toContainText('File History latest');

  await overlay.getByRole('button', { name: 'Restart playback from first version' }).click();

  const source = overlay.getByTestId('file-history-source');
  await expect(source).toContainText('File History baseline');
  await overlay.getByRole('button', { name: '2×' }).click();
  await overlay.getByRole('button', { name: 'Play file history' }).click();
  await expect.poll(async () => Number(await slider.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(() => source.textContent(), { timeout: 10_000 }).toMatch(/File\s+History\s+(first|second|latest)/);

  const pause = overlay.getByRole('button', { name: 'Pause file history playback' });

  if (await pause.isVisible().catch(() => false)) {
    await pause.click();
  }

  await selectFirstVersion(overlay);
  await overlay.getByRole('button', { name: 'Restore' }).click();

  const confirmation = page.getByRole('dialog', { name: 'Restore index.html?' });
  await expect(confirmation).toContainText('never deletes or rewrites existing history');
  await confirmation.getByRole('button', { name: 'Restore as new version' }).click();
  await expect(overlay).toContainText('Restored as a new version. Every earlier version remains in the timeline.');

  const after = await listHistory(page.request, fixture);
  expect(after.total).toBe(before.total + 1);
  expect(after.versions[0]?.operation).toBe('restore');
  expect(after.versions.map((version) => version.id)).toEqual(expect.arrayContaining(immutableIds));

  const restoredFile = await readWorkspaceFile(page.request, fixture);
  expect(restoredFile.path).toBe(HISTORY_PATH);
  expect(restoredFile.encoding).toBe('utf8');
  expect(restoredFile.content).toBe(versionContent('baseline'));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('responsive-code-editor').first()).toBeVisible({ timeout: WORKSPACE_BOOT_TIMEOUT });

  const reloadedOverlay = await openFileHistory(page);
  await expect(reloadedOverlay).toContainText(`Version ${after.total} of ${after.total}`);
  await expect(reloadedOverlay.getByTestId('file-history-source')).toContainText('File History baseline');
  await reloadedOverlay.getByRole('button', { name: 'Close file history' }).click();

  await expectPreviewNonBlank(page, fixture, 'baseline');
});

test('File History and Agent Skills stay usable in dark/light desktop, tablet, and mobile layouts', async ({
  page,
}, testInfo: TestInfo) => {
  test.setTimeout(480_000);

  const fixture = await createProject(page);
  await setThemeWithVisibleToggle(page, 'dark');
  await openRunningEditor(page, fixture);
  await writeVersion(page.request, fixture, 'responsive-old', `task3-responsive-old-${Date.now()}`);
  await writeVersion(page.request, fixture, 'responsive-new', `task3-responsive-new-${Date.now()}`);

  const darkOverlay = await openFileHistory(page, { touchTarget: testInfo.project.name !== 'chromium' });
  await selectFirstVersion(darkOverlay);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await assertSurfaceFitsViewport(page, '[data-testid="file-history-overlay"]', { verticalFit: true });
  await expectNoMobileChromeOverlap(page, darkOverlay);
  await page.screenshot({ path: testInfo.outputPath(`file-history-${testInfo.project.name}-dark.png`) });

  if (testInfo.project.name !== 'chromium') {
    await expectTouchTargets(darkOverlay);
  }

  await darkOverlay.getByRole('button', { name: 'Close file history' }).click();

  const darkSkills = await openSkillsCatalog(page, fixture, 'dark');
  await assertSurfaceFitsViewport(page, '[data-testid="ide-service-panel"][data-panel="skills"]');
  await expectNoMobileChromeOverlap(page, darkSkills.skillsPanel);
  await page.screenshot({ path: testInfo.outputPath(`agent-skills-${testInfo.project.name}-dark.png`) });

  if (testInfo.project.name !== 'chromium') {
    await expectTouchTargets(darkSkills.surface);
  }

  const lastDarkImport = darkSkills.skillsPanel.getByRole('button', { name: 'Import & audit' }).last();
  await lastDarkImport.scrollIntoViewIfNeeded();
  await expect(lastDarkImport).toBeInViewport();
  await expectNoMobileChromeOverlap(page, lastDarkImport);

  await setThemeWithVisibleToggle(page, 'light');
  await openRunningEditor(page, fixture);

  const lightOverlay = await openFileHistory(page, { touchTarget: testInfo.project.name !== 'chromium' });
  await selectFirstVersion(lightOverlay);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await assertSurfaceFitsViewport(page, '[data-testid="file-history-overlay"]', { verticalFit: true });
  await expectNoMobileChromeOverlap(page, lightOverlay);
  await page.screenshot({ path: testInfo.outputPath(`file-history-${testInfo.project.name}-light.png`) });

  if (testInfo.project.name !== 'chromium') {
    await expectTouchTargets(lightOverlay);
  }

  await page.keyboard.press('Escape');
  await expect(lightOverlay).toBeHidden();
  await expect(page.getByTestId('file-history-trigger')).toBeFocused();

  const lightSkills = await openSkillsCatalog(page, fixture, 'light');
  await assertSurfaceFitsViewport(page, '[data-testid="ide-service-panel"][data-panel="skills"]');
  await expectNoMobileChromeOverlap(page, lightSkills.skillsPanel);
  await page.screenshot({ path: testInfo.outputPath(`agent-skills-${testInfo.project.name}-light.png`) });

  if (testInfo.project.name !== 'chromium') {
    await expectTouchTargets(lightSkills.surface);
  }

  const lastLightImport = lightSkills.skillsPanel.getByRole('button', { name: 'Import & audit' }).last();
  await lastLightImport.scrollIntoViewIfNeeded();
  await expect(lastLightImport).toBeInViewport();
  await expectNoMobileChromeOverlap(page, lastLightImport);
});
