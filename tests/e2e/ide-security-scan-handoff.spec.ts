import { expect, test } from '@playwright/test';

/*
 * Real isolated API fixtures and history hydration; controlled scan responses/clock.
 * This proves UI request lifetime, not a provider/runtime scanner execution.
 */
for (const outcome of ['timeout', 'completed', 'failed', 'cancelled'] as const) {
  test(`security scan preserves ${outcome} across history hydration`, async ({ page, baseURL }) => {
    const api = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';

    const registration = await page.request.post(`${api}/auth/register`, {
      data: {
        email: `scan-handoff-${outcome}-${Date.now()}@local.test`,
        password: 'Password123!',
        name: 'Synthetic scan handoff',
        organizationName: 'Synthetic scan handoff',
      },
    });
    expect(registration.status()).toBe(201);

    const auth = await registration.json();
    const headers = { authorization: `Bearer ${auth.token}` };

    const creation = await page.request.post(`${api}/orgs/${auth.organization.id}/projects`, {
      headers,
      data: { name: 'Synthetic scan handoff' },
    });
    expect(creation.ok()).toBe(true);

    const projectId = (await creation.json()).project.id;

    const conversationResponse = await page.request.post(`${api}/projects/${projectId}/ai/conversations`, {
      headers,
      data: { title: 'Scan handoff fixture' },
    });
    expect(conversationResponse.ok()).toBe(true);

    const { conversation } = await conversationResponse.json();
    expect(
      (
        await page.request.put(`${api}/projects/${projectId}/ai/conversations/${conversation.id}/transcript`, {
          headers,
          data: { messages: [{ clientId: 'scan-ready-user', role: 'user', content: 'SECURITY_HANDOFF_READY' }] },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.put(`${api}/projects/${projectId}/ide-state`, {
          headers,
          data: { state: { chat: { metadata: { aiConversationId: conversation.id } } } },
        })
      ).ok(),
    ).toBe(true);
    await page.context().addCookies([
      { name: 'vc_session', value: auth.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
      { name: 'vibecore-lang', value: 'en', url: baseURL! },
    ]);

    let releaseHistory!: () => void;

    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    await page.route(`**/api/projects/${projectId}/ide-state`, async (route) => {
      if (route.request().method() === 'GET') {
        await historyGate;
      }

      await route.continue();
    });

    let releaseScan!: () => void;

    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });

    let posts = 0;
    await page.route(`**/api/projects/${projectId}/ide-panel/security`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      posts += 1;
      await scanGate;
      await route
        .fulfill({
          status: 200,
          json: {
            ok: outcome !== 'failed',
            scan: { status: outcome === 'failed' ? 'failed' : 'completed' },
            error: outcome === 'failed' ? 'Synthetic recorded scan failure' : undefined,
          },
        })
        .catch(() => undefined); // Cancelled/timed-out requests may already be closed.
    });

    try {
      await page.goto(`/projects/${projectId}/ide?panel=security`);
      await page.clock.install();

      const progress = page.locator('.bolt-project-security-progress');
      await page
        .locator('.bolt-project-security-scan-form')
        .getByRole('button', { name: 'Run full scan', exact: true })
        .click();
      await expect(progress).toHaveAttribute('data-status', 'running');
      await expect.poll(() => posts).toBe(1);
      await page.clock.runFor(30_000);
      releaseHistory();
      await page.locator('.bolt-user-message-bubble').filter({ hasText: 'SECURITY_HANDOFF_READY' }).waitFor();
      await expect(progress).toHaveAttribute('data-status', 'running');

      if (outcome === 'timeout') {
        // Only the remainder of the original deadline: a restarted timer would fail.
        await page.clock.runFor(60_001);
      } else if (outcome === 'cancelled') {
        await page.getByRole('button', { name: 'Cancel scan', exact: true }).click();
      } else {
        releaseScan();
      }

      await expect(progress).toHaveAttribute('data-status', outcome);
      releaseScan();
      await page.clock.runFor(1_000);
      await expect(progress).toHaveAttribute('data-status', outcome);
      expect(posts).toBe(1);
    } finally {
      releaseHistory();
      releaseScan();
    }
  });
}
