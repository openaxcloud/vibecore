import { chromium } from '@playwright/test';
const APP = 'https://e-code.ai';
const { TOKEN, PROJECT } = process.env;
const MOBILE = process.env.MOBILE === '1';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  ...(MOBILE ? { isMobile: true, hasTouch: true } : {}),
});
await context.addCookies([{ name: 'vc_session', value: TOKEN, domain: 'e-code.ai', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
const events = [];
page.on('websocket', (s) => {
  if (!/\/terminal(\?|$)/.test(s.url())) return;
  const id = events.length;
  events.push(`#${id} OPEN`);
  s.on('framereceived', (f) => {
    const p = typeof f.payload === 'string' ? f.payload : '';
    if (/error|WORKSPACE_NOT_STARTED|quota|429|exit|concurrent|limit/i.test(p)) events.push(`#${id} RECV ${p.slice(0, 160)}`);
  });
  s.on('framesent', (f) => {
    const p = typeof f.payload === 'string' ? f.payload : '';
    if (/hello|stdin|resize/i.test(p)) events.push(`#${id} SENT ${p.slice(0, 80)}`);
  });
  s.on('close', () => events.push(`#${id} CLOSE`));
  s.on('socketerror', (e) => events.push(`#${id} SOCKETERR ${e}`));
});
// Also capture the HTTP 101 handshake responses / non-101 for the terminal path.
page.on('response', (r) => {
  if (/\/terminal\?/.test(r.url())) events.push(`HTTP ${r.status()} ${r.statusText()} :: ${r.url().split('?')[0].split('/').slice(-2).join('/')}`);
});

await page.goto(`${APP}/projects/${PROJECT}/ide?panel=terminal`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 40; i += 1) {
  const ok = await page.evaluate(() => !!document.querySelector('.xterm-rows,.xterm-accessibility') && !/Loading E-Code IDE/i.test(document.body.innerText || ''));
  if (ok) break;
  await page.waitForTimeout(3000);
}
await page.waitForTimeout(25000);
console.log('MOBILE:', MOBILE);
console.log('TERMINAL WS EVENTS:');
for (const e of events) console.log(' ', e);
// how many terminal-tabs panels are mounted right now?
const mounts = await page.evaluate(() => ({
  terminalBars: document.querySelectorAll('[data-testid="terminal-tabs-bar"]').length,
  xterms: document.querySelectorAll('.xterm').length,
  mobilePanel: document.querySelectorAll('[data-testid="mobile-terminal-panel"]').length,
  bottomTerminal: document.querySelectorAll('.bolt-project-bottom-terminal').length,
}));
console.log('MOUNTS:', JSON.stringify(mounts));
await browser.close();
