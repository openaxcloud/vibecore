import { expect, type Locator, type Page } from '@playwright/test';

const ACTIVE_PANE_SELECTOR = '.bolt-project-main-panes .bolt-project-pane-leaf[data-active="true"]:visible';

const PREVIEW_TAB_SELECTOR =
  ':scope > .bolt-project-tabbar > .bolt-project-tabs[role="tablist"] > [role="tab"][data-panel="preview"]';

const PREVIEW_TAB_BUTTON_SELECTOR = ':scope > button.bolt-project-tab-main';

async function requireExactlyOne(locator: Locator, message: string, timeoutMs: number): Promise<Locator> {
  try {
    await expect(locator).toHaveCount(1, { timeout: timeoutMs });
  } catch (error) {
    const count = await locator.count().catch(() => null);

    throw new Error(`${message}; found ${count ?? 'an unreadable number of'} matching elements.`, {
      cause: error,
    });
  }

  return locator.first();
}

async function resolveActivePreviewTab(page: Page, timeoutMs: number): Promise<Locator> {
  const activePanes = page.locator(ACTIVE_PANE_SELECTOR);

  const activePane = await requireExactlyOne(
    activePanes,
    'The desktop IDE must expose exactly one visible active pane',
    timeoutMs,
  );
  const previewTab = await requireExactlyOne(
    activePane.locator(PREVIEW_TAB_SELECTOR),
    'The active IDE pane must expose exactly one visible Preview tab',
    timeoutMs,
  );
  const identity = await previewTab.evaluate((element) => ({
    panel: element.getAttribute('data-panel'),
    role: element.getAttribute('role'),
    tabId: element.getAttribute('data-tab-id'),
    testId: element.getAttribute('data-testid'),
  }));

  if (!identity.tabId?.trim()) {
    throw new Error('Preview tab activation was not attempted: the production tab has no non-empty data-tab-id.');
  }

  if (identity.testId !== `tab-${identity.tabId}`) {
    throw new Error(
      `Preview tab activation was not attempted: data-testid ${JSON.stringify(identity.testId)} does not match ` +
        `the production tab-${identity.tabId} diagnostic relation.`,
    );
  }

  if (identity.role !== 'tab' || identity.panel !== 'preview') {
    throw new Error('Preview tab activation was not attempted: the production role/data-panel contract is invalid.');
  }

  return previewTab;
}

/**
 * Activate the real desktop IDE Preview tab without letting Playwright wait on
 * the SPA history transition triggered by the tab's click handler. The click is
 * accepted only after the rerendered tab and URL independently prove that the
 * Preview panel became active.
 */
export async function activatePreviewTab(page: Page, timeoutMs = 60_000): Promise<void> {
  const previewTab = await resolveActivePreviewTab(page, timeoutMs);

  const previewButton = await requireExactlyOne(
    previewTab.locator(PREVIEW_TAB_BUTTON_SELECTOR),
    'The Preview tab must expose exactly one primary activation button',
    timeoutMs,
  );
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
  const hitTargetAudit = await previewButton.evaluate((element, { x, y }) => {
    const hitElement = element.ownerDocument.elementFromPoint(x, y);
    const hitButton = hitElement?.closest('button.bolt-project-tab-main');
    const tabElement = element.parentElement;

    return {
      exactTarget: hitButton === element && tabElement?.matches('[role="tab"][data-panel="preview"]') === true,
      hitTag: hitElement?.tagName.toLocaleLowerCase() ?? null,
    };
  }, point);

  if (!hitTargetAudit.exactTarget) {
    throw new Error(
      `Preview tab activation was not attempted: its center point hit ${JSON.stringify(hitTargetAudit.hitTag)} ` +
        'instead of the exact active [role="tab"][data-panel="preview"] > button.bolt-project-tab-main target.',
    );
  }

  await page.mouse.click(point.x, point.y);

  /*
   * Selecting the tab updates the URL and can race persisted pane restoration.
   * Resolve the semantic production target again instead of retaining an id-
   * bound tab: restored/default preview ids are deliberately not stable.
   */
  const selectedPreviewTab = await resolveActivePreviewTab(page, timeoutMs);

  try {
    await expect(selectedPreviewTab).toHaveAttribute('aria-selected', 'true', { timeout: timeoutMs });
  } catch (error) {
    throw new Error(
      'Preview tab activation was not proven: the active [data-panel="preview"] tab did not reach aria-selected="true".',
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
