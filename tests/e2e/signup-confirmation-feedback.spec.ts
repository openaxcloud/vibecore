import { expect, test } from '@playwright/test';

// Exercises the real route action: mismatch validation runs before account creation.
// No account, provider credentials or intercepted API response is required.
for (const language of ['en', 'fr'] as const) {
  test(`signup confirmation failure identifies and focuses the field (${language})`, async ({ page }) => {
    await page.goto(`/register?lang=${language}`);

    const email = page.locator('input[name="email"]');
    const password = page.locator('input[name="password"]');
    const confirmation = page.locator('input[name="confirmPassword"]');
    const submit = page.locator('button[type="submit"]');

    await expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');
    await email.fill('confirmation-feedback@example.invalid');
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
  });
}
