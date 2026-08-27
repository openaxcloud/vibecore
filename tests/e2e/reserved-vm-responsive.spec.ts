import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// eslint-disable-next-line no-restricted-imports -- Playwright runs outside the workspace package resolver.
import { createDatabaseClient } from '../../packages/database/src/index';

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const DETECT_GUARD_URL = process.env.PLAYWRIGHT_DETECT_GUARD_URL;
const MANAGER_GUARD_URL = process.env.PLAYWRIGHT_MANAGER_GUARD_URL;
const EVIDENCE_DIR = process.env.RESERVED_VM_EVIDENCE_DIR;

type AuthPayload = Readonly<{ token: string; organization: Readonly<{ id: string }> }>;

async function createPaidProject(page: Page): Promise<{ auth: AuthPayload; projectId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: {
      email: `reserved-responsive-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Reserved VM responsive QA',
      organizationName: `Reserved VM responsive QA ${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();

  const auth = (await registration.json()) as AuthPayload;

  const database = createDatabaseClient({ poolMax: 2 });

  try {
    const plan = await database.plan.upsert({
      where: { key: 'pro' },
      create: { key: 'pro', name: 'Pro', monthlyCents: 2_000, limits: {} },
      update: {},
    });
    await database.subscription.deleteMany({ where: { organizationId: auth.organization.id } });
    await database.subscription.create({
      data: {
        organizationId: auth.organization.id,
        planId: plan.id,
        status: 'ACTIVE',
      },
    });
  } finally {
    await database.$disconnect();
  }

  const projectResponse = await page.request.post(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Reserved VM responsive project' },
  });
  expect(projectResponse.ok(), await projectResponse.text()).toBeTruthy();

  const projectId = ((await projectResponse.json()) as { project: { id: string } }).project.id;

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: auth.token,
      url: APP_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'completed', step: 0 }));
  });

  return { auth, projectId };
}

test('Reserved VM pricing and consent remain usable in EN/FR at 390, 768 and 1440 px', async ({ page }) => {
  test.setTimeout(120_000);

  const { projectId } = await createPaidProject(page);
  const measurements: Array<Record<string, unknown>> = [];
  const screenshots: Array<{ name: string; body: Buffer }> = [];

  if (EVIDENCE_DIR) {
    await mkdir(EVIDENCE_DIR, { recursive: true });
  }

  for (const language of ['en', 'fr'] as const) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1_024 },
      { width: 1_440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/projects/${projectId}/deployments?lang=${language}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('lang', language);

      const advanced = page.locator('details').filter({
        hasText:
          language === 'fr' ? 'Avancé — remplacer le mode de déploiement' : 'Advanced — override the deploy mode',
      });
      await expect(advanced).toBeVisible();
      await advanced.locator('summary').click();

      const reservedMode = advanced.locator('input[name="deployModeOverride"][value="reserved-vm"]');
      await expect(reservedMode).toBeEnabled({ timeout: 15_000 });
      await reservedMode.check();

      const configurator = page.getByTestId('reserved-vm-configurator');
      await expect(configurator).toBeVisible();
      await expect(configurator).toContainText(language === 'fr' ? 'VM réservée' : 'Reserved VM');
      await expect(configurator).toContainText(language === 'fr' ? '$20/mois' : '$20/month');
      await expect(configurator).toContainText(language === 'fr' ? '$40/mois' : '$40/month');
      await expect(configurator).toContainText(language === 'fr' ? '$80/mois' : '$80/month');
      await expect(configurator).toContainText(language === 'fr' ? '$160/mois' : '$160/month');
      await expect(advanced).not.toContainText(/coming soon|bientôt disponible/i);

      /*
       * The operator capability exposes all four exact tiers, while tenant
       * admission may legitimately disable a larger tier for the active plan.
       * Confirm the smallest schedulable tier instead of bypassing that real
       * fail-closed availability signal.
       */
      await page.getByTestId('reserved-vm-tier-shared-0.5').check();

      const confirmation = configurator.locator('input[name="reservedVmConfirmation"]');
      await confirmation.check();
      await expect(confirmation).toBeChecked();
      await expect(
        page.getByRole('button', { name: language === 'fr' ? 'Publier' : 'Publish', exact: true }),
      ).toBeEnabled();

      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const card = document.querySelector<HTMLElement>('[data-testid="reserved-vm-configurator"]');
        const grid = document.querySelector<HTMLElement>('[data-testid="reserved-vm-tier-grid"]');

        if (!card || !grid) {
          throw new Error('Reserved VM configurator did not render.');
        }

        const bounds = card.getBoundingClientRect();

        return {
          viewportWidth: window.innerWidth,
          documentWidth: root.scrollWidth,
          cardLeft: bounds.left,
          cardRight: bounds.right,
          cardWidth: bounds.width,
          gridTemplateColumns: getComputedStyle(grid).gridTemplateColumns,
        };
      });

      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.cardLeft).toBeGreaterThanOrEqual(0);
      expect(layout.cardRight).toBeLessThanOrEqual(layout.viewportWidth);

      const columnCount = layout.gridTemplateColumns.split(' ').filter(Boolean).length;
      expect(columnCount).toBe(viewport.width < 640 ? 1 : 2);
      measurements.push({ language, ...viewport, ...layout, columnCount });

      const screenshotName = `reserved-vm-${language}-${viewport.width}.png`;
      const screenshot = await page.screenshot({ fullPage: true });
      screenshots.push({ name: screenshotName, body: screenshot });

      if (EVIDENCE_DIR) {
        await writeFile(join(EVIDENCE_DIR, screenshotName), screenshot);
      }

      await test.info().attach(screenshotName, { body: screenshot, contentType: 'image/png' });
    }
  }

  const database = createDatabaseClient({ poolMax: 2 });

  try {
    expect(await database.deployment.count({ where: { projectId } })).toBe(0);
  } finally {
    await database.$disconnect();
  }

  expect(screenshots).toHaveLength(6);

  if (DETECT_GUARD_URL) {
    const response = await page.request.get(`${DETECT_GUARD_URL}/__qa/stats`);
    expect(response.ok(), await response.text()).toBeTruthy();
    expect((await response.json()) as { blockedDetectRequests: number }).toEqual({ blockedDetectRequests: 6 });
  }

  if (MANAGER_GUARD_URL) {
    const response = await page.request.get(`${MANAGER_GUARD_URL}/__qa/stats`);
    expect(response.ok(), await response.text()).toBeTruthy();
    expect((await response.json()) as { mutatingRequests: number }).toEqual({ mutatingRequests: 0 });
  }

  console.info('reserved-vm-responsive-measurements', JSON.stringify(measurements));

  const measurementBody = Buffer.from(JSON.stringify(measurements, null, 2));

  if (EVIDENCE_DIR) {
    await writeFile(join(EVIDENCE_DIR, 'reserved-vm-responsive-measurements.json'), measurementBody);
  }

  await test.info().attach('reserved-vm-responsive-measurements', {
    body: measurementBody,
    contentType: 'application/json',
  });
});
