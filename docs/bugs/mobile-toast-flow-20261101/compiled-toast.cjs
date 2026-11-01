const fs = require('fs');
const { chromium, webkit, expect } = require('@playwright/test');
const origin = process.env.UI_BASE_URL || 'http://127.0.0.1:18202';
const blocked = [];
const output = process.env.MOBILE_TOAST_EVIDENCE || '/workspace/mobile-toast-flow-evidence';
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
      for (const width of [390, 393, 430]) {
        const page = await browser.newPage({ viewport: { width, height: 852 }, isMobile: true, hasTouch: true });
        const row = { engine, width };
        rows.push(row);
        try {
          await setup(page);
          await page.route('**/api/projects/synthetic-first/ide-state', (route) =>
            route.request().method() === 'GET'
              ? route.fulfill({ json: { ideState: { state: {}, version: 1 } } })
              : route.fulfill({ status: 503, json: { error: 'Synthetic harness blocks persistence' } }),
          );
          await page.route('**/' + asset, (r) =>
            r.fulfill({ body: instrumented, contentType: 'application/javascript' }),
          );
          await page.goto(origin + '/projects/synthetic-first/ide?panel=agent', { waitUntil: 'domcontentloaded' });
          const input = page.locator('.bolt-project-agent-composer textarea').filter({ visible: true }).first();
          await expect(input).toBeVisible({ timeout: 30000 });
          await page.waitForTimeout(1000);
          await input.fill('Synthetic toast layout test');
          await expect(input).toHaveValue('Synthetic toast layout test');
          await page.locator('.bolt-composer-send-button').filter({ visible: true }).click();
          await expect.poll(() => page.evaluate(() => window.__syntheticCalls.length)).toBe(1);
          await page.evaluate(() => {
            const c = window.__syntheticCalls[0];
            c.push('8', [
              {
                type: 'agentOrchestration',
                mode: 'parallel-subagents',
                reason: 'Synthetic',
                roles: [{ id: 'qa', title: 'QA', responsibility: 'Synthetic test only' }],
              },
            ]);
            c.push(
              '0',
              Array.from(
                { length: 50 },
                (_, i) => 'Synthetic reading paragraph ' + i + ' with enough text to measure the reading position.\n\n',
              ).join(''),
            );
            c.finish();
          });
          const scroll = page.locator('.bolt-project-agent-transcript').locator('..');
          const notice = page.locator('.bolt-agent-applied-toast');
          const dock = page.locator('.bolt-agent-applied-notice-dock');
          await expect.poll(() => scroll.evaluate((n) => n.scrollHeight - n.clientHeight)).toBeGreaterThan(500);
          // Geometry setup, not a claim of physical touch-gesture coverage.
          // Record the starting bottom position before moving the real scrollport
          // so the upward scroll is distinguishable from initial layout.
          await expect
            .poll(() => scroll.evaluate((n) => Math.abs(n.scrollHeight - n.clientHeight - n.scrollTop)))
            .toBeLessThanOrEqual(2);
          await scroll.evaluate((n) => {
            n.dispatchEvent(new Event('scroll'));
            n.scrollTop = 500;
            n.dispatchEvent(new Event('scroll'));
          });
          await expect.poll(() => scroll.evaluate((n) => n.scrollTop)).toBe(500);
          await expect(page.locator('.bolt-agent-scroll-to-bottom')).toBeVisible();
          const anchor = await scroll.evaluate((n) => {
            const b = n.getBoundingClientRect();
            const p = [...n.querySelectorAll('p')].find((p) => p.getBoundingClientRect().top >= b.top + 2);
            window.__readingAnchor = p;
            return p.getBoundingClientRect().top;
          });
          await page.evaluate(() => {
            window.__syntheticToast();
            window.__pauseToast();
          });
          await expect(notice).toBeVisible();
          await expect.poll(() => notice.boundingBox().then((b) => b.x >= 0 && b.x + b.width <= width)).toBe(true);
          await page.evaluate(() => window.__pauseToast());
          await expect.poll(() => notice.boundingBox().then((b) => b.height)).toBeGreaterThan(40);
          row.scrollbox = await scroll.boundingBox();
          row.dock = await dock.boundingBox();
          row.notice = await notice.boundingBox();
          expect(row.dock.y).toBeGreaterThanOrEqual(row.scrollbox.y + row.scrollbox.height - 0.5);
          row.readingDrift = await page.evaluate(
            (y) => Math.abs(window.__readingAnchor.getBoundingClientRect().top - y),
            anchor,
          );
          expect(row.readingDrift).toBeLessThanOrEqual(2);
          expect(await dock.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
          await page.screenshot({ path: output + '/' + engine + '-' + width + '-middle.png' });
          await page.getByTestId('mobile-agent-menu-trigger').click();
          await expect(page.getByTestId('mobile-agent-menu-sheet')).toBeVisible();
          await page.getByTestId('mobile-agent-menu-close').click();
          await expect(page.getByTestId('mobile-agent-menu-sheet')).toBeHidden();
          await notice.locator('summary').click();
          await expect(notice.locator('details')).toHaveAttribute('open', '');
          await expect(notice.getByText('src/synthetic-0.tsx', { exact: true })).toBeVisible();
          await notice.locator('summary').click();
          await page.evaluate(() => {
            window.__syntheticToast(false, 6);
            window.__pauseToast();
          });
          await expect(notice.getByText('6 fichiers appliqués', { exact: true })).toBeVisible();
          await notice.getByRole('button', { name: 'Tout annuler', exact: true }).click();
          expect(await page.evaluate(() => window.__syntheticUndo)).toBe(1);
          await notice.getByRole('button', { name: 'Tout fermer', exact: true }).click();
          await expect(notice).toBeHidden();
          await expect.poll(() => dock.boundingBox().then((b) => b.height)).toBe(0);
          await page.locator('.bolt-agent-scroll-to-bottom').click();
          await expect(page.locator('.bolt-agent-scroll-to-bottom')).toBeHidden();
          await page.evaluate(() => {
            window.__syntheticToast(true);
            window.__pauseToast();
          });
          await expect(notice).toBeVisible();
          await expect(notice.locator('.bolt-agent-applied-toast-incomplete')).toContainText('src/main.tsx');
          await expect
            .poll(() => scroll.evaluate((n) => Math.abs(n.scrollHeight - n.clientHeight - n.scrollTop)))
            .toBeLessThanOrEqual(2);
          for (const viewport of [
            { width: 852, height: width },
            { width, height: 450 },
          ]) {
            await page.setViewportSize(viewport);
            await input.focus();
            await expect(input).toBeFocused();
            const sb = await scroll.boundingBox(),
              db = await dock.boundingBox(),
              ib = await input.boundingBox();
            expect(db.y).toBeGreaterThanOrEqual(sb.y + sb.height - 0.5);
            expect(db.y + db.height).toBeLessThanOrEqual(ib.y + 0.5);
            expect(sb.height).toBeGreaterThan(20);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await notice.getByRole('button', { name: 'Tout annuler', exact: true }).click();
            row.viewports ??= [];
            row.viewports.push(
              await page.evaluate(() => {
                const box = (n) => {
                  const b = n.getBoundingClientRect();
                  return { y: b.y, height: b.height, bottom: b.bottom };
                };
                const dock = document.querySelector('.bolt-agent-applied-notice-dock');
                const container = dock.querySelector('.Toastify__toast-container');
                return {
                  width: innerWidth,
                  height: innerHeight,
                  dock: box(dock),
                  container: box(container),
                  overflow: getComputedStyle(container).overflow,
                  buttons: [...dock.querySelectorAll('button')].map(box),
                  jump: box(document.querySelector('.bolt-agent-scroll-to-bottom')),
                };
              }),
            );
            await page.screenshot({
              path: output + '/' + engine + '-' + width + '-' + viewport.width + 'x' + viewport.height + '.png',
            });
          }
          await notice.getByRole('button', { name: 'Tout fermer', exact: true }).click();
          await expect(notice).toBeHidden();
          row.passed = true;
        } catch (error) {
          row.error = String(error);
          await page.screenshot({ path: output + '/' + engine + '-' + width + '-failed.png' });
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
