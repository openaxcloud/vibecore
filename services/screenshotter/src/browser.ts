import { type Browser, chromium } from 'playwright-core';
import type { PageRenderer } from './app.js';

/*
 * The real headless renderer. Chromium is provided by the container base image
 * (mcr.microsoft.com/playwright), so `playwright-core` here downloads NO browser.
 * One Browser is launched lazily and reused across requests; each render gets a
 * fresh, isolated context so cookies/storage never leak between projects.
 */
export interface PlaywrightRendererOptions {
  navTimeoutMs?: number;
  /** Extra settle time after network idle for late paints/animations. */
  settleMs?: number;
}

export class PlaywrightPageRenderer implements PageRenderer {
  #browser: Browser | undefined;
  #launching: Promise<Browser> | undefined;

  constructor(private readonly options: PlaywrightRendererOptions = {}) {}

  async #browserInstance(): Promise<Browser> {
    if (this.#browser?.isConnected()) {
      return this.#browser;
    }

    // Coalesce concurrent first-hits onto a single launch.
    if (!this.#launching) {
      this.#launching = chromium
        .launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
        .then((browser) => {
          this.#browser = browser;
          this.#launching = undefined;

          return browser;
        })
        .catch((error) => {
          this.#launching = undefined;
          throw error;
        });
    }

    return this.#launching;
  }

  async render(input: { url: string; width: number; height: number }): Promise<Buffer> {
    const browser = await this.#browserInstance();
    const context = await browser.newContext({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 1,
      // The preview may not have a valid cert in some environments; a thumbnail
      // is best-effort so don't fail the render on a cert mismatch.
      ignoreHTTPSErrors: true,
    });

    try {
      const page = await context.newPage();
      await page.goto(input.url, { waitUntil: 'networkidle', timeout: this.options.navTimeoutMs ?? 15_000 });

      if (this.options.settleMs) {
        await page.waitForTimeout(this.options.settleMs);
      }

      return await page.screenshot({ type: 'png', fullPage: false });
    } finally {
      await context.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    const browser = this.#browser;
    this.#browser = undefined;
    await browser?.close().catch(() => {});
  }
}
