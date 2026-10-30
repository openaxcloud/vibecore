import { expect, test } from '@playwright/test';

const apiURL = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const marker = 'Synthetic mobile chrome replacement evidence';

const cases = [
  { width: 390, height: 844, overlay: 'tools' },
  { width: 820, height: 900, overlay: 'tabs' },
  { width: 1180, height: 757, overlay: 'tabs' },
] as const;

for (const format of cases) {
  test.describe(`mobile chrome remount ${format.overlay} ${format.width}px`, () => {
    test.use({ viewport: { width: format.width, height: format.height }, hasTouch: true });

    test('one native Enter during replacement opens the intended sheet', async ({
      page,
      context,
      request,
      browserName,
    }, info) => {
      test.skip(browserName !== 'chromium', 'Deterministic CPU throttling requires Chromium CDP.');
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

      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      let release!: () => void;

      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });

      let heldRequests = 0;

      // Retain the actual API response, not a fulfilled or synthetic replacement.
      await page.route('**/api/projects/*/ide-state', async (route) => {
        if (route.request().method() === 'GET') {
          heldRequests++;
          await ready;
        }

        await route.continue();
      });

      let detached: { replacementPresent: boolean; activeTestId: string | null } | undefined;
      let enterDone: Promise<void> | undefined;
      let nativeEnterCalls = 0;
      await page.exposeFunction('__mobileChromeDetached', (snapshot: typeof detached) => {
        // No locator action, refocus or visibility wait is allowed in this window.
        nativeEnterCalls++;
        enterDone = page.keyboard.press('Enter');
        void enterDone.catch(() => undefined);
        detached = snapshot;
      });

      const triggerId = format.overlay === 'tools' ? 'button-add-tab' : 'button-tab-switcher';
      const selector = `[data-testid="mobile-bottom-navigation"] [data-testid="${triggerId}"]`;
      const opener = page.locator(selector);
      const sheet = page.getByTestId(format.overlay === 'tools' ? 'tools-sheet' : 'mobile-tab-switcher');

      try {
        await page.goto(`/projects/${projectId}/ide?panel=agent&lang=en`, { waitUntil: 'domcontentloaded' });
        await expect.poll(() => heldRequests).toBeGreaterThan(0);
        await expect(opener).toBeVisible();
        await opener.focus();
        await expect(opener).toBeFocused();

        const original = await opener.elementHandle();
        expect(original).not.toBeNull();
        await opener.evaluate((node, replacementSelector) => {
          const observer = new MutationObserver(() => {
            if (node.isConnected) {
              return;
            }

            observer.disconnect();

            const notify = (
              window as unknown as {
                __mobileChromeDetached: (snapshot: {
                  replacementPresent: boolean;
                  activeTestId: string | null;
                }) => Promise<void>;
              }
            ).__mobileChromeDetached;
            void notify({
              replacementPresent: Boolean(document.querySelector(replacementSelector)),
              activeTestId: document.activeElement?.getAttribute('data-testid') ?? null,
            });
          });
          observer.observe(document, { childList: true, subtree: true });
        }, selector);
        release();
        await expect.poll(() => Boolean(detached), { timeout: 5_000 }).toBe(true);
        await enterDone;
        expect(nativeEnterCalls).toBe(1);
        expect(detached).toEqual({ replacementPresent: true, activeTestId: triggerId });
        expect(await original!.evaluate((node) => node.isConnected)).toBe(false);
        await expect(sheet).toBeVisible({ timeout: 5_000 });
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
        await expect(opener).toBeFocused();

        // An explicit SPA departure must not revive this already dismissed sheet.
        await page.getByTestId('mobile-ide-header').getByTestId('button-back').click();
        await expect(page).not.toHaveURL(new RegExp(`/projects/${projectId}/ide`));
        await expect(page.getByTestId('tools-sheet')).toHaveCount(0);
        await expect(page.getByTestId('mobile-tab-switcher')).toHaveCount(0);
        await info.attach('native-enter-handoff.json', {
          body: JSON.stringify({
            ...format,
            cpu: 4,
            heldRequests,
            detached,
            nativeEnterCalls,
            noSheetAfterDeparture: true,
          }),
          contentType: 'application/json',
        });
      } finally {
        release();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await cdp.detach();
      }
    });
  });
}
