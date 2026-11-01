const fs = require('fs');
const { chromium, webkit, expect } = require('@playwright/test');
const origin = process.env.UI_BASE_URL || 'http://127.0.0.1:18199';
const blocked = [];
const output = process.env.MOBILE_STREAM_EVIDENCE || '/workspace/mobile-multilane-anchor-before';
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
(async () => {
  const rows = [];
  for (const [engine, type, executablePath] of [
    ['chromium', chromium, '/usr/bin/chromium'],
    ['webkit', webkit, '/workspace/.cache/ms-playwright/webkit-2272/pw_run.sh'],
  ]) {
    const browser = await type.launch({ executablePath });
    try {
      for (const width of [390, 430])
        for (const position of ['bottom', 'middle']) {
          const page = await browser.newPage({ viewport: { width, height: 852 }, isMobile: true, hasTouch: true });
          const row = { engine, width, position, steps: [] };
          rows.push(row);
          try {
            await setup(page);
            await page.goto(origin + '/projects/synthetic-first/ide?panel=agent', { waitUntil: 'domcontentloaded' });
            const input = page.locator('.bolt-project-agent-composer textarea').filter({ visible: true }).first();
            await expect(input).toBeVisible();
            // Let the read-only fixture finish its initial history/provider hydration.
            await page.waitForTimeout(1000);
            await input.fill('Synthetic UI measurement only');
            await expect(input).toHaveValue('Synthetic UI measurement only');
            await page.locator('.bolt-composer-send-button').filter({ visible: true }).click();
            await expect.poll(() => page.evaluate(() => window.__syntheticCalls.length)).toBe(1);
            await page.evaluate(() => {
              const call = window.__syntheticCalls[0];
              const roles = Array.from({ length: 12 }, (_, i) => ({
                id: 'specialist-' + i,
                title: 'Spécialiste ' + i,
                responsibility: 'Résumé synthétique en cours.',
              }));
              call.push('8', [
                { type: 'agentOrchestration', mode: 'parallel-subagents', reason: 'synthetic', roles },
                ...roles.map((role) => ({
                  type: 'agentLaneStream',
                  kind: 'start',
                  roleId: role.id,
                  title: role.title,
                })),
              ]);
              call.push('0', 'Synthetic multi-lane evidence.');
            });
            await page.getByText('Détails techniques', { exact: true }).click();
            await expect(page.getByTestId('agent-lane-specialist-11')).toBeVisible();
            const settle = () =>
              page.evaluate(
                () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
              );
            const settleScroll = () =>
              page.evaluate(
                () =>
                  new Promise((resolve, reject) => {
                    const scroll = document.querySelector('.bolt-project-agent-transcript').parentElement;
                    let last = scroll.scrollTop,
                      stable = 0,
                      frames = 0;
                    const sample = () => {
                      const current = scroll.scrollTop;
                      stable = Math.abs(current - last) < 0.1 ? stable + 1 : 0;
                      last = current;
                      if (stable >= 6) return resolve();
                      if (++frames > 180) return reject(new Error('Reader scroll did not settle'));
                      requestAnimationFrame(sample);
                    };
                    requestAnimationFrame(sample);
                  }),
              );
            if (position === 'middle') {
              // PageUp is supported by both engines, including mobile WebKit.
              await page.getByText('Détails techniques', { exact: true }).focus();
              await page.keyboard.press('PageUp');
              await settleScroll();
              await expect(page.locator('.bolt-agent-scroll-dock')).toBeVisible();
              await page.evaluate(() => {
                const transcript = document.querySelector('.bolt-project-agent-transcript');
                const scroll = transcript.parentElement;
                const anchor = document.querySelector('[data-testid="agent-lane-specialist-3"]');
                scroll.scrollTop += anchor.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8;
                scroll.dispatchEvent(new Event('scroll'));
              });
              await expect(page.locator('.bolt-agent-scroll-dock')).toBeVisible();
            } else {
              const jump = page.locator('.bolt-agent-scroll-to-bottom');
              if (await jump.isVisible()) await jump.click();
            }
            await settleScroll();
            await settle();
            const measure = () =>
              page.evaluate(() => {
                const scroll = document.querySelector('.bolt-project-agent-transcript').parentElement;
                const anchor = document.querySelector('[data-testid="agent-lane-specialist-3"]');
                return {
                  top: scroll.scrollTop,
                  height: scroll.scrollHeight,
                  view: scroll.clientHeight,
                  gap: scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop,
                  anchor: anchor.getBoundingClientRect().top,
                  cards: [...document.querySelectorAll('[data-testid^="agent-lane-specialist-"]')].map(
                    (n) => n.getBoundingClientRect().height,
                  ),
                };
              });
            row.initial = await measure();
            for (let index = 0; index < 12; index++) {
              await page.evaluate(
                (index) =>
                  window.__syntheticCalls[0].push('8', [
                    {
                      type: 'agentLaneStream',
                      kind: 'done',
                      roleId: 'specialist-' + index,
                      status: 'complete',
                      summary: 'Terminé.',
                    },
                  ]),
                index,
              );
              await expect(page.getByTestId('agent-lane-specialist-' + index)).toHaveAttribute(
                'data-state',
                'complete',
              );
              await settle();
              row.steps.push({ index, ...(await measure()) });
            }
            await page.evaluate(() => window.__syntheticCalls[0].finish());
            await expect(page.locator('.i-ph\\:stop-circle-bold')).toHaveCount(0);
            await settle();
            row.final = await measure();
            await page.screenshot({ path: output + '/' + engine + '-' + width + '-' + position + '.png' });
            for (const step of [...row.steps, row.final]) {
              if (position === 'bottom') expect(Math.abs(step.gap)).toBeLessThanOrEqual(2);
              else expect(Math.abs(step.anchor - row.initial.anchor)).toBeLessThanOrEqual(2);
            }
            expect(row.final.cards.every((height) => height < row.initial.cards[0])).toBe(true);
          } catch (error) {
            row.error = String(error);
            await page.screenshot({ path: output + '/' + engine + '-' + width + '-' + position + '-failure.png' });
          } finally {
            await page.close();
            fs.writeFileSync(output + '/receipt.json', JSON.stringify(rows, null, 2));
          }
        }
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify(rows, null, 2));
  if (rows.some((row) => row.error)) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
