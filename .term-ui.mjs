import { chromium } from '@playwright/test';

const APP = 'https://e-code.ai';
const TOKEN = process.env.TOKEN;
const PROJECT = process.env.PROJECT;
const MOBILE = process.env.MOBILE === '1';
const SHOT = process.env.SHOT || `/tmp/term-ui-${MOBILE ? 'mobile' : 'desktop'}.png`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  ...(MOBILE
    ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
    : {}),
});
await context.addCookies([
  { name: 'vc_session', value: TOKEN, domain: 'e-code.ai', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
]);
const page = await context.newPage();

const ws = [];
page.on('websocket', (s) => {
  const u = s.url();
  if (/terminal|runtime|collaboration/i.test(u)) {
    const tag = /terminal/.test(u) ? 'TERMINAL' : /collaboration/.test(u) ? 'COLLAB' : /files\/watch/.test(u) ? 'files' : /ports\/watch/.test(u) ? 'ports' : 'runtime';
    ws.push(`open ${tag} ${u.split('?')[0].replace('https://', '').replace('wss://', '')}`);
    s.on('close', () => ws.push(`close ${tag}`));
    s.on('socketerror', (e) => ws.push(`error ${tag} ${e}`));
  }
});
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (/terminal|shell|websocket|runtime|spawn/i.test(t)) errs.push(t.slice(0, 160)); } });

const IDE_URL = `${APP}/projects/${PROJECT}/ide${MOBILE ? '?panel=terminal' : ''}`;
await page.goto(IDE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
// Wait for the IDE workbench to leave the "Loading E-Code IDE" skeleton (cold workspace boot).
let booted = false;
for (let i = 0; i < 40; i += 1) {
  const state = await page.evaluate(() => {
    const loading = /Loading E-Code IDE/i.test(document.body.innerText || '');
    const hasWorkbench = !!document.querySelector('[data-testid="terminal-tabs-bar"], [class*="bolt-terminal"], [data-testid="mobile-terminal-panel"], [class*="FileTree"], [aria-label="Interactive terminal"]');
    return { loading, hasWorkbench };
  });
  if (!state.loading || state.hasWorkbench) { booted = true; break; }
  await page.waitForTimeout(3000);
}
console.log('bootedAfterWait:', booted);
await page.waitForTimeout(3000);

async function tryOpenTerminal() {
  // 1) Mobile: tap the "Toggle Shell (Terminal)" control; if hidden, open the overflow menu first.
  if (MOBILE) {
    const clicks = [];
    const tryClick = async (sel) => {
      const el = page.locator(sel).first();
      if (await el.count().catch(() => 0)) {
        const ok = await el.click({ timeout: 3000 }).then(() => true).catch(() => false);
        clicks.push(`${sel}:${ok}`);
        return ok;
      }
      clicks.push(`${sel}:absent`);
      return false;
    };
    // Direct button (exact aria-label seen in DOM).
    let opened = await tryClick('[aria-label="Toggle Shell (Terminal)"]');
    if (!opened) {
      // Try opening the bottom "⋮" overflow menu then the terminal entry.
      await tryClick('button[aria-label*="more" i]');
      await tryClick('button[aria-label*="menu" i]');
      await page.waitForTimeout(800);
      opened = (await tryClick('[aria-label="Toggle Shell (Terminal)"]')) ||
        (await tryClick('button:has-text("Terminal")')) ||
        (await tryClick('button:has-text("Shell")'));
    }
    await page.waitForTimeout(1200);
    return `mobile clicks: ${clicks.join(' | ')}`;
  }
  // 2) Desktop: keyboard toggle, then look for terminal controls.
  await page.keyboard.press('Control+`').catch(() => {});
  await page.waitForTimeout(1500);
  for (const sel of ['[data-testid="terminal-tabs-bar"]', 'button[aria-label*="erminal" i]', 'button:has-text("Terminal")']) {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0)) { await el.scrollIntoViewIfNeeded().catch(() => {}); return `found ${sel}`; }
  }
  return 'no explicit terminal control found';
}

const openResult = await tryOpenTerminal();
await page.waitForTimeout(9000); // let the terminal attach + connect

// Read xterm content (rows text) if present.
const xterm = await page.evaluate(() => {
  const rows = document.querySelector('.xterm-rows');
  const acc = document.querySelector('.xterm-accessibility');
  const text = (rows?.textContent || acc?.textContent || '').replace(/ /g, ' ').trim();
  const panels = [...document.querySelectorAll('[data-testid*="terminal"],[aria-label*="terminal" i],[class*="terminal"]')].map((e) => e.getAttribute('data-testid') || e.getAttribute('aria-label') || e.className).slice(0, 8);
  return { text: text.slice(0, 600), hasXterm: !!(rows || acc), panels };
});

console.log('MOBILE:', MOBILE);
console.log('openResult:', openResult);
console.log('WS:', JSON.stringify(ws, null, 1));
console.log('hasXterm:', xterm.hasXterm);
console.log('xtermText:', JSON.stringify(xterm.text));
console.log('panelsSeen:', JSON.stringify(xterm.panels));
console.log('errs:', JSON.stringify(errs, null, 1));
await page.screenshot({ path: SHOT, fullPage: false });
console.log('SHOT:', SHOT);
await browser.close();
