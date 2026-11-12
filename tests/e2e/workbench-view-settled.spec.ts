import { waitForWorkbenchViewSettled } from './helpers/workbench-view-settled';
import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, transform = 'none', extra = '') {
  await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>
    body { margin: 0; height: 2000px; }
    [data-testid=workbench-view-viewport] { position: relative; width: 300px; height: 180px; overflow: clip; }
    .absolute { position: absolute; inset: 0; }
    button { position: absolute; left: 20px; top: 20px; width: 100px; height: 30px; }
  </style><section data-testid="mobile-workbench-keepalive"><div data-testid="workbench-view-viewport">
    <div class="absolute inset-0" style="transform:${transform}"><button id="action">Action</button></div>
  </div></section>${extra}`);
  await page.evaluate(() => {
    (window as unknown as { events: string[] }).events = [];

    for (const name of ['click', 'pointerover', 'mouseover', 'keydown', 'scroll']) {
      document.addEventListener(name, () => (window as unknown as { events: string[] }).events.push(name), true);
    }
  });

  return page.locator('#action');
}

async function centreHitsAction(page: Page) {
  return page.locator('#action').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);

    return hit === node || node.contains(hit);
  });
}

async function unchangedInput(page: Page) {
  expect(
    await page.evaluate(() => ({ events: (window as unknown as { events: string[] }).events, scroll: scrollY })),
  ).toEqual({ events: [], scroll: 0 });
}

test.describe('Workbench transition observer with local HTML', () => {
  for (const transform of ['none', 'matrix(1, 0, 0, 1, 0, 0)', 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)']) {
    test(`accepts exact identity ${transform}`, async ({ page }) => {
      const action = await fixture(page, transform);
      expect(await waitForWorkbenchViewSettled(action)).toBe('settled');
      expect(await centreHitsAction(page)).toBe(true);
      await unchangedInput(page);
    });
  }
  test('waits through a real CSS translation without pointer or scroll', async ({ page }) => {
    const action = await fixture(page, 'translateX(100%)');
    await page.evaluate(() => {
      const view = document.querySelector<HTMLElement>('.absolute')!;
      view.style.transition = 'transform 150ms linear';

      const samples: string[] = [];
      (window as unknown as { samples: string[] }).samples = samples;

      const original = window.getComputedStyle;

      window.getComputedStyle = function (element, pseudo) {
        const result = original.call(window, element, pseudo);

        if (element === view) {
          samples.push(result.transform);

          if (samples.length === 1) {
            requestAnimationFrame(() => {
              view.style.transform = 'none';
            });
          }
        }

        return result;
      };
    });
    expect(await waitForWorkbenchViewSettled(action)).toBe('settled');

    const samples = await page.evaluate(() => (window as unknown as { samples: string[] }).samples);
    expect(samples.length).toBeGreaterThan(1);
    expect(samples[0]).not.toBe('none');
    expect(
      await page.locator('.absolute').evaluate((node) => {
        const transform = getComputedStyle(node).transform;
        return transform === 'none' || new DOMMatrixReadOnly(transform).isIdentity;
      }),
    ).toBe(true);
    expect(await centreHitsAction(page)).toBe(true);
    await unchangedInput(page);
  });

  for (const obstruction of ['header', 'overlay']) {
    test(`persistent ${obstruction} remains rejected by the unchanged centre test`, async ({ page }) => {
      const action = await fixture(
        page,
        'none',
        `<${obstruction === 'header' ? 'header' : 'div'} style="position:fixed;inset:0;z-index:9999">${obstruction}</${obstruction === 'header' ? 'header' : 'div'}>`,
      );

      // Guard must return while obstruction is still present, not wait it away.
      expect(await waitForWorkbenchViewSettled(action)).toBe('settled');
      expect(await centreHitsAction(page)).toBe(false);
      await unchangedInput(page);
    });
  }
  test('stable offscreen target stays offscreen and fails centre hit-testing', async ({ page }) => {
    const action = await fixture(page);
    await page.locator('section').evaluate((node) => {
      node.style.marginTop = `${innerHeight + 100}px`;
    });
    expect(await waitForWorkbenchViewSettled(action)).toBe('settled');
    expect(await centreHitsAction(page)).toBe(false);
    await unchangedInput(page);
  });
  test('rejects the wrong View ancestor', async ({ page }) => {
    const action = await fixture(page);
    await page.locator('.absolute').evaluate((node) => {
      node.setAttribute('class', 'wrong');
    });
    expect(await waitForWorkbenchViewSettled(action)).toBe('invalid-view');
    await unchangedInput(page);
  });
  test('rejects disappearance rather than adopting an identical replacement', async ({ page }) => {
    const action = await fixture(page, 'translateX(50%)');

    /*
     * Schedule after the observer captures identity, using RAF registration
     * inside computed-style sampling rather than timing the driver process.
     */
    await page.evaluate(() => {
      const original = window.getComputedStyle;

      window.getComputedStyle = function (element, pseudo) {
        const result = original.call(window, element, pseudo);

        if (element.matches('.absolute')) {
          window.getComputedStyle = original;
          requestAnimationFrame(() => {
            const target = document.querySelector('#action')!;
            target.replaceWith(target.cloneNode(true));
          });
        }

        return result;
      };
    });
    expect(await waitForWorkbenchViewSettled(action)).toBe('detached');
    await unchangedInput(page);
  });
  test('permanent nonidentity fails at the existing 5s budget', async ({ page }) => {
    const action = await fixture(page, 'translateX(0.00001%)');
    expect(await waitForWorkbenchViewSettled(action)).toBe('timed-out');
    await unchangedInput(page);
  });
});
