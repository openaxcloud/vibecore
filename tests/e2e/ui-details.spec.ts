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
      <input data-testid="ui-details-input" value="Input" />
      <div class="card" data-testid="ui-details-card">Card</div>
      <div role="dialog" data-testid="ui-details-modal">Modal</div>
      <div class="popover" data-testid="ui-details-popover">Popover</div>
      <div class="overlay" data-testid="ui-details-overlay">Overlay</div>
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
