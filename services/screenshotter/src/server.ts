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

const renderer = new PlaywrightPageRenderer({
  navTimeoutMs: Number(process.env.SCREENSHOTTER_NAV_TIMEOUT_MS ?? 15_000),
  settleMs: Number(process.env.SCREENSHOTTER_SETTLE_MS ?? 500),
  // Route preview hosts through the in-cluster preview-proxy (avoids the hairpin).
  // Same suffixes as the SSRF allowlist: an allowed preview host is proxied.
  previewProxyUrl: process.env.SCREENSHOTTER_PREVIEW_PROXY_URL?.trim() || undefined,
  // Le proxy compare ce secret sur `/d/<id>` et `/s/<id>` (vignettes de
  // publications) ; c'est le meme PREVIEW_PROXY_SHARED_SECRET que cote API.
  previewProxySecret: process.env.PREVIEW_PROXY_SHARED_SECRET?.trim() || undefined,
  previewHostSuffixes: allowedHostSuffixes,
});

/*
 * FAIL-CLOSED sur l'authentification de `/capture`.
 *
 * `buildScreenshotterApp` n'exige le porteur que SI un secret est fourni
 * (`if (options.sharedSecret && ...)`). Ce défaut par omission est le même motif que
 * ceux relevés au contre-audit : sans secret configuré, le service accepte
 * n'importe quel appelant du cluster, et `/capture` n'est pas une route anodine —
 * elle rend une URL arbitraire, en portant le jeton tenant fourni par l'appelant.
 * Un renderer ouvert est un SSRF avec autorisation en prime.
 *
 * On refuse donc de DÉMARRER sans secret, comme le preview-proxy refuse de démarrer
 * sans le sien. Même raison d'être : mieux vaut un pod qui ne monte pas, visible
 * tout de suite, qu'une porte ouverte que personne ne remarque.
 */
const sharedSecret = process.env.SCREENSHOTTER_SHARED_SECRET?.trim();

if (!sharedSecret) {
  throw new Error(
    'SCREENSHOTTER_SHARED_SECRET est requis : sans lui /capture accepterait tout appelant, ' +
      'alors que cette route rend une URL arbitraire en portant le jeton tenant recu.',
  );
}

/*
 * Même logique pour l'allowlist SSRF : `allowedHostSuffixes` vide signifie « tout
 * hôte autorisé » côté app (commentaire d'origine : « only safe for local/dev »).
 * En pod, cette permissivité n'a aucune raison d'exister.
 */
if (allowedHostSuffixes.length === 0) {
  throw new Error(
    'SCREENSHOTTER_ALLOWED_HOSTS est requis : une liste vide autorise tout hote, ' +
      'ce qui fait de /capture un renderer ouvert vers les adresses internes.',
  );
}

const app = await buildScreenshotterApp({
  logger: true,
  renderer,
  sharedSecret,
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
