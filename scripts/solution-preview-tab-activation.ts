import { expect, type Page } from '@playwright/test';

const PREVIEW_TAB_SELECTOR = '[data-testid="tab-preview"]:visible';
const PREVIEW_TAB_BUTTON_SELECTOR = ':scope > button.bolt-project-tab-main';
const PREVIEW_TAB_BUTTON_HIT_SELECTOR = '[data-testid="tab-preview"] > button.bolt-project-tab-main';

/**
 * Activate the real desktop IDE Preview tab without letting Playwright wait on
 * the SPA history transition triggered by the tab's click handler. The click is
 * accepted only after the rerendered tab and URL independently prove that the
 * Preview panel became active.
 */
export async function activatePreviewTab(page: Page, timeoutMs = 60_000): Promise<void> {
  const previewTabs = page.locator(PREVIEW_TAB_SELECTOR);

  await expect(previewTabs, 'The IDE must expose exactly one visible Preview tab').toHaveCount(1, {
    timeout: timeoutMs,
  });

  const previewTab = previewTabs.first();
  const previewButton = previewTab.locator(PREVIEW_TAB_BUTTON_SELECTOR);

  await expect(previewTab, 'The Preview tab container must use the production tab semantics').toHaveAttribute(
    'role',
    'tab',
    { timeout: timeoutMs },
  );
  await expect(previewButton, 'The Preview tab must expose exactly one primary activation button').toHaveCount(1, {
    timeout: timeoutMs,
  });
  await expect(previewButton).toBeVisible({ timeout: timeoutMs });
  await expect(previewButton).toBeEnabled({ timeout: timeoutMs });
  await previewButton.scrollIntoViewIfNeeded({ timeout: timeoutMs });

  const bounds = await previewButton.boundingBox();

  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('Preview tab activation was not attempted: its primary button has no clickable bounding box.');
  }

  const point = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const hitTargetAudit = await previewButton.evaluate(
    (element, { hitSelector, x, y }) => {
      const hitElement = element.ownerDocument.elementFromPoint(x, y);
      const hitButton = hitElement?.closest(hitSelector);

      return {
        exactTarget: hitButton === element,
        hitTag: hitElement?.tagName.toLocaleLowerCase() ?? null,
      };
    },
    { hitSelector: PREVIEW_TAB_BUTTON_HIT_SELECTOR, ...point },
  );

  if (!hitTargetAudit.exactTarget) {
    throw new Error(
      `Preview tab activation was not attempted: its center point hit ${JSON.stringify(hitTargetAudit.hitTag)} ` +
        'instead of the exact [data-testid="tab-preview"] > button.bolt-project-tab-main target.',
    );
  }

  await page.mouse.click(point.x, point.y);

  try {
    await expect(previewTab).toHaveAttribute('aria-selected', 'true', { timeout: timeoutMs });
  } catch (error) {
    throw new Error(
      'Preview tab activation was not proven: [data-testid="tab-preview"] did not reach aria-selected="true".',
      { cause: error },
    );
  }

  try {
    await expect
      .poll(
        () => {
          try {
            return new URL(page.url()).searchParams.get('panel');
          } catch {
            return null;
          }
        },
        {
          message: 'The IDE URL must prove that the Preview panel is active',
          timeout: timeoutMs,
        },
      )
      .toBe('preview');
  } catch (error) {
    throw new Error('Preview tab activation was not proven: the IDE URL did not reach panel=preview.', {
      cause: error,
    });
  }
}
