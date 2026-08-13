import { createHash } from 'node:crypto';

import { expect, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';

export type SolutionProofDevice = 'desktop' | 'tablet' | 'mobile';

export type SolutionProofInteractionContract = Readonly<{
  role: 'button' | 'link';
  name: string;
  expectedResult: string | RegExp;
}>;

export const SOLUTION_PROOF_INTERACTION_CONTRACTS = {
  'app-builder': {
    en: { role: 'link', name: 'Appointments', expectedResult: 'Upcoming appointments' },
    fr: { role: 'link', name: 'Rendez-vous', expectedResult: 'Prochains rendez-vous' },
  },
  'website-builder': {
    en: { role: 'link', name: 'Projects', expectedResult: 'Selected work' },
    fr: { role: 'link', name: 'Projets', expectedResult: 'Projets sélectionnés' },
  },
  'game-builder': {
    en: { role: 'button', name: 'Start quiz', expectedResult: /(?:question\s*1|1\s*\/\s*\d|what planet)/i },
    fr: {
      role: 'button',
      name: 'Démarrer le quiz',
      expectedResult: /(?:question\s*1|1\s*\/\s*\d|quelle planète)/i,
    },
  },
  'dashboard-builder': {
    en: { role: 'button', name: 'Apply filters', expectedResult: 'Filters applied' },
    fr: { role: 'button', name: 'Appliquer les filtres', expectedResult: 'Filtres appliqués' },
  },
  'chatbot-builder': {
    en: { role: 'button', name: 'How do I reset my password?', expectedResult: 'Account access' },
    fr: {
      role: 'button',
      name: 'Comment réinitialiser mon mot de passe ?',
      expectedResult: 'Accès au compte',
    },
  },
  'internal-ai-builder': {
    en: { role: 'button', name: 'Annual leave policy', expectedResult: 'HR-04' },
    fr: { role: 'button', name: 'Politique de congés annuels', expectedResult: 'RH-04' },
  },
  startups: {
    en: { role: 'button', name: 'Add experiment', expectedResult: 'New experiment' },
    fr: { role: 'button', name: 'Ajouter une expérience', expectedResult: 'Nouvelle expérience' },
  },
  freelancers: {
    en: { role: 'button', name: 'Review delivery', expectedResult: 'Approval requested' },
    fr: { role: 'button', name: 'Examiner le livrable', expectedResult: 'Validation demandée' },
  },
  enterprise: {
    en: { role: 'button', name: 'Export audit log', expectedResult: 'Export ready' },
    fr: { role: 'button', name: 'Exporter le journal', expectedResult: 'Export prêt' },
  },
} as const satisfies Record<string, Record<'en' | 'fr', SolutionProofInteractionContract>>;

export function serializedInteractionExpectedResult(contract: SolutionProofInteractionContract) {
  return typeof contract.expectedResult === 'string' ? contract.expectedResult : contract.expectedResult.source;
}

export const SOLUTION_PROOF_CAPTURE_CANVAS = { height: 900, width: 1440 } as const;

export const SOLUTION_PROOF_INTER_SLOT_THRESHOLDS = {
  changedPixelRatio: 0.02,
  meanAbsoluteDifference: 2,
} as const;

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

type AuditRect = { bottom: number; height: number; left: number; right: number; top: number; width: number };

export type PromptViewportAudit = {
  bubbleIntersectionArea: number;
  bubbleIntersectionRatio: number;
  bubbleMessageId: string;
  exactBubbleCount: 1;
  expectedIdentity: string;
  expectedMessageId: string;
  identityElementTag: string;
  identityExactText: string;
  identityRangeRect: AuditRect;
  identityVisibleRatio: number;
  identityVisibleRect: AuditRect;
  identityVisible: true;
  messageIdMatchesProvenance: true;
  substantialBubbleIntersection: true;
  viewport: { height: 900; width: 1440 };
};

type PromptViewportEvaluation = {
  bubbleIntersectionArea: number;
  bubbleIntersectionRatio: number;
  bubbleMessageId: string;
  exactBubbleCount: number;
  expectedIdentity: string;
  expectedMessageId: string;
  identityElementTag: string;
  identityExactText: string;
  identityRangeRect: AuditRect;
  identityUnoccluded: boolean;
  identityVisibleRatio: number;
  identityVisibleRect: AuditRect;
  messageIdMatchesProvenance: boolean;
  substantialBubbleIntersection: boolean;
  viewport: { height: number; width: number };
};

/**
 * Prove that the persisted Agent prompt itself, and not a substitute overlay,
 * has its project identity in the pixels about to be captured.
 */
export async function auditPromptBubbleViewport(
  page: Page,
  promptBubble: Locator,
  expectedIdentity: string,
  expectedMessageId: string,
): Promise<PromptViewportAudit> {
  const viewport = page.viewportSize();

  if (
    viewport?.width !== SOLUTION_PROOF_CAPTURE_CANVAS.width ||
    viewport.height !== SOLUTION_PROOF_CAPTURE_CANVAS.height
  ) {
    throw new Error(
      `Agent prompt viewport proof requires 1440x900, received ${viewport?.width ?? 0}x${viewport?.height ?? 0}`,
    );
  }

  await expect(promptBubble, 'The exact persisted Agent prompt bubble must remain visible').toBeVisible();
  await promptBubble.scrollIntoViewIfNeeded();

  /*
   * Keep browser-side code as an autonomous JavaScript expression. The real
   * capture command runs this module through tsx/esbuild, whose function-name
   * transform can otherwise inject a Node-only `__name` helper into callbacks
   * serialized by Playwright. A source expression reaches Chromium unchanged.
   */
  const expected = JSON.stringify({ identity: expectedIdentity, messageId: expectedMessageId });

  let audit: PromptViewportEvaluation;

  try {
    audit = await page.evaluate<PromptViewportEvaluation>(String.raw`(async () => {
    const expected = ${expected};
    const matchingBubbles = Array.from(document.querySelectorAll('[data-message-id]')).filter(
      (candidate) => candidate.getAttribute('data-message-id') === expected.messageId,
    );
    const bubble = matchingBubbles[0];

    if (!bubble) {
      throw new Error('The persisted Agent prompt bubble is absent from the captured document');
    }

    const rectObject = (rect) => ({
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    });
    const intersect = (left, right) => {
      const intersectionLeft = Math.max(left.left, right.left);
      const intersectionTop = Math.max(left.top, right.top);
      const intersectionRight = Math.min(left.right, right.right);
      const intersectionBottom = Math.min(left.bottom, right.bottom);
      const width = Math.max(0, intersectionRight - intersectionLeft);
      const height = Math.max(0, intersectionBottom - intersectionTop);

      return {
        bottom: intersectionTop + height,
        height,
        left: intersectionLeft,
        right: intersectionLeft + width,
        top: intersectionTop,
        width,
      };
    };
    const viewportRect = {
      bottom: window.innerHeight,
      height: window.innerHeight,
      left: 0,
      right: window.innerWidth,
      top: 0,
      width: window.innerWidth,
    };
    const isRendered = (element) => {
      const style = window.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();

      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        bounds.width > 0 &&
        bounds.height > 0
      );
    };
    const clipToVisibleAncestors = (candidate, element) => {
      let clipped = intersect(candidate, viewportRect);

      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        if (!isRendered(ancestor)) {
          return { ...clipped, bottom: clipped.top, height: 0, right: clipped.left, width: 0 };
        }

        const style = window.getComputedStyle(ancestor);
        const ancestorRect = rectObject(ancestor.getBoundingClientRect());
        const clipX = style.overflowX !== 'visible';
        const clipY = style.overflowY !== 'visible';

        if (clipX || clipY) {
          clipped = intersect(clipped, {
            bottom: clipY ? ancestorRect.bottom : viewportRect.bottom,
            height: clipY ? ancestorRect.height : viewportRect.height,
            left: clipX ? ancestorRect.left : viewportRect.left,
            right: clipX ? ancestorRect.right : viewportRect.right,
            top: clipY ? ancestorRect.top : viewportRect.top,
            width: clipX ? ancestorRect.width : viewportRect.width,
          });
        }
      }

      return clipped;
    };

    const messageId = bubble.getAttribute('data-message-id') || '';
    const exactBubbles = matchingBubbles.filter((candidate) => isRendered(candidate));
    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      textNodes.push(node);
    }

    const completeText = textNodes.map((node) => node.nodeValue || '').join('');
    const identityStart = completeText.indexOf(expected.identity);

    if (identityStart < 0) {
      throw new Error('The persisted Agent prompt does not contain its exact identity text');
    }

    const identityEnd = identityStart + expected.identity.length;
    let runningOffset = 0;
    let startNode;
    let startOffset = 0;
    let endNode;
    let endOffset = 0;

    for (const node of textNodes) {
      const value = node.nodeValue || '';
      const nextOffset = runningOffset + value.length;

      if (!startNode && identityStart >= runningOffset && identityStart < nextOffset) {
        startNode = node;
        startOffset = identityStart - runningOffset;
      }

      if (identityEnd > runningOffset && identityEnd <= nextOffset) {
        endNode = node;
        endOffset = identityEnd - runningOffset;
        break;
      }

      runningOffset = nextOffset;
    }

    if (!startNode || !endNode) {
      throw new Error('The exact identity text cannot be represented by a DOM Range');
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const identityText = range.toString();
    const identityElement = startNode.parentElement;

    if (!identityElement) {
      throw new Error('The exact identity text is detached from its rendered element');
    }

    identityElement.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const bubbleRect = rectObject(bubble.getBoundingClientRect());
    const bubbleIntersection = clipToVisibleAncestors(bubbleRect, bubble.parentElement);
    const bubbleArea = Math.max(1, bubbleRect.width * bubbleRect.height);
    const bubbleIntersectionArea = bubbleIntersection.width * bubbleIntersection.height;
    const bubbleIntersectionRatio = bubbleIntersectionArea / bubbleArea;
    const rangeRects = Array.from(range.getClientRects())
      .map(rectObject)
      .filter((rect) => rect.width > 0 && rect.height > 0);

    if (rangeRects.length === 0) {
      throw new Error('The exact identity text has no rendered DOM Range');
    }

    const visibleCandidates = rangeRects
      .map((rangeRect) => ({
        rangeRect,
        visibleRect: clipToVisibleAncestors(rangeRect, identityElement),
      }))
      .sort(
        (left, right) =>
          right.visibleRect.width * right.visibleRect.height - left.visibleRect.width * left.visibleRect.height,
      );
    const identityCandidate = visibleCandidates[0];

    if (!identityCandidate) {
      throw new Error('The exact identity text has no visible Range candidate');
    }

    const identityArea = Math.max(1, identityCandidate.rangeRect.width * identityCandidate.rangeRect.height);
    const identityVisibleArea = identityCandidate.visibleRect.width * identityCandidate.visibleRect.height;
    const identityVisibleRatio = identityVisibleArea / identityArea;
    const centreX = identityCandidate.visibleRect.left + identityCandidate.visibleRect.width / 2;
    const centreY = identityCandidate.visibleRect.top + identityCandidate.visibleRect.height / 2;
    const topElement = document.elementFromPoint(centreX, centreY);
    const identityUnoccluded = Boolean(topElement && (topElement === bubble || bubble.contains(topElement)));

    return {
      bubbleIntersectionArea,
      bubbleIntersectionRatio,
      bubbleMessageId: messageId,
      exactBubbleCount: exactBubbles.length,
      expectedIdentity: expected.identity,
      expectedMessageId: expected.messageId,
      identityElementTag: identityElement ? identityElement.tagName.toLocaleLowerCase() : '',
      identityExactText: identityText,
      identityRangeRect: identityCandidate.rangeRect,
      identityUnoccluded,
      identityVisibleRatio,
      identityVisibleRect: identityCandidate.visibleRect,
      messageIdMatchesProvenance: messageId === expected.messageId,
      substantialBubbleIntersection:
        bubbleIntersection.width >= 160 && bubbleIntersection.height >= 48 && bubbleIntersectionArea >= 8000,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
    })()`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(`Agent prompt viewport proof failed: ${detail}`, { cause: error });
  }

  const identityVisible =
    audit.identityExactText === expectedIdentity &&
    audit.identityUnoccluded &&
    audit.identityVisibleRect.width > 0 &&
    audit.identityVisibleRect.height > 0 &&
    audit.identityVisibleRatio >= 0.8;

  if (
    audit.viewport.width !== SOLUTION_PROOF_CAPTURE_CANVAS.width ||
    audit.viewport.height !== SOLUTION_PROOF_CAPTURE_CANVAS.height ||
    audit.exactBubbleCount !== 1 ||
    !audit.messageIdMatchesProvenance ||
    !audit.substantialBubbleIntersection ||
    !identityVisible
  ) {
    throw new Error(`Agent prompt viewport proof failed: ${JSON.stringify(audit)}`);
  }

  return {
    bubbleIntersectionArea: audit.bubbleIntersectionArea,
    bubbleIntersectionRatio: audit.bubbleIntersectionRatio,
    bubbleMessageId: audit.bubbleMessageId,
    exactBubbleCount: 1,
    expectedIdentity: audit.expectedIdentity,
    expectedMessageId: audit.expectedMessageId,
    identityElementTag: audit.identityElementTag,
    identityExactText: audit.identityExactText,
    identityRangeRect: audit.identityRangeRect,
    identityVisibleRatio: audit.identityVisibleRatio,
    identityVisibleRect: audit.identityVisibleRect,
    identityVisible: true,
    messageIdMatchesProvenance: true,
    substantialBubbleIntersection: true,
    viewport: { height: 900, width: 1440 },
  };
}

const VISIBLE_PREVIEW_RUNTIME_SIGNATURE_PATTERN =
  /internal server error|vite error|something went wrong|failed to resolve import|cannot find module|unexpected token|uncaught typeerror|plugin:vite|preview_upstream_unreachable|not reachable|starting, or it crashed|un problème|impossible de résoudre|a planté/i;

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

  const [text, horizontalOverflow, identityVisible] = await Promise.all([
    body.innerText().then((value) => value.replace(/\s+/g, ' ').trim()),
    body.evaluate((previewBody) => {
      const root = previewBody.ownerDocument.documentElement;

      return Math.max(0, root.scrollWidth - root.clientWidth, previewBody.scrollWidth - previewBody.clientWidth);
    }),
    body.evaluate((previewBody, identity) => {
      const document = previewBody.ownerDocument;
      const window = document.defaultView;

      if (!window) {
        return false;
      }

      const walker = document.createTreeWalker(previewBody, 4);
      const textNodes: Array<NonNullable<ReturnType<typeof walker.nextNode>>> = [];

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        textNodes.push(node);
      }

      const normalizedIdentity = identity.toLocaleLowerCase();

      return textNodes.some((node) => {
        const value = node.nodeValue ?? '';
        const start = value.toLocaleLowerCase().indexOf(normalizedIdentity);
        const parent = node.parentElement;

        if (start < 0 || !parent) {
          return false;
        }

        const style = window.getComputedStyle(parent);

        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false;
        }

        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + identity.length);

        return [...range.getClientRects()].some((rect) => {
          const left = Math.max(0, rect.left);
          const top = Math.max(0, rect.top);
          const right = Math.min(window.innerWidth, rect.right);
          const bottom = Math.min(window.innerHeight, rect.bottom);

          if (right <= left || bottom <= top) {
            return false;
          }

          const topElement = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);

          return Boolean(topElement && (topElement === parent || parent.contains(topElement)));
        });
      });
    }, expectedIdentity),
  ]);

  const semanticErrors = await frame
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
        .map((element) => {
          const shadowText = element.shadowRoot?.textContent ?? '';
          const visibleText = `${element.textContent ?? ''} ${shadowText}`.replace(/\s+/g, ' ').trim();

          return {
            isViteOverlay: element.tagName.toLocaleLowerCase() === 'vite-error-overlay',
            text: visibleText || `<${element.tagName.toLocaleLowerCase()} visible>`,
          };
        }),
    );

  const visibleErrors = [
    ...semanticErrors
      .filter(
        ({ isViteOverlay, text: value }) => isViteOverlay || VISIBLE_PREVIEW_RUNTIME_SIGNATURE_PATTERN.test(value),
      )
      .map(({ text: value }) => value),
    ...(VISIBLE_PREVIEW_RUNTIME_SIGNATURE_PATTERN.test(text) ? [text.slice(0, 500)] : []),
  ].slice(0, 5);

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

export type InterSlotDifferenceAudit = {
  changedPixelRatio: number;
  firstFilename: string;
  meanAbsoluteDifference: number;
  secondFilename: string;
  theme: 'light' | 'dark';
};

export function solutionProofInterSlotPairs(filenames: readonly string[]) {
  if (filenames.length !== 6 || new Set(filenames).size !== 6) {
    throw new Error(`Inter-slot proof requires exactly six unique capture filenames, received ${filenames.length}`);
  }

  return filenames.flatMap((firstFilename, firstIndex) =>
    filenames.slice(firstIndex + 1).map((secondFilename) => ({ firstFilename, secondFilename })),
  );
}

export async function compareInterSlotProofImages(
  theme: 'light' | 'dark',
  captures: readonly { filename: string; image: Buffer }[],
): Promise<InterSlotDifferenceAudit[]> {
  const capturesByFilename = new Map(captures.map((capture) => [capture.filename, capture.image]));
  const pairs = solutionProofInterSlotPairs(captures.map(({ filename }) => filename));
  const audits: InterSlotDifferenceAudit[] = [];

  for (const pair of pairs) {
    const first = capturesByFilename.get(pair.firstFilename);
    const second = capturesByFilename.get(pair.secondFilename);

    if (!first || !second) {
      throw new Error(
        `Missing staged pixels for ${theme} inter-slot pair ${pair.firstFilename}/${pair.secondFilename}`,
      );
    }

    const difference = await compareProofImages(first, second);

    if (
      difference.changedPixelRatio < SOLUTION_PROOF_INTER_SLOT_THRESHOLDS.changedPixelRatio ||
      difference.meanAbsoluteDifference < SOLUTION_PROOF_INTER_SLOT_THRESHOLDS.meanAbsoluteDifference
    ) {
      throw new Error(
        `${theme} proof slots ${pair.firstFilename} and ${pair.secondFilename} are not visually distinct ` +
          `(changed pixels=${difference.changedPixelRatio.toFixed(4)}, ` +
          `mean difference=${difference.meanAbsoluteDifference.toFixed(3)})`,
      );
    }

    audits.push({ ...pair, ...difference, theme });
  }

  if (audits.length !== 15) {
    throw new Error(`Expected 15 ${theme} inter-slot pixel comparisons, received ${audits.length}`);
  }

  return audits;
}
