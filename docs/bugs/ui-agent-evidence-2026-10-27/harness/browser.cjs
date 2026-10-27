// Run from repository root. Uses real compiled UI; only the model stream is synthetic.
const fs = require('node:fs'),
  path = require('node:path');
const { chromium, expect } = require(path.join(process.cwd(), 'node_modules/@playwright/test'));
const origin = process.env.UI_BASE_URL || 'http://127.0.0.1:18199';
const dir = process.env.UI_RECEIPT_DIR || path.join(__dirname, '../browser');
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const rows = [],
    errors = [],
    blocked = [];
  let p;
  try {
    p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') fs.appendFileSync(path.join(dir, 'console.log'), m.text() + '\n');
    });
    await p.context().addCookies([
      { name: 'vc_session', value: 'synthetic-ui', url: origin },
      { name: 'vibecore-lang', value: 'en', url: origin },
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
    await p.goto(origin + '/projects/synthetic-first/ide?panel=editor', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() =>
      Boolean(document.querySelector('.bolt-responsive-ide .bolt-project-agent-composer textarea')),
    );
    const input = p.locator('.bolt-responsive-ide .bolt-project-agent-composer textarea').first();
    const stop = p.getByTestId('project-agent-run-status').getByRole('button');
    const record = async (name, label) => {
      await expect(stop).toHaveAttribute('aria-label', label);
      rows.push({ case: name, label: await stop.getAttribute('aria-label') });
    };
    const send = async (text) => {
      const n = await p.evaluate(() => window.__syntheticCalls.length);
      await input.fill(text);
      await input.press('Enter');
      await expect.poll(() => p.evaluate(() => window.__syntheticCalls.length)).toBe(n + 1);
    };
    const output = async (provider, model, messageId) =>
      p.evaluate(
        ({ provider, model, messageId }) => {
          const c = window.__syntheticCalls.at(-1);
          c.push('8', [{ type: 'modelOutput', provider, model, evidence: 'text-delta', messageId: messageId || c.id }]);
          c.push('0', 'Synthetic text receipt. ');
        },
        { provider, model, messageId },
      );
    await send('Synthetic text only; do not change files');
    await record('new-turn-no-output', 'Stop agent');
    await p.evaluate(() => {
      const c = window.__syntheticCalls.at(-1);
      c.push('8', [
        {
          type: 'basculeFournisseur',
          depuis: { provider: 'Other', model: 'other' },
          vers: { provider: 'Anthropic', model: 'claude' },
          motif: 'credit',
        },
      ]);
      c.push('0', 'Synthetic prose ');
    });
    await record('selection-only', 'Stop agent');
    await output('Anthropic', 'claude-synthetic');
    await record('receipt-received', 'Stop Claude');
    await p.screenshot({ path: path.join(dir, 'receipt-stop.png') });
    await output('SyntheticOther', 'continuation');
    await record('latest-receipt', 'Stop agent');
    await output('Anthropic', 'claude-wrong', 'other-turn');
    await record('wrong-id-ignored', 'Stop agent');
    await p.evaluate(() => window.__syntheticCalls.at(-1).finish());
    await expect(stop).toHaveCount(0);
    await send('Second synthetic turn without receipt');
    await record('second-turn-neutral', 'Stop agent');
    await output('Anthropic', 'claude-second');
    await expect(stop).toHaveAttribute('aria-label', 'Stop Claude');
    await stop.click();
    await expect(stop).toHaveCount(0);
    await p.getByRole('button', { name: 'More agent actions', exact: true }).click();
    await p.getByRole('menuitem', { name: 'Clear history', exact: true }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Clear history', exact: true }).click();
    await expect(p.getByTestId('agent-model-output')).toHaveCount(0);
    await send('Synthetic new turn after clear');
    await record('cleared-thread-new-turn-neutral', 'Stop agent');
    await stop.click();
    await p.goto(origin + '/projects/synthetic-second/ide?panel=editor', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() =>
      Boolean(document.querySelector('.bolt-responsive-ide .bolt-project-agent-composer textarea')),
    );
    await send('Synthetic second project');
    await record('second-project-full-navigation-neutral', 'Stop agent');
    await stop.click();
    await expect(stop).toHaveCount(0);
    await p.screenshot({ path: path.join(dir, 'after-stop.png') });
  } catch (e) {
    rows.push({ failure: String(e) });
    if (p) await p.screenshot({ path: path.join(dir, 'failure.png') });
    throw e;
  } finally {
    fs.writeFileSync(
      path.join(dir, 'receipt.json'),
      JSON.stringify(
        {
          source: process.env.SOURCE_SHA,
          synthetic: true,
          viewport: { width: 1440, height: 1000 },
          language: 'en',
          rows,
          errors,
          blocked,
        },
        null,
        2,
      ),
    );
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
