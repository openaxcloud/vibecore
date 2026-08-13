import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  auditPromptBubbleViewport,
  auditNativeIdeWebview,
  compareInterSlotProofImages,
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

  it('allows only the exact contracted interaction role and accessible name', () => {
    const scenarioBranch = captureSource.slice(
      captureSource.indexOf('async function verifyScenarioPreview'),
      captureSource.indexOf('\nasync function verifyScenarioIdentity'),
    );

    expect(scenarioBranch).toContain(
      'getByRole(scenario.interaction.role, { name: scenario.interaction.name, exact: true })',
    );
    expect(scenarioBranch).toContain('exactTargetCount');
    expect(scenarioBranch).toContain('resultMatchCount');
    expect(scenarioBranch).toContain('stateChanged');
    expect(scenarioBranch).not.toContain('alternateRole');
    expect(scenarioBranch).not.toContain('WithDecoration');
  });

  it('compares all staged slot pixels before any public asset promotion', () => {
    const comparisonIndex = captureSource.indexOf('const interSlotDifferences: InterSlotDifferenceAudit[]');
    const promotionIndex = captureSource.indexOf('const promotedAssets = await promoteVerifiedThemedAssets');

    expect(comparisonIndex).toBeGreaterThan(0);
    expect(promotionIndex).toBeGreaterThan(comparisonIndex);
  });

  it('compares unpadded direct-runtime pixels rather than composed theme padding', () => {
    expect(themedCaptureSource).toContain('directRuntimeThemeScreenshots.set(theme, nativeScreenshot)');
    expect(themedCaptureSource).toContain('compareProofImages(lightDirectRuntime, darkDirectRuntime)');
    expect(themedCaptureSource.indexOf('directRuntimeThemeScreenshots.set(theme, nativeScreenshot)')).toBeLessThan(
      themedCaptureSource.indexOf('composeDirectRuntimeCapture(nativeScreenshot, selectedDevice, theme)'),
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

  it('rejects an identity that exists only below the native viewport', async () => {
    await page.setContent('<iframe data-testid="preview-iframe" style="width:900px;height:600px"></iframe>');

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());

    if (!frame) {
      throw new Error('Expected iframe');
    }

    await frame.setContent(`
      <style>body{margin:0;background:#123;color:white;font:24px sans-serif}.spacer{height:900px}</style>
      <main><div class="spacer">${'Visible application content '.repeat(20)}</div><h1>PeopleOps</h1></main>
    `);

    await expect(auditNativeIdeWebview(page, 'PeopleOps')).rejects.toThrow('identity=false');
  });

  it('does not treat generic error vocabulary in ordinary app copy as a runtime failure', async () => {
    await page.setContent('<iframe data-testid="preview-iframe" style="width:900px;height:600px"></iframe>');

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());

    if (!frame) {
      throw new Error('Expected iframe');
    }

    await frame.setContent(`
      <style>body{margin:0;min-height:100vh;background:linear-gradient(135deg,#164e63,#f97316);color:white;font:24px sans-serif}</style>
      <main><h1>PeopleOps</h1><p role="alert">Error budget healthy and erreur-handling guidance. ${'Local policy content '.repeat(20)}</p></main>
    `);

    await expect(auditNativeIdeWebview(page, 'PeopleOps')).resolves.toBeDefined();
  });

  it('rejects a visible Vite overlay whose diagnostic exists only in Shadow DOM', async () => {
    await page.setContent('<iframe data-testid="preview-iframe" style="width:900px;height:600px"></iframe>');

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());

    if (!frame) {
      throw new Error('Expected iframe');
    }

    await frame.setContent(`
      <style>body{margin:0;min-height:100vh;background:linear-gradient(135deg,#164e63,#f97316);color:white;font:24px sans-serif}</style>
      <main><h1>PeopleOps</h1><p>${'Local policy content '.repeat(20)}</p></main>
      <vite-error-overlay style="position:fixed;inset:0;display:block"></vite-error-overlay>
      <script>
        const overlay = document.querySelector('vite-error-overlay');
        overlay.attachShadow({mode:'open'}).innerHTML = '<div>Arbitrary shadow diagnostic</div>';
      </script>
    `);

    await expect(auditNativeIdeWebview(page, 'PeopleOps')).rejects.toThrow('Arbitrary shadow diagnostic');
  });
});

describe.sequential('Agent prompt viewport proof', () => {
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

  it('binds a substantially visible exact persisted bubble and identity Range', async () => {
    await page.setContent(`
      <main style="height:900px;overflow:auto">
        <article data-message-id="message-1" style="margin:120px;width:600px;padding:24px;background:#222;color:white;font:20px sans-serif">
          Build PeopleOps as a genuine local project with a working interaction and verified preview.
        </article>
      </main>
    `);

    const audit = await auditPromptBubbleViewport(
      page,
      page.locator('[data-message-id="message-1"]'),
      'PeopleOps',
      'message-1',
    );

    expect(audit.identityVisible).toBe(true);
    expect(audit.messageIdMatchesProvenance).toBe(true);
    expect(audit.viewport).toEqual({ height: 900, width: 1440 });
  });

  it('scrolls a long prompt until its exact identity is inside the captured viewport', async () => {
    await page.setContent(`
      <main data-testid="prompt-scrollport" style="height:300px;overflow:auto;margin:100px">
        <article data-message-id="message-1" style="width:600px;min-height:1000px;padding:24px;background:#222;color:white;font:20px sans-serif">
          <span>Visible prompt introduction.</span><span style="display:block;margin-top:700px">PeopleOps</span>
        </article>
      </main>
    `);

    expect(await page.getByTestId('prompt-scrollport').evaluate((element) => element.scrollTop)).toBe(0);

    const audit = await auditPromptBubbleViewport(
      page,
      page.locator('[data-message-id="message-1"]'),
      'PeopleOps',
      'message-1',
    );

    expect(audit.identityVisible).toBe(true);
    expect(await page.getByTestId('prompt-scrollport').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });

  it('rejects an identity that cannot be scrolled into the captured viewport', async () => {
    await page.setContent(`
      <article data-message-id="message-1" style="margin:100px;width:600px;height:160px;padding:24px;background:#222;color:white;font:20px sans-serif">
        <span>Visible prompt introduction with enough substantial bubble content for capture.</span>
        <span style="position:fixed;top:1800px;left:100px">PeopleOps</span>
      </article>
    `);

    await expect(
      auditPromptBubbleViewport(page, page.locator('[data-message-id="message-1"]'), 'PeopleOps', 'message-1'),
    ).rejects.toThrow('Agent prompt viewport proof failed');
  });

  it('rejects a message id that does not match persisted prompt provenance', async () => {
    await page.setContent(`
      <article data-message-id="message-2" style="margin:120px;width:600px;padding:24px;background:#222;color:white;font:20px sans-serif">
        Build PeopleOps as a genuine local project.
      </article>
    `);

    await expect(
      auditPromptBubbleViewport(page, page.locator('[data-message-id="message-2"]'), 'PeopleOps', 'message-1'),
    ).rejects.toThrow('Agent prompt viewport proof failed');
  });
});

describe('inter-slot visual differences', () => {
  it('emits all fifteen unordered pairs for one six-slot theme', async () => {
    const captures = await Promise.all(
      Array.from({ length: 6 }, async (_, index) => ({
        filename: `slot-${index}.png`,
        image: await sharp({
          create: {
            background: { b: index * 35, g: 220 - index * 25, r: 20 + index * 40 },
            channels: 3,
            height: 100,
            width: 160,
          },
        })
          .png()
          .toBuffer(),
      })),
    );

    const audits = await compareInterSlotProofImages('light', captures);

    expect(audits).toHaveLength(15);
    expect(new Set(audits.map(({ firstFilename, secondFilename }) => `${firstFilename}/${secondFilename}`)).size).toBe(
      15,
    );
  });

  it('fails closed when any two slots reuse effectively identical pixels', async () => {
    const distinct = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        sharp({
          create: { background: `rgb(${index * 45},${200 - index * 30},30)`, channels: 3, height: 100, width: 160 },
        })
          .png()
          .toBuffer(),
      ),
    );

    await expect(
      compareInterSlotProofImages('dark', [
        ...distinct.map((image, index) => ({ filename: `slot-${index}.png`, image })),
        { filename: 'slot-5.png', image: distinct[0] },
      ]),
    ).rejects.toThrow('are not visually distinct');
  });
});
