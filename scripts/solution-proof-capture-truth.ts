import { createHash } from 'node:crypto';

import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';

export type SolutionProofDevice = 'desktop' | 'tablet' | 'mobile';

export const SOLUTION_PROOF_CAPTURE_CANVAS = { height: 900, width: 1440 } as const;

export const SOLUTION_PROOF_DEVICE_VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  tablet: { height: 1024, width: 768 },
  mobile: { height: 844, width: 390 },
} as const satisfies Record<SolutionProofDevice, { height: number; width: number }>;

export type DirectCaptureCompositionAudit = {
  background: 'not-applicable' | { alpha: 1; b: number; g: number; r: number };
  canvas: { height: 900; width: 1440 };
  capturedViewport: { height: number; width: number };
  composed: boolean;
  fit: 'contain' | 'native';
  position: 'centre';
  renderedRect: { height: number; width: number; x: number; y: number };
  sourceImage: { height: number; width: number };
  withoutEnlargement: true;
};

export function directCaptureCompositionAudit(
  device: SolutionProofDevice,
  sourceImage: { height: number; width: number },
): DirectCaptureCompositionAudit {
  const capturedViewport = SOLUTION_PROOF_DEVICE_VIEWPORTS[device];

  if (sourceImage.width !== capturedViewport.width || sourceImage.height !== capturedViewport.height) {
    throw new Error(
      `Direct runtime capture dimensions do not match the selected ${device} viewport ` +
        `(expected ${capturedViewport.width}x${capturedViewport.height}, received ${sourceImage.width}x${sourceImage.height})`,
    );
  }

  const scale = Math.min(
    1,
    SOLUTION_PROOF_CAPTURE_CANVAS.width / sourceImage.width,
    SOLUTION_PROOF_CAPTURE_CANVAS.height / sourceImage.height,
  );

  const renderedWidth = Math.round(sourceImage.width * scale);
  const renderedHeight = Math.round(sourceImage.height * scale);

  return {
    background: 'not-applicable',
    canvas: SOLUTION_PROOF_CAPTURE_CANVAS,
    capturedViewport,
    composed: device !== 'desktop',
    fit: device === 'desktop' ? 'native' : 'contain',
    position: 'centre',
    renderedRect: {
      height: renderedHeight,
      width: renderedWidth,
      x: Math.floor((SOLUTION_PROOF_CAPTURE_CANVAS.width - renderedWidth) / 2),
      y: Math.floor((SOLUTION_PROOF_CAPTURE_CANVAS.height - renderedHeight) / 2),
    },
    sourceImage,
    withoutEnlargement: true,
  };
}

export async function composeDirectRuntimeCapture(
  source: Buffer,
  device: SolutionProofDevice,
  theme: 'light' | 'dark',
) {
  const metadata = await sharp(source).metadata();

  const audit = directCaptureCompositionAudit(device, {
    height: metadata.height ?? 0,
    width: metadata.width ?? 0,
  });

  if (!audit.composed) {
    return { audit, png: source };
  }

  const background: Exclude<DirectCaptureCompositionAudit['background'], 'not-applicable'> =
    theme === 'dark' ? { alpha: 1, b: 18, g: 15, r: 12 } : { alpha: 1, b: 250, g: 248, r: 246 };

  const png = await sharp(source)
    .resize({
      background,
      fit: 'contain',
      height: SOLUTION_PROOF_CAPTURE_CANVAS.height,
      kernel: sharp.kernel.lanczos3,
      position: 'centre',
      width: SOLUTION_PROOF_CAPTURE_CANVAS.width,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  return { audit: { ...audit, background }, png };
}

export type NativeWebviewAudit = {
  attached: true;
  entropy: number;
  expectedIdentity: string;
  identityVisible: true;
  imageBytes: number;
  imageSha256: string;
  imageSize: { height: number; width: number };
  horizontalOverflow: number;
  nonBlank: true;
  textLength: number;
  visible: true;
  visibleErrors: [];
};

export type NativeWebviewAuditResult = {
  audit: NativeWebviewAudit;
  screenshot: Buffer;
};

const VISIBLE_PREVIEW_ERROR_PATTERN =
  /\berror\b|something went wrong|failed to resolve import|cannot find module|unexpected token|uncaught typeerror|plugin:vite|preview_upstream_unreachable|not reachable|starting, or it crashed|\berreur\b|un problème|échec|impossible de résoudre|a planté/i;

/**
 * Audit the pixels actually embedded in the visible IDE Webview. This helper
 * deliberately never consults an official-runtime direct page.
 */
export async function auditNativeIdeWebview(page: Page, expectedIdentity: string): Promise<NativeWebviewAuditResult> {
  const iframe = page.locator('iframe[data-testid="preview-iframe"]:visible').last();

  await expect(iframe, 'The IDE-shell proof requires a visible native Preview iframe').toBeVisible({
    timeout: 30_000,
  });

  const iframeHandle = await iframe.elementHandle();
  const frame = await iframeHandle?.contentFrame();

  if (!frame) {
    throw new Error('The IDE-shell proof requires an attached native Preview iframe');
  }

  const body = frame.locator('body');
  await expect(body, 'The native Preview iframe must expose its real document body').toBeAttached({ timeout: 30_000 });

  const [text, horizontalOverflow] = await Promise.all([
    body.innerText().then((value) => value.replace(/\s+/g, ' ').trim()),
    body.evaluate((previewBody) => {
      const root = previewBody.ownerDocument.documentElement;

      return Math.max(0, root.scrollWidth - root.clientWidth, previewBody.scrollWidth - previewBody.clientWidth);
    }),
  ]);

  const identityVisible = text.toLocaleLowerCase().includes(expectedIdentity.toLocaleLowerCase());

  const semanticErrorTexts = await frame
    .locator('vite-error-overlay, [role="alert"], [data-testid="error"], [data-testid$="-error"]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          const style = element.ownerDocument.defaultView?.getComputedStyle(element);

          return (
            style !== undefined &&
            bounds.width > 0 &&
            bounds.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) !== 0
          );
        })
        .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    );

  const visibleErrors = [
    ...semanticErrorTexts,
    ...(VISIBLE_PREVIEW_ERROR_PATTERN.test(text) ? [text.slice(0, 500)] : []),
  ]
    .filter((value) => VISIBLE_PREVIEW_ERROR_PATTERN.test(value))
    .slice(0, 5);

  const screenshot = await iframe.screenshot({ animations: 'disabled', caret: 'hide', type: 'png' });
  const [metadata, stats] = await Promise.all([sharp(screenshot).metadata(), sharp(screenshot).stats()]);
  const imageSize = { height: metadata.height ?? 0, width: metadata.width ?? 0 };

  const nonBlank =
    screenshot.byteLength >= 6_000 && stats.entropy >= 0.15 && imageSize.width > 0 && imageSize.height > 0;

  if (!identityVisible || text.length < 80 || !nonBlank || horizontalOverflow > 1 || visibleErrors.length > 0) {
    throw new Error(
      `Native IDE Webview proof failed ` +
        `(identity=${identityVisible}, text=${text.length}, bytes=${screenshot.byteLength}, ` +
        `entropy=${stats.entropy.toFixed(3)}, overflow=${horizontalOverflow}, ` +
        `size=${imageSize.width}x${imageSize.height}, ` +
        `errors=${JSON.stringify(visibleErrors)})`,
    );
  }

  return {
    audit: {
      attached: true,
      entropy: stats.entropy,
      expectedIdentity,
      identityVisible: true,
      imageBytes: screenshot.byteLength,
      imageSha256: createHash('sha256').update(screenshot).digest('hex'),
      imageSize,
      horizontalOverflow,
      nonBlank: true,
      textLength: text.length,
      visible: true,
      visibleErrors: [],
    },
    screenshot,
  };
}

export async function compareProofImages(light: Buffer, dark: Buffer) {
  const [lightMetadata, darkMetadata] = await Promise.all([sharp(light).metadata(), sharp(dark).metadata()]);

  if (
    !lightMetadata.width ||
    !lightMetadata.height ||
    !darkMetadata.width ||
    !darkMetadata.height ||
    lightMetadata.width !== darkMetadata.width ||
    lightMetadata.height !== darkMetadata.height
  ) {
    throw new Error(
      `Proof images must have identical nonzero dimensions ` +
        `(light=${lightMetadata.width ?? 0}x${lightMetadata.height ?? 0}, ` +
        `dark=${darkMetadata.width ?? 0}x${darkMetadata.height ?? 0})`,
    );
  }

  const [lightPixels, darkPixels] = await Promise.all([
    sharp(light).resize({ fit: 'fill', height: 900, width: 1440 }).ensureAlpha().raw().toBuffer(),
    sharp(dark).resize({ fit: 'fill', height: 900, width: 1440 }).ensureAlpha().raw().toBuffer(),
  ]);

  let absoluteDifference = 0;
  let changedPixels = 0;

  const channels = 4;
  const pixelCount = SOLUTION_PROOF_CAPTURE_CANVAS.width * SOLUTION_PROOF_CAPTURE_CANVAS.height;

  for (let offset = 0; offset < lightPixels.byteLength; offset += channels) {
    let pixelDifference = 0;

    for (let channel = 0; channel < 3; channel += 1) {
      const difference = Math.abs(lightPixels[offset + channel] - darkPixels[offset + channel]);
      absoluteDifference += difference;
      pixelDifference += difference;
    }

    if (pixelDifference >= 24) {
      changedPixels += 1;
    }
  }

  return {
    changedPixelRatio: changedPixels / pixelCount,
    meanAbsoluteDifference: absoluteDifference / (pixelCount * 3),
  };
}
