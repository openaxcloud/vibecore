import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const apiURL = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';

for (const language of ['en', 'fr'] as const) {
  test(`snapshot cancellation preserves keyboard position (${language})`, async ({ page, context, request }, info) => {
    let projectId: string;

    if (process.env.UX_QA_SESSION_FILE) {
      expect(new URL(baseURL).hostname).toBe('127.0.0.1');

      const fixtures = JSON.parse(await readFile(process.env.UX_QA_SESSION_FILE, 'utf8'));
      const fixture = fixtures.cases?.[`${info.project.name}-${language}`] ?? fixtures;
      await context.addCookies(fixture.cookies);
      projectId = fixture.projectId;
    } else {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const registered = await request.post(`${apiURL}/auth/register`, {
        data: {
          email: `snapshot-focus-${suffix}@local.test`,
          password: 'Password123!',
          name: 'Snapshot focus E2E',
          organizationName: `Snapshot focus ${suffix}`,
        },
      });
      expect(registered.ok()).toBe(true);

      const auth = await registered.json();

      const created = await request.post(`${apiURL}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Snapshot focus E2E' },
      });
      expect(created.ok()).toBe(true);
      projectId = (await created.json()).project.id;
      await context.addCookies([
        { name: 'vc_session', value: auth.token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
      ]);
    }

    await context.addCookies([{ name: 'vibecore-lang', value: language, url: baseURL }]);

    const label = `Focus ${info.project.name} ${language} ${Date.now()}`;
    const restoredRequests: string[] = [];
    page.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        /(?:intent=restore(?:&|$)|name="intent"\r\n\r\nrestore\r\n)/.test(req.postData() ?? '')
      ) {
        restoredRequests.push(req.url());
      }
    });
    await page.goto(`/projects/${projectId}/snapshots?lang=${language}`);
    await page.locator('#snapshot-label').fill(label);

    const createdResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.startsWith(`/projects/${projectId}/snapshots`),
    );
    await page
      .getByRole('button', { name: language === 'fr' ? 'Créer l’instantané' : 'Create snapshot', exact: true })
      .click();
    expect([200, 202, 302, 303]).toContain((await createdResponse).status());

    const opener = page.getByRole('button', {
      name: `${language === 'fr' ? 'Restaurer' : 'Restore'} ${label}`,
      exact: true,
    });
    await expect(opener).toBeVisible();
    await page.reload();
    await expect(opener).toBeVisible();
    await opener.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: new RegExp(label) });
    await expect(dialog).toBeVisible();

    const cancel = dialog.getByRole('button', { name: language === 'fr' ? 'Annuler' : 'Cancel', exact: true });
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button').last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.screenshot({ path: info.outputPath(`dialog-${language}.png`) });

    if (info.project.name === 'desktop') {
      await page.keyboard.press('Enter');
    } else {
      await cancel.tap();
    }

    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await page.screenshot({ path: info.outputPath(`cancel-${language}.png`) });
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(restoredRequests).toEqual([]);
    await expect(page.locator('#snapshot-label')).toBeEnabled();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}
