import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the e2e webServer config.
 *
 * The bug: `reuseExistingServer` was hardcoded `true`, so in CI the suite would
 * silently reuse any stale/wrong process already listening on 5173/5174 instead
 * of booting a fresh server. The fix makes it `!process.env.CI`, matching
 * playwright.config.preview.ts.
 *
 * The config evaluates `process.env.CI` at module-load time, so each case is
 * exercised with a fresh, isolated module import.
 */

interface WebServerEntry {
  command: string;
  url: string;
  reuseExistingServer: boolean;
  timeout: number;
}

async function loadWebServer(): Promise<WebServerEntry[] | undefined> {
  vi.resetModules();
  const mod = await import('./playwright.config.ts');
  const config = mod.default as { webServer?: WebServerEntry[] };

  return config.webServer;
}

describe('playwright.config webServer', () => {
  const originalCI = process.env.CI;
  const originalSkip = process.env.PLAYWRIGHT_SKIP_WEB_SERVER;

  afterEach(() => {
    if (originalCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCI;
    }

    if (originalSkip === undefined) {
      delete process.env.PLAYWRIGHT_SKIP_WEB_SERVER;
    } else {
      process.env.PLAYWRIGHT_SKIP_WEB_SERVER = originalSkip;
    }
  });

  it('does NOT reuse an existing server when running in CI', async () => {
    process.env.CI = 'true';
    delete process.env.PLAYWRIGHT_SKIP_WEB_SERVER;

    const webServer = await loadWebServer();

    expect(webServer).toBeDefined();
    expect(webServer!.length).toBeGreaterThan(0);

    for (const entry of webServer!) {
      expect(entry.reuseExistingServer).toBe(false);
    }
  });

  it('reuses an existing server for fast local iteration outside CI', async () => {
    delete process.env.CI;
    delete process.env.PLAYWRIGHT_SKIP_WEB_SERVER;

    const webServer = await loadWebServer();

    expect(webServer).toBeDefined();
    expect(webServer!.length).toBeGreaterThan(0);

    for (const entry of webServer!) {
      expect(entry.reuseExistingServer).toBe(true);
    }
  });

  it('skips the web server entirely when PLAYWRIGHT_SKIP_WEB_SERVER is set', async () => {
    process.env.PLAYWRIGHT_SKIP_WEB_SERVER = '1';

    const webServer = await loadWebServer();

    expect(webServer).toBeUndefined();
  });
});
