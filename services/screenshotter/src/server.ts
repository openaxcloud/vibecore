import { buildScreenshotterApp } from './app.js';
import { PlaywrightPageRenderer } from './browser.js';

/*
 * Process entrypoint. Wires the real Playwright renderer and the env-driven auth
 * + SSRF allowlist. In production SCREENSHOTTER_ALLOWED_HOSTS MUST be set (e.g.
 * "preview.e-code.ai,e-code.app") so /capture can't be abused as an open renderer
 * against internal addresses.
 */
const allowedHostSuffixes = (process.env.SCREENSHOTTER_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

/*
 * AUDX-006 — the allowlist is a hard requirement in production, enforced here.
 *
 * The comment above has said "MUST be set" since this service shipped, and
 * nothing checked it: an empty value made /capture an open renderer against any
 * address the pod can reach, cloud metadata included. Fail at STARTUP rather
 * than 403-ing every capture at request time — a misconfigured deploy should be
 * loud and obvious, not a silently broken screenshot pipeline.
 */
if (allowedHostSuffixes.length === 0 && process.env.NODE_ENV === 'production') {
  throw new Error('SCREENSHOTTER_ALLOWED_HOSTS is required in production (SSRF allowlist; empty = open renderer).');
}

const renderer = new PlaywrightPageRenderer({
  navTimeoutMs: Number(process.env.SCREENSHOTTER_NAV_TIMEOUT_MS ?? 15_000),
  settleMs: Number(process.env.SCREENSHOTTER_SETTLE_MS ?? 500),
  // Route preview hosts through the in-cluster preview-proxy (avoids the hairpin).
  // Same suffixes as the SSRF allowlist: an allowed preview host is proxied.
  previewProxyUrl: process.env.SCREENSHOTTER_PREVIEW_PROXY_URL?.trim() || undefined,
  previewHostSuffixes: allowedHostSuffixes,
});

const app = await buildScreenshotterApp({
  logger: true,
  renderer,
  sharedSecret: process.env.SCREENSHOTTER_SHARED_SECRET,
  allowedHostSuffixes,
  maxConcurrency: Number(process.env.SCREENSHOTTER_MAX_CONCURRENCY ?? 2),
  width: Number(process.env.SCREENSHOTTER_WIDTH ?? 1280),
  height: Number(process.env.SCREENSHOTTER_HEIGHT ?? 800),
});

const port = Number(process.env.SCREENSHOTTER_PORT ?? 3030);

await app.listen({ host: '0.0.0.0', port });

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info(`received ${signal}, shutting down`);

  const deadline = setTimeout(() => process.exit(0), 15_000);
  deadline.unref();

  try {
    await app.close();
    await renderer.close();
  } catch {
    // best-effort shutdown; never block exit on a cleanup error
  } finally {
    clearTimeout(deadline);
    process.exit(0);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
