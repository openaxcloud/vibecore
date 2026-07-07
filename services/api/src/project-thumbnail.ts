import { PROJECT_THUMBNAIL_KEY, type ObjectStorage } from './object-storage.js';

/*
 * Automatic project-thumbnail capture (P11, Replit-parity: no user gesture).
 *
 * A headless renderer (the `screenshotter` microservice) turns a project's live
 * preview/deployment URL into a PNG; we store it in the project's own GCS bucket
 * under the server-pinned key so the Dashboard/Projects cards render it. This
 * module is the INFRA-INDEPENDENT orchestration: the renderer is injected behind
 * an interface, so the debounce + store logic is fully unit-testable with fakes
 * and works the moment the screenshotter pod exists.
 */

/** Renders a URL to a PNG. Implemented over HTTP by the screenshotter service. */
export interface ThumbnailRenderer {
  /** Returns the PNG bytes, or null when rendering failed / is unavailable. */
  render(input: { url: string; projectId: string }): Promise<Uint8Array | null>;
}

/**
 * HTTP renderer backed by the screenshotter microservice. Inert (returns null)
 * when SCREENSHOTTER_URL is unset, so the capture path degrades to a no-op until
 * the service is deployed rather than throwing into every trigger.
 */
export class HttpThumbnailRenderer implements ThumbnailRenderer {
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly secret?: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async render(input: { url: string; projectId: string }): Promise<Uint8Array | null> {
    if (!this.baseUrl) {
      return null;
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/capture`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.secret ? { authorization: `Bearer ${this.secret}` } : {}),
        },
        body: JSON.stringify({ url: input.url, projectId: input.projectId }),
        // A hung render must not pin the caller (a deploy hook / preview ping).
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    return bytes.byteLength > 0 ? bytes : null;
  }
}

/** Skip a re-capture if the stored thumbnail is younger than this. */
export const THUMBNAIL_DEBOUNCE_MS = 5 * 60_000;

export type CaptureThumbnailResult = 'stored' | 'debounced' | 'disabled' | 'render-failed';

/**
 * Capture a project's preview/deployment URL and store it as the thumbnail.
 *
 * Best-effort and NEVER throws to the caller — automatic capture is fire-and-
 * forget from a deploy hook or preview-ready ping. Debounced against the stored
 * object's own `updated` time (no extra state) so rapid triggers coalesce; pass
 * `force` to bypass (e.g. an explicit deploy).
 */
export async function captureProjectThumbnail(
  deps: { storage: ObjectStorage; renderer: ThumbnailRenderer; now?: () => number },
  input: { projectId: string; url: string; force?: boolean },
): Promise<CaptureThumbnailResult> {
  const { storage, renderer } = deps;
  const now = deps.now ?? Date.now;

  if (!storage.active) {
    return 'disabled';
  }

  if (!input.force) {
    try {
      const { objects } = await storage.listObjects(input.projectId, { prefix: PROJECT_THUMBNAIL_KEY });
      const existing = objects.find((object) => object.key === PROJECT_THUMBNAIL_KEY);

      if (existing?.updated) {
        const age = now() - new Date(existing.updated).getTime();

        if (age >= 0 && age < THUMBNAIL_DEBOUNCE_MS) {
          return 'debounced';
        }
      }
    } catch {
      // A listing failure shouldn't block a capture — fall through and render.
    }
  }

  const png = await renderer.render({ url: input.url, projectId: input.projectId });

  if (!png) {
    return 'render-failed';
  }

  await storage.ensureBucket(input.projectId);
  await storage.putObject(input.projectId, { key: PROJECT_THUMBNAIL_KEY, body: png, contentType: 'image/png' });

  return 'stored';
}
