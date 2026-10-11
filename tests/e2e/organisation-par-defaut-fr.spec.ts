import { expect, test } from '@playwright/test';

/**
 * UIB-05 — le nom de l'organisation créée à l'inscription suit la langue.
 *
 * Mesuré le 2026-09-30 sur la copie locale : inscription par /signup en
 * français, champ facultatif « nom d'organisation » laissé vide → organisation
 * « Parcours UI bureau's Organization », affichée dès la première minute dans le
 * fil d'Ariane de l'IDE.
 *
 * Parcours réel : le formulaire, puis l'API réelle pour lire le nom obtenu.
 */

// Un client français : navigateur en français.
test.use({ locale: 'fr-FR' });

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

test("inscription en français sans nom d'organisation : nom d'organisation en français", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const secret = 'Password123!';

  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr', { timeout: 30_000 });
  await expect(page.locator('input[name=email]')).toBeVisible({ timeout: 60_000 });

  await page.locator('input[name=name]').fill('Ada Revue');
  await page.locator('input[name=email]').fill(`organisation-fr-${suffix}@local.test`);
  await page.locator('input[name=password]').fill(secret);
  await page.locator('input[name=confirmPassword]').fill(secret);
  await page.locator('.vc-auth-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 60_000 });

  const session = (await context.cookies()).find((cookie) => cookie.name === 'vc_session');
  expect(session, 'cookie de session après inscription').toBeTruthy();

  const response = await page.request.get(`${API_BASE_URL}/orgs`, {
    headers: { authorization: `Bearer ${session!.value}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();

  const { organizations } = (await response.json()) as { organizations: Array<{ name: string }> };
  expect(organizations.map((org) => org.name)).toEqual(['Organisation d’Ada Revue']);
});
