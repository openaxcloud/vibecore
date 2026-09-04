/**
 * Live certification sweep of the 9 Solutions pages (SOL-01→09) at web/tablet/mobile.
 * For each slug × viewport: HTTP status, <h1> presence, and horizontal-overflow check
 * (documentElement.scrollWidth > innerWidth + 1 ⇒ the page does NOT adapt = FAIL).
 * Screenshots the mobile view of each for visual proof.
 */
const APP = 'https://e-code.ai';
const SLUGS = ['app-builder', 'chatbot-builder', 'dashboard-builder', 'enterprise', 'freelancers', 'game-builder', 'internal-ai-builder', 'startups', 'website-builder'];
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'web', width: 1440, height: 900 },
];
const OUT = '/private/tmp/claude-501/-Users-hb-dev-vibecore/f794b889-897c-44de-8492-2f4820392d0d/scratchpad/sol';
const { chromium } = await import('@playwright/test');
const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const rows = [];
for (const slug of SLUGS) {
  const line = { slug };
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    let status = 0;
    try {
      const resp = await page.goto(`${APP}/solutions/${slug}`, { waitUntil: 'networkidle', timeout: 45000 });
      status = resp?.status() ?? 0;
    } catch { status = -1; }
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const de = document.documentElement;
      return {
        h1: h1 ? (h1.textContent || '').trim().slice(0, 60) : null,
        overflow: de.scrollWidth - window.innerWidth,
        title: document.title.slice(0, 60),
      };
    }).catch(() => ({ h1: null, overflow: 999, title: '' }));
    if (vp.name === 'mobile') {
      await page.screenshot({ path: `${OUT}/${slug}-mobile.png`, fullPage: false }).catch(() => {});
    }
    line[vp.name] = { status, h1: Boolean(info.h1), overflow: info.overflow, ok: status === 200 && Boolean(info.h1) && info.overflow <= 1 };
    if (vp.name === 'web') line.title = info.title;
    await ctx.close();
  }
  line.PASS = line.mobile.ok && line.tablet.ok && line.web.ok;
  rows.push(line);
  console.log(`${line.PASS ? 'PASS' : 'FAIL'} ${slug.padEnd(20)} | web ${line.web.status}/h1:${line.web.h1}/ovf:${line.web.overflow} | tablet ${line.tablet.status}/ovf:${line.tablet.overflow} | mobile ${line.mobile.status}/ovf:${line.mobile.overflow} | ${line.title}`);
}
await browser.close();
const passed = rows.filter((r) => r.PASS).length;
console.log(`\n=== SOLUTIONS LIVE CERT: ${passed}/9 pages PASS (200 + h1 + 0 horizontal overflow on all 3 viewports) ===`);
console.log('screenshots:', OUT);
process.exit(0);
