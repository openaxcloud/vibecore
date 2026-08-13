/**
 * Pure decision logic for chat-composer image attachments.
 *
 * Everything here is framework-free and DOM-free so it can be unit-tested:
 * the caller (BaseChat) injects a canvas factory for the re-encode path and
 * performs the actual File/FileReader IO itself.
 */

/** Hard upper bound for a single image attachment, in bytes. */
export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Human-readable form of {@link MAX_IMAGE_ATTACHMENT_BYTES} for toasts. */
export const MAX_IMAGE_ATTACHMENT_LABEL = '5MB';

/** Maximum number of images allowed on a single message. */
export const MAX_IMAGE_ATTACHMENTS = 4;

/** Longest edge (px) an attached image may keep; larger images are downscaled. */
export const MAX_IMAGE_EDGE_PX = 2048;

/** JPEG quality used when re-encoding attachments. */
export const JPEG_REENCODE_QUALITY = 0.85;

/**
 * Files at or below this size that already fit the edge limit are attached
 * untouched — re-encoding them would cost CPU for negligible savings.
 */
export const REENCODE_SKIP_BYTES = 512 * 1024;

export type ImageAttachmentDecision =
  | { action: 'reject'; reason: 'file-too-large' | 'attachment-limit'; message: string }
  | { action: 'accept' };

/**
 * Gatekeeper for adding one more image to the composer.
 * Cap is checked before size so a full composer always reports the cap.
 */
export function decideImageAttachment(input: {
  fileSizeBytes: number;
  currentAttachmentCount: number;
}): ImageAttachmentDecision {
  if (input.currentAttachmentCount >= MAX_IMAGE_ATTACHMENTS) {
    return {
      action: 'reject',
      reason: 'attachment-limit',
      message: `You can attach up to ${MAX_IMAGE_ATTACHMENTS} images per message.`,
    };
  }

  if (input.fileSizeBytes > MAX_IMAGE_ATTACHMENT_BYTES) {
    return {
      action: 'reject',
      reason: 'file-too-large',
      message: `Images must be ${MAX_IMAGE_ATTACHMENT_LABEL} or smaller.`,
    };
  }

  return { action: 'accept' };
}

/**
 * Scales (width, height) down so the longest edge is at most maxEdge,
 * preserving aspect ratio. Never upscales.
 */
export function fitWithinMaxEdge(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE_PX,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);

  if (longest <= maxEdge || longest <= 0) {
    return { width, height, scaled: false };
  }

  const ratio = maxEdge / longest;

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

export type ReencodePlan =
  | { reencode: false }
  | {
      reencode: true;
      targetWidth: number;
      targetHeight: number;
      outputType: 'image/jpeg' | 'image/png';
      quality?: number;
    };

/**
 * Decides whether an accepted image should be redrawn/re-encoded.
 *
 * - Small files that already fit the edge limit are kept as-is.
 * - Oversized dimensions always force a downscale.
 * - Alpha images stay PNG (JPEG would flatten transparency); opaque images
 *   become JPEG at {@link JPEG_REENCODE_QUALITY}.
 * - A large-but-small-dimensioned PNG with alpha is kept untouched: a
 *   same-size PNG→PNG re-encode rarely shrinks anything, so we trade
 *   potential bytes for fidelity and CPU.
 */
export function planImageReencode(input: {
  width: number;
  height: number;
  sizeBytes: number;
  hasAlpha: boolean;
}): ReencodePlan {
  const fitted = fitWithinMaxEdge(input.width, input.height);
  const isSmallFile = input.sizeBytes <= REENCODE_SKIP_BYTES;

  if (!fitted.scaled && isSmallFile) {
    return { reencode: false };
  }

  if (!fitted.scaled && input.hasAlpha) {
    return { reencode: false };
  }

  if (input.hasAlpha) {
    return {
      reencode: true,
      targetWidth: fitted.width,
      targetHeight: fitted.height,
      outputType: 'image/png',
    };
  }

  return {
    reencode: true,
    targetWidth: fitted.width,
    targetHeight: fitted.height,
    outputType: 'image/jpeg',
    quality: JPEG_REENCODE_QUALITY,
  };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** How many leading bytes of a PNG the caller should hand to {@link pngHasAlpha}. */
export const PNG_HEADER_SCAN_BYTES = 4096;

/**
 * Cheap alpha sniff on the leading bytes of a PNG.
 *
 * IHDR color types 4 (gray+alpha) and 6 (RGBA) carry alpha directly; palette
 * PNGs (type 3) carry alpha only via a tRNS chunk, so chunks are walked until
 * IDAT looking for one. When the scan window ends before the question is
 * settled we conservatively report `true` (keeping PNG never loses fidelity).
 * Non-PNG bytes report `false`.
 */
export function pngHasAlpha(headerBytes: Uint8Array): boolean {
  if (headerBytes.length < PNG_SIGNATURE.length) {
    return false;
  }

  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (headerBytes[i] !== PNG_SIGNATURE[i]) {
      return false;
    }
  }

  /*
   * IHDR color type lives at a fixed offset: 8 (signature) + 8 (chunk
   * length+type) + 8 (width+height) + 1 (bit depth) = byte 25.
   */
  const colorTypeOffset = 25;

  if (headerBytes.length <= colorTypeOffset) {
    return true;
  }

  const colorType = headerBytes[colorTypeOffset];

  if (colorType === 4 || colorType === 6) {
    return true;
  }

  if (colorType !== 3) {
    return false;
  }

  // Palette PNG: walk chunks looking for tRNS before IDAT.
  let offset = 8;

  while (offset + 8 <= headerBytes.length) {
    const length =
      (headerBytes[offset] << 24) |
      (headerBytes[offset + 1] << 16) |
      (headerBytes[offset + 2] << 8) |
      headerBytes[offset + 3];
    const type = String.fromCharCode(
      headerBytes[offset + 4],
      headerBytes[offset + 5],
      headerBytes[offset + 6],
      headerBytes[offset + 7],
    );

    if (type === 'tRNS') {
      return true;
    }

    if (type === 'IDAT') {
      return false;
    }

    if (length < 0) {
      return true;
    }

    offset += 8 + length + 4;
  }

  // Ran out of scanned bytes before IDAT: assume alpha to stay lossless.
  return true;
}

/** Minimal 2D-context surface the re-encode path needs (method syntax keeps DOM contexts assignable). */
export interface CanvasContextLike {
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

/** Minimal canvas surface the re-encode path needs. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: '2d'): CanvasContextLike | null;
}

export type CanvasFactory = (width: number, height: number) => CanvasLike;

/**
 * Draws `image` scaled to the plan's target size on a canvas obtained from
 * the injected factory. Returns null when a 2D context is unavailable so the
 * caller can fall back to the original file.
 */
export function renderImageToCanvas<T extends CanvasLike>(
  image: unknown,
  plan: Extract<ReencodePlan, { reencode: true }>,
  createCanvas: (width: number, height: number) => T,
): T | null {
  const canvas = createCanvas(plan.targetWidth, plan.targetHeight);
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, plan.targetWidth, plan.targetHeight);

  return canvas;
}
