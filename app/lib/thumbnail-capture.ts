/*
 * P11 — capture a REAL screenshot of the running preview and store it as the
 * project thumbnail. The preview runs in a cross-origin iframe (…preview.e-code.ai),
 * so a same-page canvas draw of it is tainted/blocked; the only real in-browser
 * capture is the Screen Capture API. We reuse the exact mechanism the existing
 * ScreenshotSelector relies on: getDisplayMedia({ preferCurrentTab }) grabs the
 * current tab's rendered pixels (the browser compositor includes the iframe), and
 * we crop to the preview element's rect. The PNG is then PUT straight to a signed
 * object-storage URL minted by /api/projects/:id/thumbnail — bytes never transit
 * our servers, and there is no base64 in the DB.
 */

/** Shape returned by the thumbnail upload-url proxy action. */
export interface ThumbnailUploadTarget {
  ok?: boolean;
  enabled?: boolean;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  error?: string;
}

/**
 * Capture `target` (the preview surface) to a PNG blob using the Screen Capture
 * API. Must be called from a user gesture. The caller is responsible for the
 * permission UX; we always stop the stream tracks before returning.
 */
export async function capturePreviewPng(target: HTMLElement): Promise<Blob> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not supported in this browser.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: { preferCurrentTab: true } as MediaTrackConstraints,
  } as MediaStreamConstraints);

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;

    await video.play();

    // Give the compositor a frame so videoWidth/Height are populated.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const frameWidth = video.videoWidth;
    const frameHeight = video.videoHeight;

    if (!frameWidth || !frameHeight) {
      throw new Error('Screen capture produced an empty frame.');
    }

    /*
     * getDisplayMedia({ preferCurrentTab }) frames the whole tab viewport. Map the
     * target's CSS rect into captured-frame pixels via the viewport→frame scale,
     * exactly like ScreenshotSelector's crop.
     */
    const scaleX = frameWidth / window.innerWidth;
    const scaleY = frameHeight / window.innerHeight;
    const rect = target.getBoundingClientRect();

    const sx = Math.max(0, Math.round(rect.left * scaleX));
    const sy = Math.max(0, Math.round(rect.top * scaleY));
    const sw = Math.max(1, Math.round(rect.width * scaleX));
    const sh = Math.max(1, Math.round(rect.height * scaleY));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not obtain a 2D canvas context.');
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode screenshot.'))), 'image/png');
    });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

/**
 * PUT an already-captured PNG blob to the signed object-storage target. Split out
 * from the browser capture so the upload contract is unit-testable. Throws with a
 * useful message on any non-2xx so the caller can toast it.
 */
export async function uploadThumbnailBlob(target: ThumbnailUploadTarget, blob: Blob): Promise<void> {
  if (target.enabled === false) {
    throw new Error('Object storage is not enabled for this project.');
  }

  if (!target.ok || !target.url) {
    throw new Error(target.error ?? 'Thumbnail upload is unavailable.');
  }

  const response = await fetch(target.url, {
    method: target.method ?? 'PUT',
    headers: target.headers ?? { 'Content-Type': 'image/png' },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Thumbnail upload failed (${response.status}).`);
  }
}

/**
 * Full flow: capture the preview element, mint a signed PUT via the project
 * thumbnail route, and upload the PNG. Returns silently when object storage is
 * disabled so a capture attempt degrades to a no-op rather than an error.
 */
export async function captureAndUploadThumbnail(projectId: string, target: HTMLElement): Promise<boolean> {
  const blob = await capturePreviewPng(target);

  const response = await fetch(`/api/projects/${projectId}/thumbnail`, { method: 'POST' });
  const uploadTarget = (await response.json().catch(() => ({}))) as ThumbnailUploadTarget;

  if (uploadTarget.enabled === false) {
    return false;
  }

  await uploadThumbnailBlob(uploadTarget, blob);

  return true;
}
