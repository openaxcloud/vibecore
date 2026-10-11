import { expect, test, type Page } from '@playwright/test';

/**
 * UIB-06 (paiement) — la formule gratuite porte le MÊME nom sur /upgrade et
 * sur /billing.
 *
 * Mesuré le 2026-09-30 sur la copie locale, 1440, clair et sombre : /billing
 * disait « Gratuite », /upgrade disait « Free » (nom brut de la table Plan).
 *
 * Vraie API, vrai compte — aucun appel simulé. Navigateur en français.
 */

test.use({ locale: 'fr-FR' });

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

async function compte(page: Page, theme: 'light' | 'dark') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: {
      email: `paiement-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Ada Paiement',
      organizationName: `Paiement ${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();

  const { token } = (await registration.json()) as { token: string };
  await page.context().addCookies([
    { name: 'vc_session', value: token, url: APP_BASE_URL, httpOnly: true, sameSite: 'Lax' },
    { name: 'ecode_theme', value: theme, url: APP_BASE_URL, sameSite: 'Lax' },
  ]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`bureau 1440 — ${theme} : la formule gratuite a le même nom sur /billing et /upgrade`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await compte(page, theme);

    await page.goto('/billing', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toContainText('Gratuite', { timeout: 60_000 });

    await page.goto('/upgrade', { waitUntil: 'domcontentloaded' });

    const titres = page.locator('main h2');
    await expect(titres.first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const noms = (await titres.allTextContents()).map((nom) => nom.trim());
    expect(noms, 'cartes de formule sur /upgrade').toContain('Gratuite');
    expect(noms, 'aucun nom anglais brut').not.toContain('Free');
  });
}
