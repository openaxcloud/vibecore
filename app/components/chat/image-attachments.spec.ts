import { describe, expect, it } from 'vitest';

import {
  JPEG_REENCODE_QUALITY,
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_EDGE_PX,
  REENCODE_SKIP_BYTES,
  decideImageAttachment,
  fitWithinMaxEdge,
  planImageReencode,
  pngHasAlpha,
  renderImageToCanvas,
  type CanvasLike,
} from './image-attachments';

describe('decideImageAttachment', () => {
  it('accepts a small file when the composer has room', () => {
    const decision = decideImageAttachment({ fileSizeBytes: 1024, currentAttachmentCount: 0 });
    expect(decision).toEqual({ action: 'accept' });
  });

  it('accepts a file exactly at the size limit', () => {
    const decision = decideImageAttachment({
      fileSizeBytes: MAX_IMAGE_ATTACHMENT_BYTES,
      currentAttachmentCount: 0,
    });
    expect(decision).toEqual({ action: 'accept' });
  });

  it('rejects a file over the size limit and names the limit', () => {
    const decision = decideImageAttachment({
      fileSizeBytes: MAX_IMAGE_ATTACHMENT_BYTES + 1,
      currentAttachmentCount: 0,
    });
    expect(decision.action).toBe('reject');

    if (decision.action === 'reject') {
      expect(decision.reason).toBe('file-too-large');
      expect(decision.message).toContain('5MB');
    }
  });

  it('accepts the fourth image', () => {
    const decision = decideImageAttachment({
      fileSizeBytes: 1024,
      currentAttachmentCount: MAX_IMAGE_ATTACHMENTS - 1,
    });
    expect(decision).toEqual({ action: 'accept' });
  });

  it('rejects a fifth image and names the cap', () => {
    const decision = decideImageAttachment({
      fileSizeBytes: 1024,
      currentAttachmentCount: MAX_IMAGE_ATTACHMENTS,
    });
    expect(decision.action).toBe('reject');

    if (decision.action === 'reject') {
      expect(decision.reason).toBe('attachment-limit');
      expect(decision.message).toContain(`${MAX_IMAGE_ATTACHMENTS}`);
    }
  });

  it('reports the cap even when the file is also oversized', () => {
    const decision = decideImageAttachment({
      fileSizeBytes: MAX_IMAGE_ATTACHMENT_BYTES * 2,
      currentAttachmentCount: MAX_IMAGE_ATTACHMENTS,
    });
    expect(decision.action === 'reject' && decision.reason).toBe('attachment-limit');
  });
});

describe('fitWithinMaxEdge', () => {
  it('keeps images already within the limit', () => {
    expect(fitWithinMaxEdge(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
  });

  it('keeps images exactly at the limit', () => {
    expect(fitWithinMaxEdge(MAX_IMAGE_EDGE_PX, 100)).toEqual({
      width: MAX_IMAGE_EDGE_PX,
      height: 100,
      scaled: false,
    });
  });

  it('scales a landscape image down to the max edge, preserving aspect', () => {
    const fitted = fitWithinMaxEdge(4096, 1024);
    expect(fitted).toEqual({ width: 2048, height: 512, scaled: true });
  });

  it('scales a portrait image down along its height', () => {
    const fitted = fitWithinMaxEdge(1000, 5000);
    expect(fitted.height).toBe(MAX_IMAGE_EDGE_PX);
    expect(fitted.width).toBe(Math.round(1000 * (MAX_IMAGE_EDGE_PX / 5000)));
    expect(fitted.scaled).toBe(true);
  });

  it('never collapses a dimension to zero', () => {
    const fitted = fitWithinMaxEdge(100000, 1);
    expect(fitted.width).toBe(MAX_IMAGE_EDGE_PX);
    expect(fitted.height).toBe(1);
  });
});

describe('planImageReencode', () => {
  it('skips re-encode for small files within the edge limit', () => {
    const plan = planImageReencode({
      width: 1200,
      height: 900,
      sizeBytes: REENCODE_SKIP_BYTES,
      hasAlpha: false,
    });
    expect(plan).toEqual({ reencode: false });
  });

  it('re-encodes large opaque files to JPEG q0.85 even without downscale', () => {
    const plan = planImageReencode({
      width: 1200,
      height: 900,
      sizeBytes: REENCODE_SKIP_BYTES + 1,
      hasAlpha: false,
    });
    expect(plan).toEqual({
      reencode: true,
      targetWidth: 1200,
      targetHeight: 900,
      outputType: 'image/jpeg',
      quality: JPEG_REENCODE_QUALITY,
    });
  });

  it('downscales oversized opaque images to the max edge as JPEG', () => {
    const plan = planImageReencode({ width: 4096, height: 2048, sizeBytes: 1024, hasAlpha: false });
    expect(plan).toEqual({
      reencode: true,
      targetWidth: 2048,
      targetHeight: 1024,
      outputType: 'image/jpeg',
      quality: JPEG_REENCODE_QUALITY,
    });
  });

  it('keeps PNG output for oversized alpha images', () => {
    const plan = planImageReencode({ width: 4096, height: 4096, sizeBytes: 1024, hasAlpha: true });
    expect(plan).toEqual({
      reencode: true,
      targetWidth: 2048,
      targetHeight: 2048,
      outputType: 'image/png',
    });
  });

  it('leaves large alpha images alone when no downscale is needed', () => {
    const plan = planImageReencode({
      width: 1000,
      height: 1000,
      sizeBytes: REENCODE_SKIP_BYTES * 4,
      hasAlpha: true,
    });
    expect(plan).toEqual({ reencode: false });
  });
});

function pngBytes(colorType: number, chunksAfterIhdr: Array<{ type: string; length: number }> = []): Uint8Array {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  const pushChunkHeader = (type: string, length: number) => {
    bytes.push((length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff);

    for (const char of type) {
      bytes.push(char.charCodeAt(0));
    }
  };

  // IHDR: 13-byte payload (width, height, bit depth, color type, ...).
  pushChunkHeader('IHDR', 13);
  bytes.push(0, 0, 0, 1); // width
  bytes.push(0, 0, 0, 1); // height
  bytes.push(8); // bit depth
  bytes.push(colorType);
  bytes.push(0, 0, 0); // compression, filter, interlace
  bytes.push(0, 0, 0, 0); // CRC

  for (const chunk of chunksAfterIhdr) {
    pushChunkHeader(chunk.type, chunk.length);

    for (let i = 0; i < chunk.length; i++) {
      bytes.push(0);
    }

    bytes.push(0, 0, 0, 0); // CRC
  }

  return new Uint8Array(bytes);
}

describe('pngHasAlpha', () => {
  it('returns false for non-PNG bytes', () => {
    expect(pngHasAlpha(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });

  it('detects RGBA (color type 6)', () => {
    expect(pngHasAlpha(pngBytes(6))).toBe(true);
  });

  it('detects gray+alpha (color type 4)', () => {
    expect(pngHasAlpha(pngBytes(4))).toBe(true);
  });

  it('reports opaque truecolor (color type 2) as no alpha', () => {
    expect(pngHasAlpha(pngBytes(2, [{ type: 'IDAT', length: 4 }]))).toBe(false);
  });

  it('detects palette alpha via a tRNS chunk', () => {
    expect(pngHasAlpha(pngBytes(3, [{ type: 'tRNS', length: 1 }]))).toBe(true);
  });

  it('reports palette without tRNS before IDAT as no alpha', () => {
    expect(pngHasAlpha(pngBytes(3, [{ type: 'IDAT', length: 4 }]))).toBe(false);
  });

  it('assumes alpha for a palette PNG whose scan window ends before IDAT', () => {
    expect(pngHasAlpha(pngBytes(3))).toBe(true);
  });

  it('assumes alpha for a PNG truncated before the color type byte', () => {
    expect(pngHasAlpha(pngBytes(6).slice(0, 16))).toBe(true);
  });
});

describe('renderImageToCanvas', () => {
  it('draws the image scaled onto an injected canvas', () => {
    const draws: unknown[][] = [];

    const fakeCanvas: CanvasLike = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (...args: unknown[]) => {
          draws.push(args);
        },
      }),
    };

    const created: Array<{ width: number; height: number }> = [];
    const image = { alt: 'source' };

    const canvas = renderImageToCanvas(
      image,
      { reencode: true, targetWidth: 640, targetHeight: 480, outputType: 'image/jpeg', quality: 0.85 },
      (width, height) => {
        created.push({ width, height });

        return fakeCanvas;
      },
    );

    expect(canvas).toBe(fakeCanvas);
    expect(created).toEqual([{ width: 640, height: 480 }]);
    expect(draws).toEqual([[image, 0, 0, 640, 480]]);
  });

  it('returns null when the canvas has no 2d context', () => {
    const canvas = renderImageToCanvas(
      {},
      { reencode: true, targetWidth: 10, targetHeight: 10, outputType: 'image/png' },
      () => ({ width: 0, height: 0, getContext: () => null }),
    );

    expect(canvas).toBeNull();
  });
});
