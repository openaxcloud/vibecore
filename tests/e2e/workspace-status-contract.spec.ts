import type { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  collectDesktopBrowserEvidence,
  installDesktopBrowserProbe,
  withDesktopLayoutEvidence,
} from './helpers/runtime-desktop-diagnostics';
import { workspaceStatusAffordance } from './helpers/workspace-status-affordance';

// Deterministic selector/observer tests only. These fixtures do not replace the real @runtime tests.
for (const state of ['Starting', 'Running', 'Building', 'Stopped', 'Crashed']) {
  test(`workspace affordance accepts the real ${state} button`, async ({ page }) => {
    await page.setContent(
      `<button class="bolt-project-statusbar-workspace" aria-label="${state} workspace | 1 runtime log line"></button>`,
    );

    const button = workspaceStatusAffordance(page);
    await expect(button).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('button')!.addEventListener('click', () => {
        document.body.dataset.clicked = 'true';
      });
    });
    await button.click();
    await expect(page.locator('body')).toHaveAttribute('data-clicked', 'true');

    if (state !== 'Running') {
      await expect(page.getByRole('button', { name: /^Running workspace(?:\s*\||$)/i })).toHaveCount(0);
    }
  });
}

for (const [name, html] of [
  ['absent', ''],
  ['error', '<button class="bolt-project-statusbar-workspace" aria-label="Error workspace"></button>'],
  ['loading', '<button class="bolt-project-statusbar-workspace" aria-label="Loading workspace"></button>'],
  ['unknown', '<button class="bolt-project-statusbar-workspace" aria-label="Something workspace"></button>'],
  ['bad suffix', '<button class="bolt-project-statusbar-workspace" aria-label="Running workspacex"></button>'],
  ['wrong control', '<button aria-label="Starting workspace"></button>'],
  ['non-button', '<div class="bolt-project-statusbar-workspace" role="button" aria-label="Starting workspace"></div>'],
  [
    'wrong role',
    '<button class="bolt-project-statusbar-workspace" role="link" aria-label="Starting workspace"></button>',
  ],
  [
    'aria hidden',
    '<button class="bolt-project-statusbar-workspace" aria-hidden="true" aria-label="Starting workspace"></button>',
  ],
]) {
  test(`workspace affordance rejects ${name}`, async ({ page }) => {
    await page.setContent(html);
    await expect(workspaceStatusAffordance(page)).toHaveCount(0);
    await expect(expect(workspaceStatusAffordance(page)).toBeVisible({ timeout: 50 })).rejects.toThrow();
  });
}

test('workspace affordance rejects hidden, duplicate and disabled controls', async ({ page }) => {
  const html = '<button class="bolt-project-statusbar-workspace" aria-label="Starting workspace"></button>';
  await page.setContent(`<div hidden>${html}</div>`);
  await expect(expect(workspaceStatusAffordance(page)).toBeVisible({ timeout: 50 })).rejects.toThrow();
  await page.setContent(html + html);
  await expect(expect(workspaceStatusAffordance(page)).toBeVisible({ timeout: 50 })).rejects.toThrow();
  await page.setContent(html.replace('<button ', '<button disabled '));
  await expect(workspaceStatusAffordance(page).click({ timeout: 50 })).rejects.toThrow();
});

test('workspace probe records transitions without labels and stops on collection', async ({ page }) => {
  await page.evaluate(installDesktopBrowserProbe);
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, '<button class="bolt-project-statusbar-workspace" aria-label="Starting workspace | PRIVATE_SENTINEL"></button>');
  await workspaceStatusAffordance(page).evaluate((button) => {
    button.setAttribute('aria-label', 'Running workspace | PRIVATE_SENTINEL');
  });

  const result = await page.evaluate(collectDesktopBrowserEvidence);
  expect(result.workspace.map((entry) => entry.state)).toEqual(['absent', 'starting', 'running']);
  expect(result.workspace[1].matchesLegacyAssertion).toBe(false);
  expect(result.workspace[2].matchesLegacyAssertion).toBe(true);
  expect(result.workspaceTiming.runningObserved).toBe(true);
  expect(result.workspaceTiming.visibleToRunningMs).toBeGreaterThanOrEqual(0);
  expect(result.timeOrigin).toBeGreaterThan(0);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
  await workspaceStatusAffordance(page).evaluate((button) => button.setAttribute('aria-label', 'Stopped workspace'));

  const stopped = await page.evaluate(collectDesktopBrowserEvidence);
  expect(stopped.workspace).toEqual(result.workspace);
});

test('workspace probe reports an unobserved Running transition as censored, not ready', async ({ page }) => {
  await page.evaluate(installDesktopBrowserProbe);
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, '<button class="bolt-project-statusbar-workspace" aria-label="Starting workspace"></button>');

  const result = await page.evaluate(collectDesktopBrowserEvidence);
  expect(result.workspaceTiming.runningObserved).toBe(false);
  expect(result.workspaceTiming.firstRunningAt).toBeNull();
  expect(result.workspaceTiming.visibleToRunningMs).toBeNull();
  expect(result.workspaceTiming.firstVisibleAt).not.toBeNull();
  expect(result.workspaceTiming.observedMs).toBeGreaterThanOrEqual(0);
});

test('workspace probe retains a bounded history and still measures a late Running transition', async ({ page }) => {
  await page.evaluate(installDesktopBrowserProbe);
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, '<button class="bolt-project-statusbar-workspace" aria-label="Starting workspace"></button>');

  for (let index = 0; index < 80; index += 1) {
    await page.locator('button').evaluate((button, value) => {
      button.setAttribute('aria-label', `${value % 2 ? 'Starting' : 'Stopped'} workspace`);
    }, index);
  }
  await page.locator('button').evaluate((button) => button.setAttribute('aria-label', 'Running workspace'));

  const result = await page.evaluate(collectDesktopBrowserEvidence);
  expect(result.workspace).toHaveLength(64);
  expect(result.dropped).toBeGreaterThan(0);
  expect(result.workspaceTiming.runningObserved).toBe(true);
  expect(result.workspaceTiming.visibleToRunningMs).toBeGreaterThanOrEqual(0);
});

test('workspace probe distinguishes hidden, absent and unknown states', async ({ page }) => {
  await page.evaluate(installDesktopBrowserProbe);
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, '<button hidden class="bolt-project-statusbar-workspace" aria-label="Running workspace"></button>');
  await page.locator('button').evaluate((button) => button.removeAttribute('hidden'));
  await page.locator('button').evaluate((button) => button.setAttribute('aria-label', 'PRIVATE_SENTINEL'));
  await page.locator('button').evaluate((button) => button.remove());

  const result = await page.evaluate(collectDesktopBrowserEvidence);
  expect(result.workspace.map(({ state, visible }) => [state, visible])).toEqual([
    ['absent', false],
    ['running', false],
    ['running', true],
    ['other', true],
    ['absent', false],
  ]);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
});

for (const failure of [false, true]) {
  test(`workspace evidence integration captures ${failure ? 'failure' : 'success'} and cleans up`, async ({
    page,
    isMobile,
  }, testInfo) => {
    const events = ['request', 'requestfinished', 'requestfailed', 'response', 'pageerror', 'console'] as const;
    const emitter = page as unknown as Pick<EventEmitter, 'listenerCount'>;
    const before = events.map((event) => emitter.listenerCount(event));
    const sentinel = new Error('original scenario failure');

    const run = withDesktopLayoutEvidence(
      async ({ page }) => {
        // setContent does not execute an init script, so install it explicitly in this fixture only.
        await page.evaluate(installDesktopBrowserProbe);
        await page.evaluate((html) => {
          document.body.innerHTML = html;
        }, '<button class="bolt-project-statusbar-workspace" aria-label="Starting workspace"></button>');

        if (failure) {
          throw sentinel;
        }
      },
      { captureOnSuccess: true },
    );

    if (failure) {
      await expect(run({ page, isMobile }, testInfo)).rejects.toBe(sentinel);
    } else {
      await run({ page, isMobile }, testInfo);
    }

    const evidence = JSON.parse(await readFile(testInfo.outputPath('desktop-layout-evidence.json'), 'utf8'));
    expect(evidence.browser.workspaceTiming.runningObserved).toBe(false);
    expect(evidence.browser.workspace.at(-1).state).toBe('starting');
    expect(events.map((event) => emitter.listenerCount(event))).toEqual(before);
    await page.locator('button').evaluate((button) => button.setAttribute('aria-label', 'Running workspace'));

    const after = await page.evaluate(collectDesktopBrowserEvidence);
    expect(after.workspaceTiming.runningObserved).toBe(false);
  });
}
