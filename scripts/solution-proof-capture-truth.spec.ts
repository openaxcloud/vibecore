import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  auditNativeIdeWebview,
  compareProofImages,
  composeDirectRuntimeCapture,
  SOLUTION_PROOF_CAPTURE_CANVAS,
  SOLUTION_PROOF_DEVICE_VIEWPORTS,
} from './solution-proof-capture-truth.js';

const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

const themedCaptureSource = captureSource.slice(
  captureSource.indexOf('async function captureThemedIdeState'),
  captureSource.indexOf('\nasync function promoteVerifiedThemedAssets'),
);

describe('capture harness truth wiring', () => {
  it('limits app-only captures and never forces the direct runtime back to desktop', () => {
    expect(themedCaptureSource).toContain(
      "const directRuntimePreviewFilenames = new Set(['ide-webview-overview.png', 'ide-webview-iteration.png'])",
    );
    expect(themedCaptureSource).toContain('directPage.setViewportSize(directPreviewViewport(selectedDevice))');
    expect(themedCaptureSource).not.toContain("directPage.setViewportSize(directPreviewViewport('desktop'))");
  });

  it('themes and audits the real native iframe before every IDE-shell screenshot', () => {
    const shellStart = themedCaptureSource.indexOf('} else {\n      const nativeIframe');

    const shellBranch = themedCaptureSource.slice(
      shellStart,
      themedCaptureSource.indexOf('captureSurface =\n        surfaceState.mode', shellStart),
    );

    expect(shellBranch).toContain('applyOfficialRuntimeCaptureTheme(nativeFrame, theme');
    expect(shellBranch).toContain('auditNativeIdeWebview(page, options.scenario.expectedTerms[0])');
    expect(shellBranch.indexOf('applyOfficialRuntimeCaptureTheme(nativeFrame, theme')).toBeLessThan(
      shellBranch.indexOf('auditNativeIdeWebview(page, options.scenario.expectedTerms[0])'),
    );
    expect(shellBranch.indexOf('auditNativeIdeWebview(page, options.scenario.expectedTerms[0])')).toBeLessThan(
      shellBranch.indexOf('page.screenshot({'),
    );
  });
});

describe('official runtime responsive capture composition', () => {
  it.each(['desktop', 'tablet', 'mobile'] as const)(
    'captures %s at its native viewport before staging',
    async (device) => {
      const viewport = SOLUTION_PROOF_DEVICE_VIEWPORTS[device];

      const source = await sharp({
        create: { background: { b: 20, g: 100, r: 220 }, channels: 3, height: viewport.height, width: viewport.width },
      })
        .png()
        .toBuffer();

      const result = await composeDirectRuntimeCapture(source, device, 'light');
      const metadata = await sharp(result.png).metadata();

      expect(result.audit.capturedViewport).toEqual(viewport);
      expect(result.audit.sourceImage).toEqual(viewport);
      expect(metadata.width).toBe(SOLUTION_PROOF_CAPTURE_CANVAS.width);
      expect(metadata.height).toBe(SOLUTION_PROOF_CAPTURE_CANVAS.height);
      expect(result.audit.composed).toBe(device !== 'desktop');
      expect(result.audit.fit).toBe(device === 'desktop' ? 'native' : 'contain');

      if (device !== 'desktop') {
        const corner = await sharp(result.png).extract({ height: 1, left: 0, top: 0, width: 1 }).raw().toBuffer();

        expect([...corner.subarray(0, 3)]).toEqual([246, 248, 250]);
      }
    },
  );

  it('fails closed instead of labeling a desktop screenshot as mobile', async () => {
    const desktop = await sharp({
      create: { background: 'orange', channels: 3, height: 900, width: 1440 },
    })
      .png()
      .toBuffer();

    await expect(composeDirectRuntimeCapture(desktop, 'mobile', 'dark')).rejects.toThrow(
      'expected 390x844, received 1440x900',
    );
  });
});

describe.sequential('native IDE Webview proof audit', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('records the visible attached iframe pixels and expected identity', async () => {
    await page.setContent('<iframe data-testid="preview-iframe" style="width:900px;height:600px"></iframe>');

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());

    if (!frame) {
      throw new Error('Expected iframe');
    }

    await frame.setContent(`
      <style>body{margin:0;min-height:100vh;background:linear-gradient(135deg,#082f49,#f97316);color:white;font:24px sans-serif}</style>
      <main><h1>PeopleOps</h1><p>${'Real native Webview content '.repeat(20)}</p></main>
    `);

    const { audit } = await auditNativeIdeWebview(page, 'PeopleOps');

    expect(audit.attached).toBe(true);
    expect(audit.identityVisible).toBe(true);
    expect(audit.nonBlank).toBe(true);
    expect(audit.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(audit.imageSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('compares generated-app pixels independently from IDE chrome', async () => {
    const light = await sharp({
      create: { background: '#f8fafc', channels: 3, height: 120, width: 200 },
    })
      .png()
      .toBuffer();
    const dark = await sharp({
      create: { background: '#0f172a', channels: 3, height: 120, width: 200 },
    })
      .png()
      .toBuffer();

    const difference = await compareProofImages(light, dark);

    expect(difference.changedPixelRatio).toBe(1);
    expect(difference.meanAbsoluteDifference).toBeGreaterThan(2);
  });

  it('rejects mismatched native Webview dimensions before pixel comparison', async () => {
    const light = await sharp({ create: { background: 'white', channels: 3, height: 600, width: 900 } })
      .png()
      .toBuffer();
    const dark = await sharp({ create: { background: 'black', channels: 3, height: 600, width: 800 } })
      .png()
      .toBuffer();

    await expect(compareProofImages(light, dark)).rejects.toThrow(
      'Proof images must have identical nonzero dimensions (light=900x600, dark=800x600)',
    );
  });

  it('rejects a blank native iframe even when another direct page could be valid', async () => {
    await page.setContent('<iframe data-testid="preview-iframe" style="width:900px;height:600px"></iframe>');

    await expect(auditNativeIdeWebview(page, 'PeopleOps')).rejects.toThrow('Native IDE Webview proof failed');
  });

  it('rejects a visible runtime error from the native iframe', async () => {
    await page.setContent('<iframe data-testid="preview-iframe" style="width:900px;height:600px"></iframe>');

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());

    if (!frame) {
      throw new Error('Expected iframe');
    }

    await frame.setContent(`<main role="alert">Internal server error ${'PeopleOps '.repeat(30)}</main>`);

    await expect(auditNativeIdeWebview(page, 'PeopleOps')).rejects.toThrow('errors=');
  });
});
