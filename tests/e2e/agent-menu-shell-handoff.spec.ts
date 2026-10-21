import { expect, test } from '@playwright/test';

const apiURL = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const marker = 'Synthetic shell replacement evidence';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

for (const language of ['en', 'fr']) {
  for (const keepOpen of [true, false]) {
    test(`agent menu survives shell replacement (${language}, ${keepOpen ? 'open' : 'closed'})`, async ({
      page,
      context,
      request,
    }) => {
      test.setTimeout(90_000);
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const registration = await request.post(`${apiURL}/auth/register`, {
        data: {
          email: `menu-shell-${suffix}@local.test`,
          password: 'Password123!',
          name: 'Shell menu',
          organizationName: `Shell ${suffix}`,
        },
      });
      expect(registration.ok()).toBe(true);
      const auth = await registration.json();
      const headers = { authorization: `Bearer ${auth.token}` };
      const created = await request.post(`${apiURL}/orgs/${auth.organization.id}/projects`, {
        headers,
        data: { name: 'Shell menu' },
      });
      expect(created.ok()).toBe(true);
      const projectId = (await created.json()).project.id;
      const conversationResponse = await request.post(`${apiURL}/projects/${projectId}/ai/conversations`, {
        headers,
        data: { title: 'Shell menu' },
      });
      expect(conversationResponse.ok()).toBe(true);
      const { conversation } = await conversationResponse.json();
      const transcript = await request.put(
        `${apiURL}/projects/${projectId}/ai/conversations/${conversation.id}/transcript`,
        {
          headers,
          data: { messages: [{ clientId: 'shell-menu-user', role: 'user', content: marker }] },
        },
      );
      expect(transcript.ok()).toBe(true);
      const state = await request.put(`${apiURL}/projects/${projectId}/ide-state`, {
        headers,
        data: { state: { chat: { metadata: { aiConversationId: conversation.id } } } },
      });
      expect(state.ok()).toBe(true);
      await context.addCookies([
        { name: 'vc_session', value: auth.token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
      ]);

      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Hold the real GET, without substituting its response or changing the stored data.
      await page.route('**/api/projects/*/ide-state', async (route) => {
        if (route.request().method() === 'GET') {
          await ready;
        }
        await route.continue();
      });

      try {
        await page.goto(`/projects/${projectId}/ide?panel=agent&lang=${language}`, { waitUntil: 'domcontentloaded' });
        const label = language === 'en' ? 'More agent actions' : "Plus d'actions d'agent";
        const trigger = page.getByRole('button', { name: label, exact: true });
        const menu = page.getByRole('menu', { name: label, exact: true });
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(menu).toBeVisible();
        await page.keyboard.press('End');
        await expect(menu.locator('button').last()).toBeFocused();
        await trigger.evaluate((node) => node.setAttribute('data-shell-menu-witness', 'old'));
        if (!keepOpen) {
          await page.keyboard.press('Escape');
          await expect(menu).toHaveCount(0);
        }
        release();
        await page.locator('.bolt-user-message-bubble').filter({ hasText: marker }).first().waitFor();
        await expect(page.locator('[data-shell-menu-witness="old"]')).toHaveCount(0);
        if (keepOpen) {
          await expect(menu).toBeVisible();
          await expect(menu.locator('button').last()).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(menu).toHaveCount(0);
          await expect(trigger).toBeFocused();
        } else {
          await expect(menu).toHaveCount(0);
        }
      } finally {
        release();
      }
    });
  }
}
