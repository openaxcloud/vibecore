import { checkOutboundUrl } from '@vibecore/security';
import { type Browser, type Route, chromium } from 'playwright-core';
import type { PageRenderer } from './app.js';

/*
 * The real headless renderer. Chromium is provided by the container base image
 * (mcr.microsoft.com/playwright), so `playwright-core` here downloads NO browser.
 * One Browser is launched lazily and reused across requests; each render gets a
 * fresh, isolated context so cookies/storage never leak between projects.
 */
export interface PlaywrightRendererOptions {
  navTimeoutMs?: number;

  /** Optional installed Chromium path for local and managed runtimes. */
  chromiumExecutablePath?: string;

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

  /** Same DNS policy for each external document, redirect and subresource. */
  resolveHost?: (hostname: string) => Promise<string[]>;
}

/**
 * Rendu refusé pour une raison connue et attendue — par opposition à une panne
 * du navigateur. Porte le statut HTTP du document afin que l'appelant puisse
 * distinguer « la page n'existe pas » d'une erreur de rendu, et journaliser
 * l'un sans alerter sur l'autre.
 */
export class PageRenderError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = 'PageRenderError';
    this.httpStatus = httpStatus;
  }
}

export async function guardScreenshotRoute(route: Route, options: PlaywrightRendererOptions): Promise<void> {
  const suffixes = options.previewHostSuffixes ?? [];
  const isPreviewHost = (host: string) => suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));

  try {
    const proxy = options.previewProxyUrl && suffixes.length ? new URL(options.previewProxyUrl) : undefined;
    const requestUrl = new URL(route.request().url());

    if (proxy && isPreviewHost(requestUrl.hostname.toLowerCase())) {
      const target = `${proxy.protocol}//${proxy.host}${requestUrl.pathname}${requestUrl.search}`;

      const response = await route.fetch({
        url: target,
        headers: { ...route.request().headers(), host: requestUrl.host },
        maxRedirects: 0,
      });

      try {
        const location = response.headers().location;

        if (response.status() >= 300 && response.status() < 400 && location) {
          const redirectRejection = await checkOutboundUrl(new URL(location, requestUrl).toString(), {
            allowedHostSuffixes: [],
            allowAnyPublicHost: true,
            resolveHost: options.resolveHost,
          });

          if (redirectRejection) {
            await route.abort('blockedbyclient');

            return;
          }
        }

        await route.fulfill({ response });
      } finally {
        await response.dispose();
      }

      return;
    }

    const rejection = await checkOutboundUrl(requestUrl.toString(), {
      allowedHostSuffixes: [],
      allowAnyPublicHost: true,
      resolveHost: options.resolveHost,
    });

    if (rejection) {
      await route.abort('blockedbyclient');

      return;
    }

    await route.continue();
  } catch {
    /* A failed routing or DNS decision never restores unrestricted access. */
    await route.abort('blockedbyclient').catch(() => undefined);
  }
}

export class PlaywrightPageRenderer implements PageRenderer {
  #browser: Browser | undefined;
  #launching: Promise<Browser> | undefined;

  constructor(private readonly _options: PlaywrightRendererOptions = {}) {}

  async #browserInstance(): Promise<Browser> {
    if (this.#browser?.isConnected()) {
      return this.#browser;
    }

    // Coalesce concurrent first-hits onto a single launch.
    if (!this.#launching) {
      this.#launching = chromium
        .launch({
          headless: true,
          executablePath: this._options.chromiumExecutablePath,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        })
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

  async render(input: { url: string; width: number; height: number }): Promise<Buffer> {
    const browser = await this.#browserInstance();

    const context = await browser.newContext({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',

      /*
       * The preview may not have a valid cert in some environments; a thumbnail
       * is best-effort so don't fail the render on a cert mismatch.
       */
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
      await context.route('**/*', (route) => guardScreenshotRoute(route, this._options));

      const page = await context.newPage();

      /*
       * Use 'load', NOT 'networkidle': a preview is a Vite/HMR app that holds a
       * persistent HMR WebSocket open, so the network is never idle and
       * 'networkidle' would always hit the timeout ("render failed") — the exact
       * symptom that blocked every real preview capture. 'load' fires once the
       * document + subresources are in; a short settle then covers SPA mount and
       * late paints/animations.
       */
      const response = await page.goto(input.url, {
        waitUntil: 'load',
        timeout: this._options.navTimeoutMs ?? 15_000,
      });

      /*
       * On REFUSE de photographier une page d'erreur.
       *
       * `page.goto` rend la réponse du document principal ; jusqu'ici elle était
       * ignorée, et une vignette de projet pouvait donc être la photo d'un 404 :
       * un rectangle qui a l'air vide, mais qui est bien chargé — la première
       * chose que voit un utilisateur qui revient. Le repli existe déjà et
       * fonctionne ; c'est ce qui était PHOTOGRAPHIÉ qui était faux.
       *
       * Une absence de réponse (`null`) n'est pas une erreur : c'est le cas
       * d'une navigation servie depuis le cache ou d'un `about:blank`, et le
       * rendu reste alors légitime.
       */
      const status = response?.status();

      if (status !== undefined && status >= 400) {
        throw new PageRenderError(`refusing to capture an error page (HTTP ${status})`, status);
      }

      await page.waitForTimeout(this._options.settleMs ?? 1_500);

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
