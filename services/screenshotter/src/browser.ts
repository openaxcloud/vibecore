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
  /*
   * In-cluster base URL of the preview-proxy (e.g. `http://preview-proxy:3020`).
   * When set, requests to a preview host (see previewHostSuffixes) are routed to
   * this proxy with the original Host preserved — avoiding the in-cluster→public-LB
   * hairpin that makes the public preview URL unreachable from this pod. Unset =
   * navigate the URL directly (dev/local).
   */
  previewProxyUrl?: string;
  /** Host suffixes that identify a preview to route through previewProxyUrl. */
  previewHostSuffixes?: string[];
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
        .then((browser: Browser) => {
          this.#browser = browser;
          this.#launching = undefined;

          return browser;
        })
        .catch((error: unknown) => {
          this.#launching = undefined;
          throw error;
        });
    }

    return this.#launching;
  }

  async render(input: {
    url: string;
    width: number;
    height: number;

    /*
     * Jeton tenant `vc_preview` fourni par l'API pour l'organisation du projet.
     *
     * Ce renderer travaille dans un contexte navigateur volontairement vierge
     * (aucun cookie ne doit fuir d'un projet à l'autre), donc il ne porte PAS le
     * cookie `vc_preview` qu'un vrai navigateur enverrait. Dès que le
     * preview-proxy applique l'isolation tenant, sa requête reçoit un
     * 403 PREVIEW_TENANT_FORBIDDEN et TOUTE vignette casse — constaté en réel sur
     * le cluster d'audit le 2026-08-09. Le jeton est donc transporté dans
     * l'en-tête interne que le proxy accepte, et uniquement vers les hôtes de
     * preview (jamais vers un hôte tiers).
     */
    tenantToken?: string;
  }): Promise<Buffer> {
    const browser = await this.#browserInstance();
    const context = await browser.newContext({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 1,
      // The preview may not have a valid cert in some environments; a thumbnail
      // is best-effort so don't fail the render on a cert mismatch.
      ignoreHTTPSErrors: true,
    });

    try {
      /*
       * Route preview requests through the in-cluster preview-proxy. The public
       * preview URL resolves to the cluster's own external LB, which an in-cluster
       * pod can't reach (hairpin). We rewrite the URL to the internal proxy while
       * PRESERVING the original Host header — the proxy routes by Host, so it lands
       * on the right workspace. Covers the document AND all subresources (JS/CSS/
       * assets are loaded from the same preview host). The SSRF allowlist has
       * already vetted the input URL in app.ts, so this only redirects vetted hosts.
       */
      const suffixes = this.options.previewHostSuffixes ?? [];
      const isPreviewHost = (h: string) => suffixes.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
      const proxying = Boolean(this.options.previewProxyUrl) && suffixes.length > 0;

      if (proxying) {
        const proxy = new URL(this.options.previewProxyUrl!);

        await context.route('**/*', async (route) => {
          try {
            const requestUrl = new URL(route.request().url());

            if (!isPreviewHost(requestUrl.hostname.toLowerCase())) {
              await route.continue();
              return;
            }

            // route.continue requires the SAME protocol; the proxy is http, so the
            // request must already be http (we force http on the nav below, and an
            // http page's subresources are http/relative). Preserve the original
            // preview Host so the proxy routes to the right workspace.
            const target = `${proxy.protocol}//${proxy.host}${requestUrl.pathname}${requestUrl.search}`;
            await route.continue({
              url: target,
              headers: {
                ...route.request().headers(),
                host: requestUrl.host,
                // Porté seulement ici : on est dans la branche « hôte de preview
                // vérifié par l'allowlist », donc le jeton ne peut pas partir
                // vers un hôte tiers.
                ...(input.tenantToken ? { 'x-vibecore-preview-tenant': input.tenantToken } : {}),
              },
            });
          } catch {
            // Never let a routing hiccup crash the process (an unhandled throw in a
            // route handler would take down the pod). Fall back to the original.
            await route.continue().catch(() => route.abort().catch(() => {}));
          }
        });
      }

      const page = await context.newPage();

      /*
       * Force http on the top-level nav for a preview host: the proxy is http and
       * route.continue can't cross protocols (https→http throws). An http page then
       * requests http/relative subresources, which the route above rewrites cleanly.
       */
      let navUrl = input.url;

      if (proxying) {
        const parsed = new URL(input.url);

        if (isPreviewHost(parsed.hostname.toLowerCase())) {
          parsed.protocol = 'http:';
          parsed.port = '';
          navUrl = parsed.toString();
        }
      }
      // Use 'load', NOT 'networkidle': a preview is a Vite/HMR app that holds a
      // persistent HMR WebSocket open, so the network is never idle and
      // 'networkidle' would always hit the timeout ("render failed") — the exact
      // symptom that blocked every real preview capture. 'load' fires once the
      // document + subresources are in; a short settle then covers SPA mount and
      // late paints/animations.
      await page.goto(navUrl, { waitUntil: 'load', timeout: this.options.navTimeoutMs ?? 15_000 });
      await page.waitForTimeout(this.options.settleMs ?? 1_500);

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
