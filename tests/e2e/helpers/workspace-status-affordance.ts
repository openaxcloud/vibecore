import type { Page } from '@playwright/test';

/** Shell affordance only. Readiness still requires Running and a real command/preview. */
export function workspaceStatusAffordance(page: Page) {
  return page.locator('button.bolt-project-statusbar-workspace').and(
    page.getByRole('button', {
      name: /^(Running|Building|Stopped|Crashed|Starting) workspace(?:\s*\||$)/i,
    }),
  );
}
