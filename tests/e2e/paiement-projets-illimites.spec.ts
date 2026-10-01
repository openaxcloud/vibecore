import { expect, test } from '@playwright/test';

/**
 * UIB-06 — /upgrade ne montre jamais la
 * sentinelle « 1 000 000 projets » ; et la page se charge VRAIMENT.
 *
 * Mesuré le 2026-10-01 : la première version de ce correctif importait l'index
 * de `@vibecore/billing` côté navigateur, qui tire `node:crypto` → /upgrade
 * restait sur l'écran de chargement. Les tests unitaires (Node) étaient verts.
 * Seul un vrai navigateur le voit : c'est ce test.
 */

test.use({ locale: 'fr-FR' });

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

test('bureau 1440 : /upgrade se charge et dit « Projets illimités », jamais « 1 000 000 »', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: {
      email: `illimites-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Ada',
      organizationName: `I ${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();

  const { token } = (await registration.json()) as { token: string };
  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: APP_BASE_URL, httpOnly: true, sameSite: 'Lax' }]);

  const erreurs: string[] = [];
  page.on('pageerror', (error) => erreurs.push(error.message));

  await page.goto('/upgrade', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main h2').first()).toBeVisible({ timeout: 60_000 });

  const lignes = await page.locator('main li').allTextContents();
  expect(lignes.join(' | ')).not.toMatch(/1\s000\s000/u);
  expect(lignes).toContain('Projets illimités');
  expect(erreurs, 'erreurs de page').toEqual([]);
});
