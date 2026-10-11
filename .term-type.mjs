import { chromium } from '@playwright/test';

const APP = 'https://e-code.ai';
const TOKEN = process.env.TOKEN;
const PROJECT = process.env.PROJECT;
const MOBILE = process.env.MOBILE === '1';
const SHOT = process.env.SHOT || `/tmp/term-type-${MOBILE ? 'mobile' : 'desktop'}.png`;
const MARKER = 'MOBILE_TERM_OK_' + Math.floor(Math.random() * 1e6);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  ...(MOBILE ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {}),
});
await context.addCookies([{ name: 'vc_session', value: TOKEN, domain: 'e-code.ai', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();

const termWs = []; // {t, kind}
page.on('websocket', (s) => {
  if (/\/terminal(\?|$)/.test(s.url())) {
    termWs.push({ t: Date.now(), kind: 'open' });
    s.on('close', () => termWs.push({ t: Date.now(), kind: 'close' }));
  }
});

await page.goto(`${APP}/projects/${PROJECT}/ide?panel=terminal`, { waitUntil: 'domcontentloaded', timeout: 60000 });
// wait for workbench
for (let i = 0; i < 40; i += 1) {
  const ok = await page.evaluate(() => !!document.querySelector('.xterm-rows,.xterm-accessibility') && !/Loading E-Code IDE/i.test(document.body.innerText || ''));
  if (ok) break;
  await page.waitForTimeout(3000);
}
console.log('workbench+xterm present, settling 28s…');
await page.waitForTimeout(28000); // let cold-start seeding + dev-server settle

const settleMark = Date.now();
// Focus the terminal (click the xterm) and type a command.
await page.locator('.xterm, [data-testid="mobile-terminal-panel"] .xterm, .xterm-screen').first().click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(500);
await page.keyboard.type(`echo ${MARKER}`);
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(6000);

const xtermText = await page.evaluate(() => {
  const el = document.querySelector('.xterm-rows') || document.querySelector('.xterm-accessibility');
  return (el?.textContent || '').replace(/ /g, ' ');
});

// flap accounting after settle
const opensAfterSettle = termWs.filter((e) => e.kind === 'open' && e.t >= settleMark).length;
const closesAfterSettle = termWs.filter((e) => e.kind === 'close' && e.t >= settleMark).length;
const totalOpens = termWs.filter((e) => e.kind === 'open').length;

// Command echo appears twice if it worked (the typed line + the echoed output line)
const occurrences = (xtermText.match(new RegExp(MARKER, 'g')) || []).length;
console.log('MARKER:', MARKER);
console.log('totalTerminalOpens:', totalOpens);
console.log('opensAfterSettle(28s+):', opensAfterSettle, 'closesAfterSettle:', closesAfterSettle);
console.log('markerOccurrencesInXterm:', occurrences, '(>=2 means command ran and output printed)');
console.log('xtermTail:', JSON.stringify(xtermText.replace(/\s+/g, ' ').trim().slice(-300)));
await page.screenshot({ path: SHOT });
console.log('SHOT:', SHOT);
await browser.close();
