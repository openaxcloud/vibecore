/*
 * D5 harness fixtures — real login as a dedicated test user + evidence capture.
 *
 * Every journey records a self-contained evidence bundle: Playwright captures
 * video + trace + screenshots (see playwright.config.journeys.ts, all set to
 * 'on'); this fixture adds a metadata.json with commit, environment, OS,
 * browser+version, timestamp, and any server traceIds seen on the wire.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { release, type as osType } from 'node:os';
import { join } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { env } from './env';

type Evidence = {
  /** Record a server trace/request id seen on a response (for correlation). */
  addTraceId: (id: string) => void;
  /** Attach an arbitrary fact to the evidence metadata. */
  note: (key: string, value: unknown) => void;
};

export const test = base.extend<{ evidence: Evidence }>({
  evidence: async ({ page, browser }, use, testInfo) => {
    const traceIds = new Set<string>();
    const notes: Record<string, unknown> = {};

    // Passively harvest server trace/request ids from every response — this is
    // the `traceId` each proof must retain, tied to the exact run.
    page.on('response', (response) => {
      const headers = response.headers();
      for (const key of ['x-trace-id', 'x-request-id', 'traceid', 'x-correlation-id']) {
        const value = headers[key];
        if (value) traceIds.add(value);
      }
    });

    const evidence: Evidence = {
      addTraceId: (id) => traceIds.add(id),
      note: (key, value) => {
        notes[key] = value;
      },
    };

    await use(evidence);

    // Teardown: write the evidence metadata next to Playwright's own artifacts.
    const metadata = {
      test: testInfo.title,
      status: testInfo.status,
      commit: env.commit,
      environment: { baseURL: env.baseURL, apiURL: env.apiURL },
      os: { platform: process.platform, type: osType(), release: release() },
      browser: { name: browser.browserType().name(), version: browser.version() },
      timestamp: new Date().toISOString(),
      durationMs: testInfo.duration,
      traceIds: [...traceIds],
      ...notes,
    };

    const dir = testInfo.outputDir;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'evidence-metadata.json');
    writeFileSync(file, JSON.stringify(metadata, null, 2));
    await testInfo.attach('evidence-metadata', { path: file, contentType: 'application/json' });
  },
});

export { expect };

/**
 * Log in the dedicated test user by driving the REAL login form (no cookie
 * injection, no personal profile). Leaves the browser on /dashboard.
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  // 'commit', not 'domcontentloaded'/'load': the app's SSR streams the shell and
  // keeps live connections open, so waiting for the document/load events can hang
  // past the navigation timeout. 'commit' resolves as soon as the response starts;
  // the toBeEditable() wait below then gates on the form actually being ready.
  await page.goto(`${env.baseURL}/login`, { waitUntil: 'commit' });

  // The app ships a pre-hydration "Loading E-Code" splash that overlays the form
  // until the SPA hydrates; wait for the inputs to be genuinely editable (not
  // just present) before typing, so a slow cold hydration doesn't flake the fill.
  const email = page.locator('input[name="email"]');
  const password = page.locator('input[name="password"]');
  await expect(email).toBeEditable({ timeout: 60_000 });
  await email.fill(env.userEmail);
  await expect(password).toBeEditable({ timeout: 15_000 });
  await password.fill(env.userPassword);

  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);

  // We must be authenticated — the app lands signed-in users on /dashboard.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}
