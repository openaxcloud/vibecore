import { type ObjectStorage, PROJECT_THUMBNAIL_KEY } from './object-storage.js';

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
const DEFAULT_FAILURE_COOLDOWN_MS = 5_000;

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
  failureCooldownMs?: number;
  log?: ThumbnailLogger;
}

/** Stable machine protocol values, never user-facing copy. */
export const THUMBNAIL_CAPTURE_REASONS = {
  disabled: 'disabled',
  recentSuccess: 'recent-success',
  failureCooldown: 'failure-cooldown',
  inFlight: 'in-flight',
  deadline: 'deadline',
  storageUnconfirmed: 'storage-unconfirmed',
  captureError: 'capture-error',
} as const;

export type ThumbnailCaptureResult =
  | { status: 'stored' }
  | { status: 'skipped'; reason: 'disabled' | 'recent-success' | 'failure-cooldown' }
  | { status: 'pending'; reason: 'in-flight' | 'deadline' | 'storage-unconfirmed' }
  | { status: 'failed'; reason: 'capture-error' };

export class ThumbnailCapturer {
  readonly #lastCaptureMs = new Map<string, number>();
  readonly #lastFailureMs = new Map<string, number>();
  readonly #inFlight = new Set<string>();

  constructor(private readonly _deps: ThumbnailCapturerDeps) {}

  /** Feature is live only when a screenshotter URL is configured. */
  get enabled(): boolean {
    return Boolean(this._deps.screenshotterUrl);
  }

  #now(): number {
    return (this._deps.now ?? Date.now)();
  }

  #skipResult(projectId: string): ThumbnailCaptureResult | undefined {
    if (this.#inFlight.has(projectId)) {
      return { status: 'pending', reason: THUMBNAIL_CAPTURE_REASONS.inFlight };
    }

    const now = this.#now();
    const last = this.#lastCaptureMs.get(projectId);
    const failure = this.#lastFailureMs.get(projectId);

    if (last !== undefined && now - last < (this._deps.debounceMs ?? DEFAULT_DEBOUNCE_MS)) {
      return { status: 'skipped', reason: THUMBNAIL_CAPTURE_REASONS.recentSuccess };
    }

    if (failure !== undefined && now - failure < (this._deps.failureCooldownMs ?? DEFAULT_FAILURE_COOLDOWN_MS)) {
      return { status: 'skipped', reason: THUMBNAIL_CAPTURE_REASONS.failureCooldown };
    }

    return undefined;
  }

  /** HTTP budget only: a pending storage operation keeps its lock until settlement. */
  async captureResultWithinDeadline(
    projectId: string,
    previewUrl: string,
    timeoutMs = 25_000,
  ): Promise<ThumbnailCaptureResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        this.captureResult(projectId, previewUrl),
        new Promise<ThumbnailCaptureResult>((resolve) => {
          timer = setTimeout(
            () => resolve({ status: 'pending', reason: THUMBNAIL_CAPTURE_REASONS.deadline }),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Render `previewUrl` and store it as the project thumbnail. Returns true when
   * a fresh screenshot was stored, false when skipped (disabled/debounced) or on
   * any recoverable failure — it never throws, so a caller can call it inline.
   */
  async capture(projectId: string, previewUrl: string): Promise<boolean> {
    return (await this.captureResult(projectId, previewUrl)).status === 'stored';
  }

  async captureResult(projectId: string, previewUrl: string): Promise<ThumbnailCaptureResult> {
    if (!this.enabled || !previewUrl) {
      return { status: 'skipped', reason: THUMBNAIL_CAPTURE_REASONS.disabled };
    }

    const skipped = this.#skipResult(projectId);

    if (skipped) {
      return skipped;
    }

    this.#inFlight.add(projectId);

    /*
     * The in-flight guard prevents overlap; only a completed write earns the
     * five-minute debounce. Failed attempts get a short retry cooldown instead.
     */
    let stored = false;
    let writeStarted = false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._deps.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS);

    try {
      const fetchImpl = this._deps.fetchImpl ?? fetch;
      const base = this._deps.screenshotterUrl!.replace(/\/+$/, '');

      const response = await fetchImpl(`${base}/capture`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this._deps.sharedSecret ? { authorization: `Bearer ${this._deps.sharedSecret}` } : {}),
        },
        body: JSON.stringify({ url: previewUrl, projectId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this._deps.log?.warn({ projectId, status: response.status }, 'thumbnail screenshotter returned non-2xx');

        return { status: 'failed', reason: THUMBNAIL_CAPTURE_REASONS.captureError };
      }

      const body = new Uint8Array(await response.arrayBuffer());

      if (body.byteLength === 0) {
        return { status: 'failed', reason: THUMBNAIL_CAPTURE_REASONS.captureError };
      }

      controller.signal.throwIfAborted();
      await this._deps.storage.ensureBucket(projectId);
      controller.signal.throwIfAborted();

      /*
       * ObjectStorage cannot cancel an in-progress operation. Keep the in-flight
       * guard until it settles: releasing it on timeout could permit stale writes
       * to race a newer capture. Never start a write after provisioning times out.
       */
      writeStarted = true;
      await this._deps.storage.putObject(projectId, {
        key: PROJECT_THUMBNAIL_KEY,
        body,
        contentType: 'image/png',
      });

      controller.signal.throwIfAborted();
      stored = true;
      this.#lastFailureMs.delete(projectId);
      this.#lastCaptureMs.set(projectId, this.#now());
      this._deps.log?.info({ projectId, bytes: body.byteLength }, 'stored project thumbnail');

      return { status: 'stored' };
    } catch (error) {
      this._deps.log?.warn({ projectId, err: error }, 'thumbnail capture failed');

      return controller.signal.aborted
        ? { status: 'pending', reason: THUMBNAIL_CAPTURE_REASONS.deadline }
        : writeStarted
          ? { status: 'pending', reason: THUMBNAIL_CAPTURE_REASONS.storageUnconfirmed }
          : { status: 'failed', reason: THUMBNAIL_CAPTURE_REASONS.captureError };
    } finally {
      if (!stored) {
        this.#lastFailureMs.set(projectId, this.#now());
      }

      clearTimeout(timer);
      this.#inFlight.delete(projectId);
    }
  }

  /** Fire-and-forget: schedule a capture without ever affecting the caller. */
  schedule(projectId: string, previewUrl: string): void {
    void this.capture(projectId, previewUrl).catch(() => {});
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
