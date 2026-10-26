import { expect, test } from '@playwright/test';

const apiURL = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const marker = 'Synthetic shell replacement evidence';

for (const width of [390, 820]) {
  test.describe(`mobile overlay handoff ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: true });

    const language = 'en';

    for (const keepOpen of [true, false]) {
      test(`tabs menu survives shell replacement (${language}, ${keepOpen ? 'open' : 'closed'})`, async ({
        page,
        context,
        request,
      }, info) => {
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

          const trigger = page.getByTestId('mobile-bottom-navigation').getByTestId('button-tab-switcher');
          const menu = page.getByTestId('mobile-tab-switcher');
          await trigger.focus();
          await page.keyboard.press('Enter');
          await expect(menu).toBeVisible();
          await menu.getByTestId('input-search-tabs').fill('Webview');
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
            await expect(menu.getByTestId('input-search-tabs')).toBeFocused();
            await page.keyboard.press('Escape');
            await expect(menu).toHaveCount(0);
            await expect(trigger).toBeFocused();
          } else {
            await expect(trigger).toBeFocused();
            await expect(menu).toHaveCount(0);
          }

          await page.screenshot({ path: info.outputPath('focus-after-handoff.png') });
        } finally {
          release();
        }
      });
    }
  });
}
