const fs = require('fs');
const { chromium, webkit, expect } = require('@playwright/test');
const origin = process.env.UI_BASE_URL || 'http://127.0.0.1:18212';
const blocked = [];
const output = process.env.AUTO_REVIEW_EVIDENCE || '/workspace/auto-review-browser';
fs.mkdirSync(output, { recursive: true });
async function setup(p) {
  await p.context().addCookies([
    { name: 'vc_session', value: 'synthetic-ui', url: origin },
    { name: 'vibecore-lang', value: 'fr', url: origin },
  ]);
  await p.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('vibecore:require-ai-change-review', 'true');
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

const path = require('path');
const assets = path.join(process.cwd(), 'build/client/assets');
const asset = fs.readdirSync(assets).find(n => n.startsWith('workbench-') && n.endsWith('.js'));
const source = fs.readFileSync(path.join(assets, asset), 'utf8');
const alias = source.match(/workbenchStore:([\w$]+)}/)?.[1];
if (!alias) throw new Error('Workbench instrumentation target missing');
const instrumented = source + `\nwindow.__syntheticWorkbench=${alias};`;
(async () => {
  const rows = [];
  for (const [engine, type, executablePath] of [
    ['chromium', chromium, '/usr/bin/chromium'],
    ['webkit', webkit, '/workspace/.cache/ms-playwright/webkit-2272/pw_run.sh'],
  ]) {
    if (process.env.TEST_ENGINE && process.env.TEST_ENGINE !== engine) continue;
    const browser = await type.launch({ executablePath });
    try {
      for (const width of (process.env.TEST_WIDTHS || '390,393,430,1440').split(',').map(Number)) {
        const page = await browser.newPage({ viewport: { width, height: 852 }, isMobile: width < 600, hasTouch: width < 600 });
        await page.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
        const row = { engine, version: browser.version(), width, synthetic: true };
        rows.push(row);
        try {
          await setup(page);
          await page.route('**/api/projects/synthetic-first/ide-state', r => r.request().method() === 'GET'
            ? r.fulfill({ json: { ideState: { state: {}, version: 1 } } })
            : r.fulfill({ status: 503, json: { error: 'Synthetic persistence blocked' } }));
          await page.route('**/' + asset, r => r.fulfill({ body: instrumented, contentType: 'application/javascript' }));
          await page.goto(origin + '/projects/synthetic-first/ide?panel=agent', { waitUntil: 'domcontentloaded' });
          await expect(page.locator('.bolt-project-agent-composer textarea').filter({ visible: true }).first()).toBeVisible({ timeout: 30000 });
          await page.waitForTimeout(1000);
          await page.evaluate(() => {
            const base = { artifactId: 'synthetic-recovery', messageId: 'synthetic-message', actionId: 'file',
              filePath: '/home/project/src/Synthetic.tsx', relativePath: 'src/Synthetic.tsx', originalContent: '',
              proposedContent: "import Missing from './DoesNotExist'; export default Missing;", hunks: [],
              status: 'failed', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
              error: 'Données synthétiques : import manquant, aucun fichier appliqué.' };
            window.__syntheticWorkbench.agentPatchProposals.set({
              safe: { ...base, id: 'safe' },
              conflict: { ...base, id: 'conflict', conflit: true },
              truncated: { ...base, id: 'truncated', tronquee: true },
              restored: { ...base, id: 'restored', relueDeLaBase: true },
            });
          });
          const queue = page.locator('.bolt-project-agent-patch-review').filter({ visible: true }).first();
          await expect(queue).toBeVisible();
          await expect(queue.getByRole('status')).toContainText('4 modifications');
          await page.evaluate(() => { window.__toggles = []; document.addEventListener('toggle', e => { if(e.target.matches('.bolt-project-agent-patch-review details')) window.__toggles.push({time:performance.now(),open:e.target.open,hidden:e.target.querySelector('[hidden]')?.outerHTML.slice(0,200)}); }, true); });
          await queue.locator('summary').first().focus();
          await page.keyboard.press('Enter');
          await expect(queue.locator('details').first()).toHaveAttribute('open', '');
          await expect(queue.getByRole('button', { name: /accepter|rejeter|accept|reject/i })).toHaveCount(0);
          await expect(queue.getByRole('checkbox')).toHaveCount(0);
          const retry = queue.getByRole('button', { name: 'Réessayer cette modification', exact: true });
          await expect(retry).toHaveCount(4);
          await expect(retry.nth(0)).toBeEnabled();
          for (let i = 1; i < 4; i++) await expect(retry.nth(i)).toBeDisabled();
          const lastDetails = queue.locator('.bolt-project-agent-patch-hunks-toggle summary').last();
          await lastDetails.scrollIntoViewIfNeeded();
          await expect(lastDetails).toBeInViewport();
          await lastDetails.focus();
          await page.keyboard.press('Enter');
          await expect(queue.locator('.bolt-project-agent-patch-hunks-toggle').last()).toHaveAttribute('open', '');
          const disclosure = queue.locator('summary').first();
          await disclosure.scrollIntoViewIfNeeded();
          await expect(disclosure).toBeInViewport();
          const bounds = await queue.boundingBox();
          if (!bounds || bounds.x < -1 || bounds.x + bounds.width > width + 1) throw new Error('Recovery queue overflows viewport');
          row.portrait = bounds;
          await page.screenshot({ path: path.join(output, engine + '-' + width + '.png') });
          await page.setViewportSize({ width: 852, height: 393 });
          await expect(queue).toBeVisible();
          await expect(queue.getByRole('button', { name: /accepter|rejeter|accept|reject/i })).toHaveCount(0);
          row.landscapeVisible = true;
          row.result = 'passed';
        } catch (error) { row.error = String(error); row.diagnostic = await page.evaluate(() => ({toggles:window.__toggles, queues:[...document.querySelectorAll('.bolt-project-agent-patch-review')].map(n=>n.outerHTML)})); await page.screenshot({path:path.join(output,engine+'-'+width+'-failure.png')}); process.exitCode = 1; }
        finally { await page.context().tracing.stop({ path: path.join(output, engine + '-' + width + '-' + rows.length + '.zip') }); await page.close(); }
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify({ rows, blocked }, null, 2));
  console.log(JSON.stringify(rows, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
