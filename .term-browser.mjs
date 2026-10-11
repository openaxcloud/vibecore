import { chromium } from '@playwright/test';

const APP = 'https://e-code.ai';
const TOKEN = process.env.TOKEN;
const PROJECT = process.env.PROJECT;
const MOBILE = process.env.MOBILE === '1';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  ...(MOBILE ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {}),
});
await context.addCookies([
  { name: 'vc_session', value: TOKEN, domain: 'e-code.ai', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
]);
const page = await context.newPage();

const csp = [];
page.on('console', (m) => {
  const t = m.text();
  if (/content security policy|refused to connect|websocket|terminal|wss:|api\.e-code/i.test(t)) csp.push(`[console.${m.type()}] ${t}`);
});
page.on('pageerror', (e) => csp.push(`[pageerror] ${String(e).slice(0, 200)}`));
page.on('requestfailed', (r) => {
  if (/terminal|runtime|wss?:/i.test(r.url())) csp.push(`[requestfailed] ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`);
});
const wsEvents = [];
page.on('websocket', (ws) => {
  if (/terminal|runtime/i.test(ws.url())) {
    wsEvents.push(`[ws.open] ${ws.url().slice(0, 110)}`);
    ws.on('close', () => wsEvents.push(`[ws.close] ${ws.url().slice(0, 80)}`));
    ws.on('socketerror', (e) => wsEvents.push(`[ws.error] ${e}`));
  }
});

await page.goto(`${APP}/projects/${PROJECT}/ide`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000); // let the app boot

// Run the EXACT terminal client handshake inside the real page (real CSP/origin/WebSocket).
const result = await page.evaluate(async (projectId) => {
  const out = { steps: [], frames: [], opened: false, error: null, base: null };
  try {
    const tokRes = await fetch('/api/runtime-token', { headers: { accept: 'application/json' } });
    out.steps.push('runtime-token ' + tokRes.status);
    const tok = (await tokRes.json()).token;
    // Baked runtime base (confirmed in the deployed bundle).
    const base = 'https://api.e-code.ai/api/runtime';
    out.base = base;
    const origin = location.origin;
    const u = new URL(`${base}/workspaces/${projectId}/terminal`, origin);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.searchParams.set('sessionId', 'browser-repro');
    u.searchParams.set('cols', '80');
    u.searchParams.set('rows', '24');
    u.searchParams.set('token', tok);
    out.steps.push('opening ' + u.toString().replace(tok, 'TOKEN'));
    await new Promise((resolve) => {
      let ws;
      try {
        ws = new WebSocket(u.toString());
      } catch (e) {
        out.error = 'construct: ' + String(e);
        return resolve();
      }
      const done = () => {
        try { ws.close(); } catch {}
        resolve();
      };
      const timer = setTimeout(() => { out.steps.push('timeout'); done(); }, 12000);
      ws.onopen = () => {
        out.opened = true;
        out.steps.push('WS OPEN');
        setTimeout(() => ws.send(JSON.stringify({ type: 'stdin', data: 'echo BROWSER_TERMINAL_OK\r' })), 1200);
      };
      ws.onmessage = (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : '';
        out.frames.push(raw.slice(0, 200));
        if (raw.includes('BROWSER_TERMINAL_OK') && out.frames.length > 1) { clearTimeout(timer); done(); }
      };
      ws.onerror = () => { out.steps.push('WS ERROR event'); };
      ws.onclose = (e) => { out.steps.push('WS CLOSE ' + e.code); };
    });
  } catch (e) {
    out.error = String(e);
  }
  return out;
}, PROJECT);

console.log('MOBILE:', MOBILE);
console.log('BASE:', result.base);
console.log('STEPS:', JSON.stringify(result.steps, null, 1));
console.log('OPENED:', result.opened);
console.log('FRAME_COUNT:', result.frames.length);
console.log('SAW_MARKER:', result.frames.join('').includes('BROWSER_TERMINAL_OK'));
console.log('EVAL_ERROR:', result.error);
console.log('CONSOLE_CSP_LINES:', JSON.stringify(csp, null, 1));
console.log('WS_EVENTS:', JSON.stringify(wsEvents, null, 1));
await browser.close();
