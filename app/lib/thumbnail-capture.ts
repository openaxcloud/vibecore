/*
 * P11 — capture a REAL screenshot of the running preview and store it as the
 * project thumbnail. The preview runs in a cross-origin iframe (…preview.e-code.ai),
 * so a same-page canvas draw of it is tainted/blocked; the only real in-browser
 * capture is the Screen Capture API. We reuse the exact mechanism the existing
 * ScreenshotSelector relies on: getDisplayMedia({ preferCurrentTab }) requests the
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

/** Bound browser APIs that may never settle, including an abandoned sharing picker. */
async function withDeadline<T>(milliseconds: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Thumbnail capture or upload timed out. Please try again.', 'TimeoutError');
      reject(error);
      controller.abort(error);
    }, milliseconds);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Capture `target` (the preview surface) to a PNG blob using the Screen Capture
 * API. Must be called from a user gesture. The caller is responsible for the
 * permission UX. Capture has a 30-second deadline; granted tracks are stopped
 * on settlement, including a grant arriving after expiration.
 */
export async function capturePreviewPng(target: HTMLElement): Promise<Blob> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not supported in this browser.');
  }

  let stream: MediaStream | undefined;
  let video: HTMLVideoElement | undefined;
  let frame: number | undefined;

  try {
    return await withDeadline(30_000, async (signal) => {
      const acquired = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: true,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);

      // The picker cannot be aborted. A late grant must never keep sharing alive.
      if (signal.aborted) {
        acquired.getTracks().forEach((track) => track.stop());
        signal.throwIfAborted();
      }

      stream = acquired;

      const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;

      if (surface && surface !== 'browser') {
        throw new Error('Select the current browser tab to capture the preview.');
      }

      video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      signal.throwIfAborted();

      // Give the compositor a frame so videoWidth/Height are populated.
      await new Promise<void>((resolve) => {
        frame = requestAnimationFrame(() => resolve());
      });
      signal.throwIfAborted();

      const frameWidth = video.videoWidth;
      const frameHeight = video.videoHeight;

      if (!frameWidth || !frameHeight) {
        throw new Error('Screen capture produced an empty frame.');
      }

      /*
       * preferCurrentTab requests the current tab but does not prove its identity.
       * The user must select this tab; another tab cannot be identified by settings.
       * For the current tab the frame covers the whole viewport. Map the
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
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode screenshot.'))),
          'image/png',
        );
      });
    });
  } finally {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }

    stream?.getTracks().forEach((track) => track.stop());

    if (video) {
      video.pause();
      video.srcObject = null;
    }
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

  const uploadUrl = target.url;

  await withDeadline(15_000, async (signal) => {
    const response = await fetch(uploadUrl, {
      signal,
      method: target.method ?? 'PUT',
      headers: target.headers ?? { 'Content-Type': 'image/png' },
      body: blob,
    });

    if (!response.ok) {
      throw new Error(`Thumbnail upload failed (${response.status}).`);
    }
  });
}

/**
 * Full flow: capture the preview element, mint a signed PUT via the project
 * thumbnail route, and upload the PNG. Returns silently when object storage is
 * disabled so a capture attempt degrades to a no-op rather than an error.
 */
export async function captureAndUploadThumbnail(projectId: string, target: HTMLElement): Promise<boolean> {
  const blob = await capturePreviewPng(target);

  const uploadTarget = await withDeadline(15_000, async (signal) => {
    const response = await fetch(`/api/projects/${projectId}/thumbnail`, { method: 'POST', signal });
    return (await response.json().catch(() => ({}))) as ThumbnailUploadTarget;
  });

  if (uploadTarget.enabled === false) {
    return false;
  }

  await uploadThumbnailBlob(uploadTarget, blob);

  return true;
}
