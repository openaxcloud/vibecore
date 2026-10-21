import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

/*
 * Exercises real validation failures, then account creation after correcting the field.
 * No intercepted response or provider credential is used.
 */
for (const language of ['en', 'fr'] as const) {
  test(`signup confirmation failure identifies and focuses the field (${language})`, async ({ page, baseURL }) => {
    const appBaseUrl = baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
    const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

    for (const url of [appBaseUrl, apiBaseUrl]) {
      expect(['127.0.0.1', 'localhost', '[::1]']).toContain(new URL(url).hostname);
    }

    const testEmail = `confirmation-${randomUUID()}@local.test`;

    await page.goto(`/register?lang=${language}`);

    const email = page.locator('input[name="email"]');
    const password = page.locator('input[name="password"]');
    const confirmation = page.locator('input[name="confirmPassword"]');
    const submit = page.locator('button[type="submit"]');

    await expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');
    await email.fill(testEmail);
    await password.fill('First-password-123!');
    await confirmation.fill('Different-password-456!');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && new URL(response.url()).pathname.startsWith('/register'),
      );
      await submit.click();

      const response = await responsePromise;

      expect(response.status()).toBe(400);
      expect(await response.text()).toContain('AUTH_PASSWORD_MISMATCH');
      await expect(confirmation).toBeFocused();
      await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
      await expect(confirmation).toHaveAttribute('aria-describedby', 'signup-confirm-password-error');

      const fieldError = page.locator('#signup-confirm-password-error');
      await expect(fieldError).toBeVisible();
      await expect(fieldError).toHaveText(await page.getByRole('alert').innerText());
      await expect(confirmation).toBeInViewport();
      await expect(page).toHaveURL(/\/register\?lang=/);
    }

    await confirmation.fill('First-password-123!');
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);

    // Use the browser's real session, including Secure cookies on localhost.
    const userResponse = await page.evaluate(async () => {
      const response = await fetch('/api/auth/user');

      return { status: response.status, user: await response.json() };
    });

    expect(userResponse.status).toBe(200);
    expect(userResponse.user).toMatchObject({ email: testEmail });
  });
}
