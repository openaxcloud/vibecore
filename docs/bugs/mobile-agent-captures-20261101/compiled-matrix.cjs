const fs = require('fs');
const { chromium, webkit, expect } = require('@playwright/test');
const origin = 'http://127.0.0.1:18199';
const blocked = [];
fs.mkdirSync('/workspace/mobile-matrix', { recursive: true });
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
    const b = await type.launch({ executablePath });
    try {
      for (const width of [390, 393, 430]) {
        const p = await b.newPage({ viewport: { width, height: 852 }, isMobile: true, hasTouch: true });
        const row = { engine, width };
        rows.push(row);
        try {
          await setup(p);
          await p.goto(origin + '/projects/synthetic-first/ide?panel=chat', { waitUntil: 'domcontentloaded' });
          const input = p.locator('.bolt-project-agent-composer textarea').filter({ visible: true }).first();
          await expect(input).toBeVisible({ timeout: 30000 });
          await input.fill('Synthetic UI measurement only');
          await p.locator('.bolt-composer-send-button').filter({ visible: true }).click();
          await expect.poll(() => p.evaluate(() => window.__syntheticCalls.length)).toBe(1);
          await p.evaluate(() => {
            const c = window.__syntheticCalls[0];
            c.push('8', [
              {
                type: 'agentOrchestration',
                mode: 'parallel-subagents',
                reason: 'Synthetic',
                roles: [{ id: 'qa', title: 'QA', responsibility: 'Court.' }],
              },
            ]);
            c.push('0', 'Synthetic local response.');
          });
          await p.getByText('Détails techniques', { exact: true }).click();
          const card = p.getByTestId('agent-lane-qa');
          await expect(card).toBeVisible();
          row.running = await card.boundingBox();
          await p.screenshot({ path: '/workspace/mobile-matrix/' + engine + '-' + width + '-running.png' });
          await p.evaluate(() => {
            const c = window.__syntheticCalls[0];
            c.push('8', [
              {
                type: 'agentExecution',
                runId: 'synthetic',
                status: 'partial',
                results: [
                  {
                    roleId: 'qa',
                    status: 'partial',
                    summary: 'The agent emitted actions without a valid report. Execution has not been observed.',
                    outputState: 'actions_without_report',
                    emittedFiles: ['src/App.tsx', 'src/main.tsx'],
                  },
                ],
              },
            ]);
            c.finish();
          });
          await expect(card).toHaveAttribute('data-state', 'partial');
          row.terminal = await card.boundingBox();
          row.metadata = await card
            .getByTestId('agent-lane-output')
            .evaluate((n) => ({ client: n.clientHeight, scroll: n.scrollHeight, text: n.textContent }));
          expect(row.metadata.client).toBe(row.metadata.scroll);
          await p.screenshot({ path: '/workspace/mobile-matrix/' + engine + '-' + width + '-terminal.png' });
          row.doc = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
          expect(row.doc.scroll).toBe(row.doc.width);
          await p.setViewportSize({ width: 852, height: width });
          await expect(input).toBeVisible();
          await p.screenshot({ path: '/workspace/mobile-matrix/' + engine + '-' + width + '-landscape.png' });
          await p.setViewportSize({ width, height: 450 });
          await input.focus();
          await expect(input).toBeFocused();
          row.keyboardSurrogate = true;
          await p.screenshot({ path: '/workspace/mobile-matrix/' + engine + '-' + width + '-short-viewport.png' });
          await p.reload({ waitUntil: 'domcontentloaded' });
          await expect(
            p.locator('.bolt-project-agent-composer textarea').filter({ visible: true }).first(),
          ).toBeVisible();
          row.reload = true;
          await p.setViewportSize({ width, height: 852 });
          await p.getByTestId('mobile-agent-menu-trigger').click();
          await expect(p.getByTestId('mobile-agent-menu-sheet')).toBeVisible();
          await p.getByTestId('mobile-agent-menu-close').click();
          await expect(p.getByTestId('mobile-agent-menu-sheet')).toBeHidden();
          row.modal = true;
          await p.goto(origin + '/projects/synthetic-first/ide?panel=editor', { waitUntil: 'domcontentloaded' });
          await p.goBack({ waitUntil: 'domcontentloaded' });
          await expect(
            p.locator('.bolt-project-agent-composer textarea').filter({ visible: true }).first(),
          ).toBeVisible();
          row.back = true;
        } catch (e) {
          row.error = String(e);
          row.body = (await p.locator('body').innerText()).slice(-2500);
          await p.screenshot({ path: '/workspace/mobile-matrix/' + engine + '-' + width + '-failed.png' });
        }
        await p.close();
        fs.writeFileSync('/workspace/mobile-matrix/receipt.json', JSON.stringify(rows, null, 2));
      }
    } finally {
      await b.close();
    }
  }
  console.log(JSON.stringify(rows, null, 2));
})();
