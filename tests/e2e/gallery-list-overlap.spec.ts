import { expect, test } from '@playwright/test';

/*
 * Anti-overlap regression for the Gallery LIST view (Avi bug #3): the thumbnail
 * must NOT overlap the card's title/description. Without the fix (dropping the
 * 16:10 aspect-ratio on desktop list mode) the thumbnail width ballooned out of
 * its grid column and covered the title — this asserts it no longer does, and
 * FAILS against the un-fixed CSS.
 *
 * Runs against a served gallery (web dev server + API) in list view at desktop
 * width. Needs at least one published listing; skips with a clear message if the
 * gallery is empty so it never silently passes.
 */

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

test.describe('Gallery list view — no thumbnail/title overlap', () => {
  test('desktop list view: each card thumbnail stays left of its title', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${APP_BASE_URL}/gallery?view=list`, { waitUntil: 'networkidle' });

    const cards = page.locator('[data-testid="template-card"]');
    const count = await cards.count();

    test.skip(count === 0, 'Gallery has no published listings to assert against.');

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const thumb = card.locator('img, [aria-label^="Loading preview"], [class*="aspect-"]').first();
      const title = card.getByRole('heading').first();

      const thumbBox = await thumb.boundingBox();
      const titleBox = await title.boundingBox();

      if (!thumbBox || !titleBox) {
        continue;
      }

      /*
       * In the desktop list layout the thumbnail is a fixed LEFT column; its right
       * edge must not cross into the title (allow a 1px rounding tolerance).
       */
      expect(
        thumbBox.x + thumbBox.width,
        `card #${i}: thumbnail right edge (${Math.round(thumbBox.x + thumbBox.width)}) overlaps title left edge (${Math.round(titleBox.x)})`,
      ).toBeLessThanOrEqual(titleBox.x + 1);
    }
  });
});
