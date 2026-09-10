import { timingSafeEqual } from 'node:crypto';

import { checkOutboundUrl } from '@vibecore/security';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { PageRenderError } from './browser.js';

/*
 * screenshotter — a tiny, stateless headless-render service. It turns a URL into
 * a PNG and nothing else: it holds NO GCS/IAM credentials. The API calls
 * `POST /capture`, receives the bytes, and does the object-storage write itself,
 * so this pod's blast radius is just "can fetch allowed URLs". The Playwright
 * adapter lives in browser.ts and is injected via `PageRenderer`, so this app is
 * fully unit-testable without launching Chromium.
 */

export interface PageRenderer {
  /** Render `url` to a PNG buffer. Throws on failure. */
  render(input: { url: string; width: number; height: number }): Promise<Buffer>;
}

export interface ScreenshotterOptions {
  logger?: boolean;
  renderer: PageRenderer;

  /** Bearer secret required on /capture. When unset, auth is disabled (dev/tests). */
  sharedSecret?: string;

  /**
   * SSRF guard: only render URLs whose hostname equals or is a subdomain of one
   * of these suffixes (e.g. `preview.e-code.ai`). Empty = allow any host — only
   * safe for local/dev; production MUST set an allowlist.
   */
  allowedHostSuffixes?: string[];

  /** Injected in tests; defaults to a real DNS lookup inside checkOutboundUrl. */
  resolveHost?: (hostname: string) => Promise<string[]>;

  /** Max simultaneous renders (Chromium is heavy). Excess requests queue. */
  maxConcurrency?: number;

  /** Default capture viewport. */
  width?: number;
  height?: number;
}

/** Constant-time bearer comparison so a wrong secret can't be timing-probed. */
function bearerOk(header: string | undefined, secret: string): boolean {
  const provided = Buffer.from((header ?? '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(secret);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** Minimal FIFO semaphore so at most `max` renders run at once. */
function createSemaphore(max: number) {
  let active = 0;

  const waiters: Array<() => void> = [];

  const acquire = async () => {
    if (active >= max) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }

    active += 1;
  };

  const release = () => {
    active -= 1;
    waiters.shift()?.();
  };

  return { acquire, release };
}

export async function buildScreenshotterApp(options: ScreenshotterOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024 });
  const width = options.width ?? 1280;
  const height = options.height ?? 800;
  const allow = options.allowedHostSuffixes ?? [];
  const gate = createSemaphore(Math.max(1, options.maxConcurrency ?? 2));

  app.get('/health', async () => ({ ok: true }));

  app.post('/capture', async (request: FastifyRequest, reply: FastifyReply) => {
    if (options.sharedSecret && !bearerOk(request.headers.authorization, options.sharedSecret)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const body = (request.body ?? {}) as { url?: unknown };
    const rawUrl = typeof body.url === 'string' ? body.url : '';

    let parsed: URL;

    try {
      parsed = new URL(rawUrl);
    } catch {
      return reply.code(400).send({ error: 'invalid url' });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return reply.code(400).send({ error: 'unsupported protocol' });
    }

    /*
     * AUDX-006 — SSRF guard, fail-closed.
     *
     * This used to read `allow.length > 0 && !hostAllowed(...)`: with an EMPTY
     * allowlist the check was skipped entirely and /capture became an open
     * renderer against any address the pod can reach — including
     * 169.254.169.254, the cloud metadata endpoint. The comment in server.ts
     * said the allowlist "MUST be set in production"; nothing enforced it.
     *
     * checkOutboundUrl also resolves the hostname and rejects when it points at
     * a private/link-local/metadata address, which a string suffix check cannot
     * see: an attacker-controlled subdomain of an allowed suffix is an ordinary
     * A record.
     */
    const rejection = await checkOutboundUrl(parsed.toString(), {
      allowedHostSuffixes: allow,
      resolveHost: options.resolveHost,
    });

    if (rejection) {
      request.log.warn({ url: parsed.toString(), rejection }, 'screenshot refused by SSRF guard');

      return reply.code(403).send({ error: 'host not allowed', code: rejection });
    }

    await gate.acquire();

    try {
      const png = await options.renderer.render({ url: parsed.toString(), width, height });

      return reply.code(200).header('content-type', 'image/png').send(png);
    } catch (error) {
      /*
       * Une page d'erreur n'est pas une panne du service. Elle est refusée avec
       * un code distinct et journalisée en `warn` : confondre les deux remplit
       * l'astreinte d'alertes pour des aperçus qui n'existent simplement pas
       * encore, et masque les vraies pannes de rendu au milieu.
       */
      if (error instanceof PageRenderError) {
        request.log.warn(
          { url: parsed.toString(), httpStatus: error.httpStatus },
          'screenshot refused: target page returned an error status',
        );

        return reply.code(422).send({ error: 'target page returned an error status', code: 'TARGET_PAGE_ERROR' });
      }

      request.log.error({ err: error }, 'screenshot render failed');

      return reply.code(502).send({ error: 'render failed' });
    } finally {
      gate.release();
    }
  });

  return app;
}
