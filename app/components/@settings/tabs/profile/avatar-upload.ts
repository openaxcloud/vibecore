/**
 * Pure helpers for the profile avatar upload flow.
 *
 * These are extracted out of `ProfileTab.tsx` so the storage-quota handling and
 * image downscaling logic can be unit-tested without rendering the component or
 * touching the DOM image pipeline.
 */

/**
 * Detects a localStorage / sessionStorage quota error across browsers.
 *
 * Chrome/Safari throw a `DOMException` named `QuotaExceededError` (code 22),
 * Firefox historically used `NS_ERROR_DOM_QUOTA_REACHED` (code 1014). Some
 * environments only set the legacy numeric `code`, so we check name and code.
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  const e = error as { name?: string; code?: number };

  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}

/**
 * Approximate byte size of a base64 data URL payload (decoded length).
 */
export function approximateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export interface DownscaleOptions {
  /** Max width/height in pixels for the longest edge. */
  maxEdge: number;

  /** JPEG quality 0..1. */
  quality: number;
}

export const DEFAULT_AVATAR_DOWNSCALE: DownscaleOptions = {
  maxEdge: 256,
  quality: 0.85,
};

/**
 * Computes the target dimensions that fit `maxEdge` while preserving aspect
 * ratio. Never upscales.
 */
export function fitWithinMaxEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }

  const longest = Math.max(width, height);

  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxEdge / longest;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Downscales/compresses an image data URL to a smaller JPEG data URL using a
 * canvas. Returns the original data URL unchanged if the browser image/canvas
 * pipeline is unavailable (e.g. SSR) or fails, so callers always get a usable
 * value. Quota handling is the caller's responsibility.
 */
export async function downscaleAvatarDataUrl(
  dataUrl: string,
  options: DownscaleOptions = DEFAULT_AVATAR_DOWNSCALE,
): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return dataUrl;
  }

  try {
    const image = await loadImage(dataUrl);
    const { width, height } = fitWithinMaxEdge(image.naturalWidth, image.naturalHeight, options.maxEdge);

    if (width === 0 || height === 0) {
      return dataUrl;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return dataUrl;
    }

    ctx.drawImage(image, 0, 0, width, height);

    const result = canvas.toDataURL('image/jpeg', options.quality);

    // Only use the result if it actually shrank the payload.
    return result && approximateDataUrlBytes(result) < approximateDataUrlBytes(dataUrl) ? result : dataUrl;
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for downscaling'));
    image.src = src;
  });
}
