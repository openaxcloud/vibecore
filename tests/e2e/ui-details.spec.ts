import { expect, test, type Page } from '@playwright/test';

async function injectUiDetailsFixture(page: Page) {
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.setAttribute('data-testid', 'ui-details-fixture');
    fixture.innerHTML = `
      <button data-testid="ui-details-button">Button</button>
      <button class="vc-button-solid" data-testid="ui-button-solid">Solid</button>
      <button data-testid="ui-button-hover">Hover</button>
      <button data-testid="ui-button-active">Active</button>
      <button disabled data-testid="ui-button-disabled">Disabled</button>
      <button data-loading="true" data-testid="ui-button-loading" style="width: 28px; height: 28px;">
        <svg class="lucide" data-testid="ui-button-loading-icon" viewBox="0 0 24 24"><path d="M4 12h16" /></svg>
      </button>
      <button aria-label="Icon settings" data-testid="ui-icon-only-button">
        <svg class="lucide" viewBox="0 0 24 24"><path d="M4 12h16" /></svg>
      </button>
      <button class="vc-run-button" data-run-state="running" data-testid="ui-run-button">Stop</button>
      <div role="button" tabindex="0" data-testid="ui-role-button">Role button</div>
      <input data-testid="ui-details-input" value="Input" />
      <div class="card" data-testid="ui-details-card">Card</div>
      <div class="vc-animated-tab" role="tab" data-testid="ui-tab-open">Open tab</div>
      <div class="vc-animated-tab" role="tab" data-closing="true" data-testid="ui-tab-closing">Closing tab</div>
      <div role="dialog" data-testid="ui-details-modal">Modal</div>
      <div class="popover" data-testid="ui-details-popover">Popover</div>
      <div class="overlay" data-testid="ui-details-overlay">Overlay</div>
      <div class="vc-split-panel" data-testid="ui-split-panel" style="flex-basis: 50%;"></div>
      <div class="vc-drop-zone" data-testid="ui-drop-zone"></div>
      <div class="vc-typing-indicator" data-testid="ui-typing-indicator">
        <span></span><span></span><span></span>
      </div>
      <div class="vc-sr-only" data-testid="ui-sr-only">Screen reader only text</div>
      <div role="status" aria-live="polite" data-testid="ui-live-region">Accessible live update</div>
      <div data-testid="ui-contrast-primary" style="color: #F5F9FC; background: #0A0F1C;">Primary contrast</div>
      <div data-testid="ui-contrast-secondary" style="color: #C2C8CC; background: #0A0F1C;">Secondary contrast</div>
      <div role="tooltip" data-testid="ui-details-tooltip">Tooltip</div>
      <svg class="tooltip-arrow" data-testid="ui-details-tooltip-arrow" viewBox="0 0 10 5"><path d="M0 0h10L5 5Z" /></svg>
      <svg class="lucide" data-testid="ui-details-icon" viewBox="0 0 24 24" stroke-width="2"><path d="M4 12h16" /></svg>
      <div data-testid="ui-details-scroll" style="width: 120px; height: 80px; overflow: auto;">
        <div style="width: 240px; height: 180px;"></div>
      </div>
    `;
    document.body.appendChild(fixture);
  });
}

async function readUiDetails(page: Page) {
  return page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const get = (selector: string, pseudo?: string) => window.getComputedStyle(document.querySelector(selector)!, pseudo);
    const root = window.getComputedStyle(document.documentElement);
    const button = get('[data-testid="ui-details-button"]');
    const input = get('[data-testid="ui-details-input"]');
    const card = get('[data-testid="ui-details-card"]');
    const modal = get('[data-testid="ui-details-modal"]');
    const popover = get('[data-testid="ui-details-popover"]');
    const overlay = get('[data-testid="ui-details-overlay"]');
    const tooltip = get('[data-testid="ui-details-tooltip"]');
    const tooltipArrow = get('[data-testid="ui-details-tooltip-arrow"]');
    const icon = get('[data-testid="ui-details-icon"]');
    const scrollbar = get('[data-testid="ui-details-scroll"]', '::-webkit-scrollbar');
    const scrollbarThumb = get('[data-testid="ui-details-scroll"]', '::-webkit-scrollbar-thumb');

    return {
      radiusButton: root.getPropertyValue('--vc-ui-radius-button').trim(),
      radiusInput: root.getPropertyValue('--vc-ui-radius-input').trim(),
      radiusCard: root.getPropertyValue('--vc-ui-radius-card').trim(),
      radiusModal: root.getPropertyValue('--vc-ui-radius-modal').trim(),
      radiusPopover: root.getPropertyValue('--vc-ui-radius-popover').trim(),
      shadowSm: root.getPropertyValue('--vc-ui-shadow-sm').trim(),
      shadowMd: root.getPropertyValue('--vc-ui-shadow-md').trim(),
      shadowLg: root.getPropertyValue('--vc-ui-shadow-lg').trim(),
      shadowXl: root.getPropertyValue('--vc-ui-shadow-xl').trim(),
      transitionHover: root.getPropertyValue('--vc-ui-transition-hover').trim(),
      transitionPanel: root.getPropertyValue('--vc-ui-transition-panel').trim(),
      transitionPopover: root.getPropertyValue('--vc-ui-transition-popover').trim(),
      focusRing: root.getPropertyValue('--vc-ui-focus-ring').trim().toLowerCase(),
      tooltipBg: root.getPropertyValue('--vc-ui-tooltip-bg').trim().toLowerCase(),
      tooltipBorder: root.getPropertyValue('--vc-ui-tooltip-border').trim().toLowerCase(),
      tooltipDelay: root.getPropertyValue('--vc-ui-tooltip-delay').trim(),
      scrollbarSize: root.getPropertyValue('--vc-ui-scrollbar-size').trim(),
      buttonBgToken: root.getPropertyValue('--vc-button-bg').trim(),
      buttonSolidBgToken: root.getPropertyValue('--vc-button-solid-bg').trim().toLowerCase(),
      buttonHoverBgToken: root.getPropertyValue('--vc-button-hover-bg').trim().toLowerCase(),
      buttonActiveBgToken: root.getPropertyValue('--vc-button-active-bg').trim().toLowerCase(),
      buttonDisabledOpacityToken: root.getPropertyValue('--vc-button-disabled-opacity').trim(),
      buttonLoadingSpinnerSizeToken: root.getPropertyValue('--vc-button-loading-spinner-size').trim(),
      buttonRadius: button.borderRadius,
      buttonTransitionDuration: button.transitionDuration,
      buttonTransitionTiming: button.transitionTimingFunction,
      inputRadius: input.borderRadius,
      cardRadius: card.borderRadius,
      cardShadow: card.boxShadow,
      modalRadius: modal.borderRadius,
      modalShadow: modal.boxShadow,
      popoverRadius: popover.borderRadius,
      popoverShadow: popover.boxShadow,
      popoverTransitionDuration: popover.transitionDuration,
      overlayBackdrop: overlay.backdropFilter || overlay.getPropertyValue('-webkit-backdrop-filter'),
      overlayBackground: overlay.backgroundColor,
      tooltipBackground: tooltip.backgroundColor,
      tooltipBorderColor: tooltip.borderColor,
      tooltipFontSize: tooltip.fontSize,
      tooltipArrowFill: tooltipArrow.fill,
      iconWidth: icon.width,
      iconHeight: icon.height,
      iconStrokeWidth: icon.strokeWidth,
      scrollbarWidth: scrollbar.width,
      scrollbarHeight: scrollbar.height,
      scrollbarThumbBackground: scrollbarThumb.backgroundColor,
    };
  });
}

function contrastRatio(foreground: string, background: string) {
  const parse = (value: string) => {
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

    if (!match) {
      throw new Error(`Unsupported color: ${value}`);
    }

    return [Number(match[1]), Number(match[2]), Number(match[3])].map((channel) => {
      const normalized = channel / 255;

      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (value: string) => {
    const [r, g, b] = parse(value);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

async function expectAccessibilityDetails(page: Page) {
  const details = await page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const iconButton = document.querySelector('[data-testid="ui-icon-only-button"]')!;
    const liveRegion = document.querySelector('[data-testid="ui-live-region"]')!;
    const srOnly = window.getComputedStyle(document.querySelector('[data-testid="ui-sr-only"]')!);
    const primaryContrast = window.getComputedStyle(document.querySelector('[data-testid="ui-contrast-primary"]')!);
    const secondaryContrast = window.getComputedStyle(document.querySelector('[data-testid="ui-contrast-secondary"]')!);

    return {
      focusWidth: root.getPropertyValue('--vc-accessibility-focus-width').trim(),
      reducedMotionDuration: root.getPropertyValue('--vc-accessibility-reduced-motion-duration').trim(),
      contrastText: root.getPropertyValue('--vc-accessibility-contrast-text').trim().toLowerCase(),
      contrastMuted: root.getPropertyValue('--vc-accessibility-contrast-muted').trim().toLowerCase(),
      iconButtonLabel: iconButton.getAttribute('aria-label'),
      liveRegionRole: liveRegion.getAttribute('role'),
      liveRegionMode: liveRegion.getAttribute('aria-live'),
      srOnlyPosition: srOnly.position,
      srOnlyWidth: srOnly.width,
      srOnlyHeight: srOnly.height,
      srOnlyClipPath: srOnly.clipPath,
      primaryColor: primaryContrast.color,
      primaryBackground: primaryContrast.backgroundColor,
      secondaryColor: secondaryContrast.color,
      secondaryBackground: secondaryContrast.backgroundColor,
    };
  });

  expect(details.focusWidth).toBe('2px');
  expect(details.reducedMotionDuration).toBe('50ms');
  expect(details.contrastText).toBe('#f5f9fc');
  expect(details.contrastMuted).toBe('#c2c8cc');
  expect(details.iconButtonLabel).toBe('Icon settings');
  expect(details.liveRegionRole).toBe('status');
  expect(details.liveRegionMode).toBe('polite');
  expect(details.srOnlyPosition).toBe('absolute');
  expect(details.srOnlyWidth).toBe('1px');
  expect(details.srOnlyHeight).toBe('1px');
  expect(details.srOnlyClipPath).toContain('inset(50');
  expect(contrastRatio(details.primaryColor, details.primaryBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(details.secondaryColor, details.secondaryBackground)).toBeGreaterThanOrEqual(4.5);

  const roleButton = page.getByTestId('ui-role-button');
  for (let index = 0; index < 120; index += 1) {
    const isFocused = await roleButton.evaluate((node) => node === document.activeElement);

    if (isFocused) {
      break;
    }

    await page.keyboard.press('Tab');
  }

  await expect(roleButton).toBeFocused();
  await expect(roleButton).toHaveCSS('outline-width', '2px');
  await expect(roleButton).toHaveCSS('outline-color', 'rgb(0, 153, 255)');
}

async function expectReducedMotionDetails(page: Page) {
  const details = await page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const tabOpen = window.getComputedStyle(document.querySelector('[data-testid="ui-tab-open"]')!);
    const popover = window.getComputedStyle(document.querySelector('[data-testid="ui-details-popover"]')!);
    const button = window.getComputedStyle(document.querySelector('[data-testid="ui-details-button"]')!);

    return {
      tabAnimationDuration: tabOpen.animationDuration,
      popoverAnimationDuration: popover.animationDuration,
      buttonTransitionDuration: button.transitionDuration,
    };
  });

  expect(details.tabAnimationDuration).toBe('0.05s');
  expect(details.popoverAnimationDuration).toBe('0.05s');
  expect(details.buttonTransitionDuration).toContain('0.05s');
}

async function expectAnimationDetails(page: Page) {
  const details = await page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const tabOpen = window.getComputedStyle(document.querySelector('[data-testid="ui-tab-open"]')!);
    const tabClosing = window.getComputedStyle(document.querySelector('[data-testid="ui-tab-closing"]')!);
    const popover = window.getComputedStyle(document.querySelector('[data-testid="ui-details-popover"]')!);
    const modal = window.getComputedStyle(document.querySelector('[data-testid="ui-details-modal"]')!);
    const overlay = window.getComputedStyle(document.querySelector('[data-testid="ui-details-overlay"]')!);
    const splitPanel = window.getComputedStyle(document.querySelector('[data-testid="ui-split-panel"]')!);
    const dropZone = window.getComputedStyle(document.querySelector('[data-testid="ui-drop-zone"]')!);
    const typingDot = window.getComputedStyle(document.querySelector('[data-testid="ui-typing-indicator"] span')!);
    const runButton = window.getComputedStyle(document.querySelector('[data-testid="ui-run-button"]')!);
    const runButtonBefore = window.getComputedStyle(document.querySelector('[data-testid="ui-run-button"]')!, '::before');

    return {
      tokenTabOpen: root.getPropertyValue('--vc-animation-tab-open').trim(),
      tokenTabClose: root.getPropertyValue('--vc-animation-tab-close').trim(),
      tokenPopover: root.getPropertyValue('--vc-animation-popover').trim(),
      tokenModal: root.getPropertyValue('--vc-animation-modal').trim(),
      tokenSplit: root.getPropertyValue('--vc-animation-split-panel').trim(),
      tokenDropZone: root.getPropertyValue('--vc-animation-drop-zone').trim(),
      tokenTyping: root.getPropertyValue('--vc-animation-typing').trim(),
      tokenRunStop: root.getPropertyValue('--vc-run-stop-bg').trim().toLowerCase(),
      tabOpenAnimationName: tabOpen.animationName,
      tabOpenAnimationDuration: tabOpen.animationDuration,
      tabClosingAnimationName: tabClosing.animationName,
      tabClosingAnimationDuration: tabClosing.animationDuration,
      popoverAnimationName: popover.animationName,
      popoverAnimationDuration: popover.animationDuration,
      modalAnimationName: modal.animationName,
      modalAnimationDuration: modal.animationDuration,
      overlayAnimationName: overlay.animationName,
      overlayAnimationDuration: overlay.animationDuration,
      splitTransitionDuration: splitPanel.transitionDuration,
      splitTransitionProperty: splitPanel.transitionProperty,
      dropZoneAnimationName: dropZone.animationName,
      dropZoneAnimationDuration: dropZone.animationDuration,
      typingAnimationName: typingDot.animationName,
      typingAnimationDuration: typingDot.animationDuration,
      runButtonBackground: runButton.backgroundColor,
      runButtonColor: runButton.color,
      runButtonBeforeContent: runButtonBefore.content,
      runButtonBeforeWidth: runButtonBefore.width,
      runButtonBeforeAnimationName: runButtonBefore.animationName,
    };
  });

  expect(details.tokenTabOpen).toBe('200ms');
  expect(details.tokenTabClose).toBe('150ms');
  expect(details.tokenPopover).toBe('150ms');
  expect(details.tokenModal).toBe('200ms');
  expect(details.tokenSplit).toBe('250ms ease-out');
  expect(details.tokenDropZone).toBe('100ms');
  expect(details.tokenTyping).toBe('1.4s');
  expect(details.tokenRunStop).toBe('#f85149');
  expect(details.tabOpenAnimationName).toBe('vc-tab-slide-in');
  expect(details.tabOpenAnimationDuration).toBe('0.2s');
  expect(details.tabClosingAnimationName).toBe('vc-tab-fade-out');
  expect(details.tabClosingAnimationDuration).toBe('0.15s');
  expect(details.popoverAnimationName).toBe('vc-popover-in');
  expect(details.popoverAnimationDuration).toBe('0.15s');
  expect(details.modalAnimationName).toBe('vc-modal-in');
  expect(details.modalAnimationDuration).toBe('0.2s');
  expect(details.overlayAnimationName).toBe('vc-modal-backdrop-in');
  expect(details.overlayAnimationDuration).toBe('0.2s');
  expect(details.splitTransitionProperty).toContain('flex-basis');
  expect(details.splitTransitionDuration).toContain('0.25s');
  expect(details.dropZoneAnimationName).toBe('vc-drop-zone-in');
  expect(details.dropZoneAnimationDuration).toBe('0.1s');
  expect(details.typingAnimationName).toBe('vc-typing-dot');
  expect(details.typingAnimationDuration).toBe('1.4s');
  expect(details.runButtonBackground).toBe('rgb(248, 81, 73)');
  expect(details.runButtonColor).toBe('rgb(255, 255, 255)');
  expect(details.runButtonBeforeContent).toBe('""');
  expect(details.runButtonBeforeWidth).toBe('14px');
  expect(details.runButtonBeforeAnimationName).toBe('vc-button-spinner');
}

async function expectButtonStates(page: Page) {
  const details = await page.locator('[data-testid="ui-details-fixture"]').evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const plain = window.getComputedStyle(document.querySelector('[data-testid="ui-details-button"]')!);
    const solid = window.getComputedStyle(document.querySelector('[data-testid="ui-button-solid"]')!);
    const disabled = window.getComputedStyle(document.querySelector('[data-testid="ui-button-disabled"]')!);
    const loading = window.getComputedStyle(document.querySelector('[data-testid="ui-button-loading"]')!);
    const loadingBefore = window.getComputedStyle(document.querySelector('[data-testid="ui-button-loading"]')!, '::before');
    const loadingIcon = window.getComputedStyle(document.querySelector('[data-testid="ui-button-loading-icon"]')!);

    return {
      tokenDefault: root.getPropertyValue('--vc-button-bg').trim(),
      tokenSolid: root.getPropertyValue('--vc-button-solid-bg').trim().toLowerCase(),
      tokenHover: root.getPropertyValue('--vc-button-hover-bg').trim().toLowerCase(),
      tokenActive: root.getPropertyValue('--vc-button-active-bg').trim().toLowerCase(),
      tokenDisabledOpacity: root.getPropertyValue('--vc-button-disabled-opacity').trim(),
      tokenSpinnerSize: root.getPropertyValue('--vc-button-loading-spinner-size').trim(),
      plainBackground: plain.backgroundColor,
      solidBackground: solid.backgroundColor,
      disabledOpacity: disabled.opacity,
      disabledCursor: disabled.cursor,
      loadingCursor: loading.cursor,
      loadingBeforeContent: loadingBefore.content,
      loadingBeforeWidth: loadingBefore.width,
      loadingBeforeHeight: loadingBefore.height,
      loadingBeforeBorderRadius: loadingBefore.borderRadius,
      loadingBeforeAnimationName: loadingBefore.animationName,
      loadingIconOpacity: loadingIcon.opacity,
    };
  });

  expect(details.tokenDefault).toBe('transparent');
  expect(details.tokenSolid).toBe('#1a2030');
  expect(details.tokenHover).toBe('#2b3245');
  expect(details.tokenActive).toBe('#3b4358');
  expect(details.tokenDisabledOpacity).toBe('0.4');
  expect(details.tokenSpinnerSize).toBe('14px');
  expect(details.plainBackground).toBe('rgba(0, 0, 0, 0)');
  expect(details.solidBackground).toBe('rgb(26, 32, 48)');
  expect(details.disabledOpacity).toBe('0.4');
  expect(details.disabledCursor).toBe('not-allowed');
  expect(details.loadingCursor).toBe('progress');
  expect(details.loadingBeforeContent).toBe('""');
  expect(details.loadingBeforeWidth).toBe('14px');
  expect(details.loadingBeforeHeight).toBe('14px');
  expect(details.loadingBeforeBorderRadius).toBe('9999px');
  expect(details.loadingBeforeAnimationName).toBe('vc-button-spinner');
  expect(details.loadingIconOpacity).toBe('0');

  await page.getByTestId('ui-button-hover').hover();
  await expect(page.getByTestId('ui-button-hover')).toHaveCSS('background-color', 'rgb(43, 50, 69)');

  const activeButton = page.getByTestId('ui-button-active');
  const box = await activeButton.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect(activeButton).toHaveCSS('background-color', 'rgb(59, 67, 88)');
  await page.mouse.up();
}

function expectUiDetails(details: Awaited<ReturnType<typeof readUiDetails>>) {
  expect(details.radiusButton).toBe('4px');
  expect(details.radiusInput).toBe('6px');
  expect(details.radiusCard).toBe('6px');
  expect(details.radiusModal).toBe('8px');
  expect(details.radiusPopover).toBe('12px');
  expect(details.shadowSm).toBe('0 1px 2px rgb(0 4 20 / 0.4)');
  expect(details.shadowMd).toBe('0 4px 12px rgb(0 4 20 / 0.5)');
  expect(details.shadowLg).toBe('0 12px 32px rgb(0 4 20 / 0.6)');
  expect(details.shadowXl).toBe('0 24px 64px rgb(0 4 20 / 0.7)');
  expect(details.transitionHover).toBe('150ms ease-out');
  expect(details.transitionPanel).toBe('200ms cubic-bezier(0.2, 0, 0, 1)');
  expect(details.transitionPopover).toBe('100ms ease-out');
  expect(details.focusRing).toBe('#0099ff');
  expect(details.tooltipBg).toBe('#0e1525');
  expect(details.tooltipBorder).toBe('#2b3245');
  expect(details.tooltipDelay).toBe('500ms');
  expect(details.scrollbarSize).toBe('10px');
  expect(details.buttonBgToken).toBe('transparent');
  expect(details.buttonSolidBgToken).toBe('#1a2030');
  expect(details.buttonHoverBgToken).toBe('#2b3245');
  expect(details.buttonActiveBgToken).toBe('#3b4358');
  expect(details.buttonDisabledOpacityToken).toBe('0.4');
  expect(details.buttonLoadingSpinnerSizeToken).toBe('14px');
  expect(details.buttonRadius).toBe('4px');
  expect(details.buttonTransitionDuration).toContain('0.15s');
  expect(details.buttonTransitionTiming).toContain('ease-out');
  expect(details.inputRadius).toBe('6px');
  expect(details.cardRadius).toBe('6px');
  expect(details.cardShadow).toBe('rgba(0, 4, 20, 0.5) 0px 4px 12px 0px');
  expect(details.modalRadius).toBe('8px');
  expect(details.modalShadow).toBe('rgba(0, 4, 20, 0.7) 0px 24px 64px 0px');
  expect(details.popoverRadius).toBe('12px');
  expect(details.popoverShadow).toBe('rgba(0, 4, 20, 0.7) 0px 24px 64px 0px');
  expect(details.popoverTransitionDuration).toContain('0.1s');
  expect(details.overlayBackdrop).toContain('blur(12px)');
  expect(details.overlayBackground).toBe('rgba(26, 32, 48, 0.85)');
  expect(details.tooltipBackground).toBe('rgb(14, 21, 37)');
  expect(details.tooltipBorderColor).toBe('rgb(43, 50, 69)');
  expect(details.tooltipFontSize).toBe('11px');
  expect(details.tooltipArrowFill).toBe('rgb(14, 21, 37)');
  expect(details.iconWidth).toBe('16px');
  expect(details.iconHeight).toBe('16px');
  expect(details.iconStrokeWidth).toBe('1.5px');
  expect(details.scrollbarWidth).toBe('10px');
  expect(details.scrollbarHeight).toBe('10px');
}

test('public platform applies section 12 UI detail tokens', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  expectUiDetails(await readUiDetails(page));
});

test('admin console applies section 12 UI detail tokens', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  expectUiDetails(await readUiDetails(page));
});

test('public platform applies section 13 button states', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  await expectButtonStates(page);
});

test('admin console applies section 13 button states', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  await expectButtonStates(page);
});

test('public platform applies section 14 animation system', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  await expectAnimationDetails(page);
});

test('admin console applies section 14 animation system', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  await expectAnimationDetails(page);
});

test('public platform applies section 15 accessibility system', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  await expectAccessibilityDetails(page);
});

test('admin console applies section 15 accessibility system', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  await expectAccessibilityDetails(page);
});

test('public platform applies section 15 reduced motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectUiDetailsFixture(page);
  await expectReducedMotionDetails(page);
});

test('admin console applies section 15 reduced motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await injectUiDetailsFixture(page);
  await expectReducedMotionDetails(page);
});
