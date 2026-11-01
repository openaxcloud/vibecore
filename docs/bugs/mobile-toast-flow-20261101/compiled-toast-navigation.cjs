const fs = require('fs');
const { chromium, webkit, expect } = require('@playwright/test');
const origin = process.env.UI_BASE_URL || 'http://127.0.0.1:18202';
const blocked = [];
const output = process.env.MOBILE_TOAST_NAV_EVIDENCE || '/workspace/mobile-toast-navigation';
fs.mkdirSync(output, { recursive: true });
async function setup(p) {
  await p.context().addCookies([
    { name: 'vc_session', value: 'synthetic-ui', url: origin },
    { name: 'vibecore-lang', value: 'fr', url: origin },
  ]);
  await p.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'dismissed', step: 0 }));
    const real = window.fetch.bind(window);
    window.__syntheticCalls = [];
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
      if (!url.includes('/api/chat')) return real(input, init);
      const id = 'synthetic-turn-' + (window.__syntheticCalls.length + 1),
        encoder = new TextEncoder();
      let controller;
      const body = new ReadableStream({
        start(c) {
          controller = c;
          c.enqueue(encoder.encode('f:' + JSON.stringify({ messageId: id }) + '\n'));
        },
      });
      const call = {
        id,
        push(type, value) {
          controller.enqueue(encoder.encode(type + ':' + JSON.stringify(value) + '\n'));
        },
        finish() {
          this.push('d', { finishReason: 'stop', usage: {} });
          controller.close();
        },
      };
      window.__syntheticCalls.push(call);
      init.signal?.addEventListener('abort', () => {
        try {
          controller.close();
        } catch {}
      });
      return Promise.resolve(
        new Response(body, {
          headers: { 'content-type': 'text/event-stream; charset=utf-8', 'x-vercel-ai-data-stream': 'v1' },
        }),
      );
    };
  });
  await p.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== origin || !['GET', 'HEAD'].includes(r.request().method())) {
      blocked.push({ method: r.request().method(), path: u.pathname });
      return r.fulfill({ status: 503, json: { error: 'Synthetic harness blocked request' } });
    }
    return r.continue();
  });
  await p.context().routeWebSocket('**/*', (ws) => ws.close());
}
// Test-only instrumentation exposes the existing compiled notification function.
// It never replaces its implementation or calls a model / production backend.
const path = require('path');
const assets = path.join(process.cwd(), 'build/client/assets');
const asset = fs
  .readdirSync(assets)
  .filter((n) => n.endsWith('.js'))
  .find((n) => fs.readFileSync(path.join(assets, n), 'utf8').includes('agent-auto-applied-files'));
const source = fs.readFileSync(path.join(assets, asset), 'utf8');
const fn = source.match(/function ([\w$]+)\([^)]*\)\{const [^;]{0,180}?\.onDismissAll\?\?/)[1];
const toastAlias = source.slice(source.indexOf('agent-auto-applied-files')).match(/=>\s*([\w$]+)\.dismiss\(/)[1];
const instrumented =
  source +
  `\nwindow.__syntheticToast=(warning=false,count=3)=>${fn}(Array.from({length:count},(_,i)=>'src/synthetic-'+i+'.tsx'),{onUndoAll:()=>window.__syntheticUndo=(window.__syntheticUndo||0)+1},warning?{tronquee:true,entreesManquantes:['src/main.tsx'],aucunFichier:false}:undefined);window.__pauseToast=()=>${toastAlias}.pause();window.__dismissToast=()=>${toastAlias}.dismiss('agent-auto-applied-files');`;
(async () => {
  const rows = [];
  for (const [engine, type, executablePath] of [
    ['chromium', chromium, '/usr/bin/chromium'],
    ['webkit', webkit, '/workspace/.cache/ms-playwright/webkit-2272/pw_run.sh'],
  ]) {
    const browser = await type.launch({ executablePath });
    try {
      for (const width of (process.env.NAV_WIDTHS || '390,393,430').split(',').map(Number))
        for (const direction of (process.env.NAV_DIRECTIONS || 'global-to-agent,agent-to-global').split(',')) {
          const page = await browser.newPage({ viewport: { width, height: 852 }, isMobile: true, hasTouch: true });
          const row = { engine, width, direction };
          rows.push(row);
          try {
            await setup(page);
            await page.route('**/api/projects/synthetic-first/ide-state', (r) =>
              r.request().method() === 'GET'
                ? r.fulfill({ json: { ideState: { state: {}, version: 1 } } })
                : r.fulfill({ status: 503, json: { error: 'Synthetic persistence blocked' } }),
            );
            await page.route('**/' + asset, (r) =>
              r.fulfill({ body: instrumented, contentType: 'application/javascript' }),
            );
            await page.goto(origin + '/projects/synthetic-first/ide?panel=agent', { waitUntil: 'domcontentloaded' });
            await expect(
              page.locator('.bolt-project-agent-composer textarea').filter({ visible: true }).first(),
            ).toBeVisible({ timeout: 30000 });
            await page.waitForTimeout(1000); // Initial read-only fixture hydration.
            const notice = page.locator('.bolt-agent-applied-toast');
            const dock = page.locator('.bolt-agent-applied-notice-dock');
            if (direction === 'global-to-agent') await page.getByTestId('tab-preview').click();
            await page.evaluate(() => window.__syntheticToast(true, 6));
            await expect(notice).toBeVisible();
            await expect(notice.getByText('6 fichiers appliqués', { exact: true })).toBeVisible();
            const summary = notice.locator('summary');
            await summary.focus();
            await page.keyboard.press('Enter');
            await expect(notice.locator('details')).toHaveAttribute('open', '');
            await page.evaluate(() => {
              window.__originalNotice = document.querySelector('.bolt-agent-applied-toast');
              window.__toastCounts = [document.querySelectorAll('.bolt-agent-applied-toast').length];
              new MutationObserver(() =>
                window.__toastCounts.push(document.querySelectorAll('.bolt-agent-applied-toast').length),
              ).observe(document.body, { subtree: true, childList: true });
            });
            await page.getByTestId(direction === 'global-to-agent' ? 'tab-agent' : 'tab-preview').click();
            row.afterSwitch = await page.evaluate(() => {
              const n = document.querySelector('.bolt-agent-applied-toast'),
                d = document.querySelector('.bolt-agent-applied-notice-dock');
              return {
                count: document.querySelectorAll('.bolt-agent-applied-toast').length,
                inDock: !!d?.contains(n),
                visible: !!n?.getClientRects().length,
                open: !!n?.querySelector('details')?.open,
              };
            });
            await expect(notice).toBeVisible();
            await expect(notice).toHaveCount(1);
            await expect
              .poll(() => notice.evaluate((n) => !!n.closest('.bolt-agent-applied-notice-dock')))
              .toBe(direction === 'global-to-agent');
            row.sameNoticeElement = await notice.evaluate((n) => n === window.__originalNotice);
            expect(row.sameNoticeElement).toBe(true);
            row.idCounts = await page.evaluate(() =>
              Object.fromEntries(
                ['agent-applied-files-dock', 'agent-applied-files-notices', 'agent-auto-applied-files'].map((id) => [
                  id,
                  document.querySelectorAll('[id="' + id + '"]').length,
                ]),
              ),
            );
            expect(Object.values(row.idCounts)).toEqual([1, 1, 1]);
            await expect(page.locator('.bolt-agent-applied-notice-host [aria-label="Notifications"]')).toHaveCount(1);
            await expect(notice.locator('.bolt-agent-applied-toast-head')).toHaveAttribute('role', 'status');
            await expect(notice.locator('.bolt-agent-applied-toast-head')).toHaveAttribute('aria-live', 'polite');

            await expect(notice.locator('details')).toHaveAttribute('open', '');
            await expect(notice.locator('.bolt-agent-applied-toast-incomplete')).toContainText('src/main.tsx');
            await summary.focus();
            await page.keyboard.press('Enter');
            await expect(notice.locator('details')).not.toHaveAttribute('open', '');
            await page.keyboard.press('Tab');
            await expect(notice.getByRole('button', { name: 'Tout annuler', exact: true })).toBeFocused();
            await page.keyboard.press('Enter');
            expect(await page.evaluate(() => window.__syntheticUndo)).toBe(1);
            await page.screenshot({ path: output + '/' + engine + '-' + width + '-' + direction + '.png' });
            // Return to the other panel while the same warning remains active.
            await page.getByTestId(direction === 'global-to-agent' ? 'tab-preview' : 'tab-agent').click();
            await expect(notice).toBeVisible();
            await expect(notice).toHaveCount(1);
            await expect
              .poll(() => notice.evaluate((n) => !!n.closest('.bolt-agent-applied-notice-dock')))
              .toBe(direction !== 'global-to-agent');
            expect(await notice.evaluate((n) => n === window.__originalNotice)).toBe(true);
            await summary.focus();
            await page.keyboard.press('Tab');
            await expect(notice.getByRole('button', { name: 'Tout annuler', exact: true })).toBeFocused();
            await page.keyboard.press('Tab');
            await expect(notice.getByRole('button', { name: 'Tout fermer', exact: true })).toBeFocused();
            await page.keyboard.press('Space');
            await expect(notice).toHaveCount(0);
            await page.getByTestId(direction === 'global-to-agent' ? 'tab-agent' : 'tab-preview').click();
            await expect(notice).toHaveCount(0);
            await page.evaluate(() => window.__syntheticToast(true, 2));
            await expect(notice).toBeVisible();
            await expect(notice).toHaveCount(1);
            await expect(notice.getByText('2 fichiers appliqués', { exact: true })).toBeVisible();
            await notice.getByRole('button', { name: 'Tout fermer', exact: true }).click();
            await expect(notice).toHaveCount(0);
            if (process.env.TEST_TIMER === '1') {
              await page.mouse.move(0, 0);
              const start = Date.now();
              await page.evaluate(() => window.__syntheticToast(false, 1));
              await expect(notice).toBeVisible();
              await page.waitForTimeout(3000);
              row.clockBefore = await page.evaluate(() =>
                [...document.querySelector('.bolt-agent-applied-notice-host').getAnimations({ subtree: true })].map(
                  (a) => ({ name: a.animationName, time: a.currentTime, state: a.playState }),
                ),
              );
              await page.getByTestId(direction === 'global-to-agent' ? 'tab-preview' : 'tab-agent').click();
              row.clockAfter = await page.evaluate(() =>
                [...document.querySelector('.bolt-agent-applied-notice-host').getAnimations({ subtree: true })].map(
                  (a) => ({ name: a.animationName, time: a.currentTime, state: a.playState }),
                ),
              );
              await expect(notice).toHaveCount(0, { timeout: 3500 });
              row.autoCloseElapsedMs = Date.now() - start;
              expect(row.autoCloseElapsedMs).toBeLessThan(6500);
            }
            row.maximumToastCount = await page.evaluate(() => Math.max(...window.__toastCounts));
            expect(row.maximumToastCount).toBe(1);
            row.passed = true;
          } catch (error) {
            row.error = String(error);
            await page.screenshot({ path: output + '/' + engine + '-' + width + '-' + direction + '-failed.png' });
          }
          await page.close();
          fs.writeFileSync(output + '/receipt.json', JSON.stringify(rows, null, 2));
        }
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify(rows, null, 2));
  if (rows.some((r) => r.error)) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
