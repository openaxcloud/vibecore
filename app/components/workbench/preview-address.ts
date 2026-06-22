/*
 * Pure helpers for the Preview address bar and the runtime-ready reload edge.
 *
 * Extracted from Preview.tsx so the branchy address-resolution and per-port
 * readiness-edge logic can be unit-tested without a DOM. Two subtle bugs lived
 * in the inline versions:
 *
 *   1. A cross-origin address-bar navigation stored the full external URL in
 *      displayPath. displayPath is persisted as previewPath and later
 *      concatenated onto the active preview's baseUrl, so after a reload the
 *      restored address became `${baseUrl}/https://other.com/x` — corrupting the
 *      address bar and Copy-URL.
 *   2. A single shared "was ready" boolean leaked the false → true readiness edge
 *      across unrelated ports, so switching to an already-ready port bounced its
 *      freshly-rendered iframe through a spurious full reload.
 */

export interface AddressResolution {
  /* The URL the iframe should point at (may be cross-origin). */
  iframeUrl: string;

  /* The value to show in the address bar input. */
  addressInput: string;

  /*
   * The same-origin path to persist as displayPath, or undefined when the
   * navigation is cross-origin and must NOT mutate displayPath.
   */
  displayPath?: string;

  /* Whether this navigation crossed to a different origin. */
  crossOrigin: boolean;
}

/**
 * Resolve an address-bar submission against the active preview's baseUrl.
 *
 * Returns `displayPath: undefined` for cross-origin navigations so the caller
 * leaves the persisted path untouched.
 */
export function resolvePreviewAddress(rawInput: string, baseUrl: string): AddressResolution {
  const rawAddress = rawInput.trim() || '/';

  if (/^https?:\/\//i.test(rawAddress)) {
    let parsedUrl: URL;
    let activeOrigin: URL;

    try {
      parsedUrl = new URL(rawAddress);
      activeOrigin = new URL(baseUrl);
    } catch {
      /* Malformed input — leave the iframe where it is and reflect nothing new. */
      return { iframeUrl: '', addressInput: '', displayPath: undefined, crossOrigin: false };
    }

    if (parsedUrl.origin === activeOrigin.origin) {
      const targetPath = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` || '/';

      return {
        iframeUrl: `${baseUrl}${targetPath}`,
        addressInput: `${baseUrl}${targetPath}`,
        displayPath: targetPath,
        crossOrigin: false,
      };
    }

    return { iframeUrl: rawAddress, addressInput: rawAddress, displayPath: undefined, crossOrigin: true };
  }

  const targetPath = rawAddress.startsWith('/') ? rawAddress : `/${rawAddress}`;

  return {
    iframeUrl: `${baseUrl}${targetPath}`,
    addressInput: `${baseUrl}${targetPath}`,
    displayPath: targetPath,
    crossOrigin: false,
  };
}

export interface PreviewReadyEdgeState {
  /* Identity of the preview the last reading came from (e.g. its baseUrl). */
  key: string | undefined;

  /* The readiness value last observed for that identity. */
  ready: boolean | undefined;
}

export interface PreviewReadyEdgeResult {
  /* The next state to store in the tracking ref. */
  next: PreviewReadyEdgeState;

  /* Whether a not-ready → ready edge fired for the SAME preview identity. */
  shouldReload: boolean;
}

/**
 * Decide whether the runtime-ready reload should fire, keyed to the active
 * preview's identity so the false → true edge only counts within a single port.
 */
export function evaluatePreviewReadyEdge(
  previous: PreviewReadyEdgeState,
  key: string | undefined,
  ready: boolean | undefined,
): PreviewReadyEdgeResult {
  const wasReady = previous.key === key ? previous.ready : undefined;
  const shouldReload = key !== undefined && ready === true && wasReady === false;

  return { next: { key, ready }, shouldReload };
}
