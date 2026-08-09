import { type ObjectStorage, PROJECT_THUMBNAIL_KEY } from './object-storage.js';
import { previewCaptureToken } from './preview-tenant-token.js';

/*
 * P11 — automatic project thumbnails (Replit-style, no user gesture). When a
 * preview becomes ready or a deploy completes, the API asks the screenshotter
 * service to render the preview URL and writes the PNG into the project bucket
 * under the pinned key the cards already read. Entirely inert until
 * SCREENSHOTTER_URL is configured, so it is safe to ship before the pod exists.
 *
 * Debounce is per-process (per API replica): good enough to stop a burst of
 * preview-ready/deploy events from spamming renders. Worst case each replica
 * captures once per window — cheap and self-correcting.
 */

const DEFAULT_DEBOUNCE_MS = 5 * 60 * 1000;
const DEFAULT_CAPTURE_TIMEOUT_MS = 30_000;

export interface ThumbnailLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

export interface ThumbnailCapturerDeps {
  storage: ObjectStorage;

  /** In-cluster screenshotter base URL. Empty/undefined => feature disabled. */
  screenshotterUrl?: string;

  /** Bearer secret the screenshotter verifies. */
  sharedSecret?: string;

  fetchImpl?: typeof fetch;
  now?: () => number;
  debounceMs?: number;
  timeoutMs?: number;
  log?: ThumbnailLogger;
}

export class ThumbnailCapturer {
  readonly #lastCaptureMs = new Map<string, number>();
  readonly #inFlight = new Set<string>();

  constructor(private readonly deps: ThumbnailCapturerDeps) {}

  /** Feature is live only when a screenshotter URL is configured. */
  get enabled(): boolean {
    return Boolean(this.deps.screenshotterUrl);
  }

  #now(): number {
    return (this.deps.now ?? Date.now)();
  }

  #shouldSkip(projectId: string): boolean {
    if (this.#inFlight.has(projectId)) {
      return true;
    }

    const last = this.#lastCaptureMs.get(projectId) ?? 0;

    return this.#now() - last < (this.deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  /**
   * Render `previewUrl` and store it as the project thumbnail. Returns true when
   * a fresh screenshot was stored, false when skipped (disabled/debounced) or on
   * any recoverable failure — it never throws, so a caller can call it inline.
   */
  async capture(projectId: string, previewUrl: string, orgId?: string): Promise<boolean> {
    if (!this.enabled || !previewUrl || this.#shouldSkip(projectId)) {
      return false;
    }

    this.#inFlight.add(projectId);

    // Reserve the debounce slot up-front so concurrent events across the window
    // don't all fire before the first completes.
    this.#lastCaptureMs.set(projectId, this.#now());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS);

    try {
      const fetchImpl = this.deps.fetchImpl ?? fetch;
      const base = this.deps.screenshotterUrl!.replace(/\/+$/, '');

      const response = await fetchImpl(`${base}/capture`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.deps.sharedSecret ? { authorization: `Bearer ${this.deps.sharedSecret}` } : {}),
        },
        /*
         * `tenantToken`: the screenshotter renders from a blank browser context, so
         * it carries no `vc_preview` cookie and the preview-proxy's tenant gate
         * answers 403 once PREVIEW_PROXY_ENFORCE_TENANT is on — every thumbnail
         * would break (proven live, audit cluster 2026-08-09). We mint a
         * short-lived token for the project's org here and the screenshotter
         * presents it on the internal header the proxy also accepts. Undefined
         * when unprovisioned/no org: harmless, the proxy ignores it while
         * enforcement is off.
         */
        body: JSON.stringify({ url: previewUrl, projectId, tenantToken: previewCaptureToken(orgId) }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.deps.log?.warn({ projectId, status: response.status }, 'thumbnail screenshotter returned non-2xx');

        return false;
      }

      const body = new Uint8Array(await response.arrayBuffer());

      if (body.byteLength === 0) {
        return false;
      }

      await this.deps.storage.putObject(projectId, {
        key: PROJECT_THUMBNAIL_KEY,
        body,
        contentType: 'image/png',
      });

      this.#lastCaptureMs.set(projectId, this.#now());
      this.deps.log?.info({ projectId, bytes: body.byteLength }, 'stored project thumbnail');

      return true;
    } catch (error) {
      this.deps.log?.warn({ projectId, err: error }, 'thumbnail capture failed');

      return false;
    } finally {
      clearTimeout(timer);
      this.#inFlight.delete(projectId);
    }
  }

  /** Fire-and-forget: schedule a capture without ever affecting the caller. */
  schedule(projectId: string, previewUrl: string, orgId?: string): void {
    void this.capture(projectId, previewUrl, orgId).catch(() => {});
  }
}

/** Build a capturer from process env; disabled unless SCREENSHOTTER_URL is set. */
export function createThumbnailCapturer(storage: ObjectStorage, log?: ThumbnailLogger): ThumbnailCapturer {
  return new ThumbnailCapturer({
    storage,
    screenshotterUrl: process.env.SCREENSHOTTER_URL?.trim() || undefined,
    sharedSecret: process.env.SCREENSHOTTER_SHARED_SECRET?.trim() || undefined,
    log,
  });
}
