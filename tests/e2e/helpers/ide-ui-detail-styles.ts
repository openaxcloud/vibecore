import type { Page } from '@playwright/test';

/**
 * Resolve the current menu and read its styles in one browser task. A locator's
 * evaluate can retain the loading shell's menu across a React replacement;
 * getComputedStyle on that detached node returns empty values.
 * No waiting or retrying here: an absent menu remains a test failure.
 */
export async function readIdeUiDetailStyles(page: Page) {
  return page.evaluate(() => {
    const menus = document.querySelectorAll('[data-testid="ide-add-tab-command-palette"] .bolt-project-tool-menu');
    const menu = menus.item(menus.length - 1);

    if (!menu || !menu.isConnected) {
      throw new Error('IDE add-tab palette menu is absent or detached.');
    }

    const root = window.getComputedStyle(document.documentElement);
    const toolMenuStyle = window.getComputedStyle(menu);

    /*
     * NOT plain querySelector: the first `.bolt-project-tab-action` in the DOM
     * is the add-tab "+" button inside `.bolt-project-tool-popover`, which a
     * dedicated rule deliberately rounds to 6px. Section 12 is about the shared
     * button token (--vc-ui-radius-button: 4px), so measure a regular tab
     * action instead of the popover-scoped variant.
     */
    const tabActionElement =
      document.querySelector('.bolt-project-tab-action:not(.bolt-project-add-tab-action)') ??
      document.querySelector('.bolt-project-tab-action');

    const tabAction = tabActionElement ? window.getComputedStyle(tabActionElement) : null;
    const terminalHandleElement = document.querySelector('.bolt-project-terminal-resize-handle');
    const terminalHandle = terminalHandleElement ? window.getComputedStyle(terminalHandleElement) : null;

    return {
      radiusButton: root.getPropertyValue('--vc-ui-radius-button').trim(),
      radiusModal: root.getPropertyValue('--vc-ui-radius-modal').trim(),
      radiusPopover: root.getPropertyValue('--vc-ui-radius-popover').trim(),
      shadowXl: root.getPropertyValue('--vc-ui-shadow-xl').trim(),
      focusRing: root.getPropertyValue('--vc-ui-focus-ring').trim().toLowerCase(),
      toolMenuRadius: toolMenuStyle.borderRadius,
      toolMenuShadow: toolMenuStyle.boxShadow,
      toolMenuBackdrop: toolMenuStyle.backdropFilter || toolMenuStyle.getPropertyValue('-webkit-backdrop-filter'),
      tabActionRadius: tabAction?.borderRadius ?? '',
      tabActionDuration: tabAction?.transitionDuration ?? '',
      terminalHandleDuration: terminalHandle?.transitionDuration ?? '',
      terminalHandleTiming: terminalHandle?.transitionTimingFunction ?? '',
    };
  });
}
