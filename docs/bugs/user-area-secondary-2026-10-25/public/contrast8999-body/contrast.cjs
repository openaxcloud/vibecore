const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const base = process.env.UI_BASE_URL;
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Explicit local base required');
const out = { base, language: 'fr', cases: [], mutations: [], errors: [] };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  for (const theme of ['light', 'dark']) for (const width of [320, 1440]) {
    const c = await browser.newContext({ viewport: { width, height: 900 } });
    await c.addCookies([{ name: 'ecode_theme', value: theme, url: base }]);
    await c.route('**/*', r => {
      if (new URL(r.request().url()).origin !== base || r.request().method() !== 'GET') {
        if (r.request().method() !== 'GET') out.mutations.push(r.request().url());
        return r.abort();
      }
      return r.continue();
    });
    const p = await c.newPage();
    p.on('pageerror', e => out.errors.push(e.message));
    for (const route of ['/', '/pricing', '/login', '/signup']) {
      await p.goto(base + route + '?lang=fr', { waitUntil: 'networkidle' });
      await p.getByRole('heading', { level: 1 }).first().waitFor();
      await p.waitForTimeout(1000);
      await expect(p.locator('html')).toHaveAttribute('data-theme', theme);
      const initialDom = await p.evaluate(() => ({ height: document.documentElement.scrollHeight, elements: document.body.querySelectorAll('*').length }));
      let steps = 0, stableBottom = 0;
      for (; steps < 180; steps++) {
        const atBottom = await p.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
        stableBottom = atBottom ? stableBottom + 1 : 0;
        if (stableBottom >= 3) break;
        await p.evaluate(() => window.scrollBy({ top: Math.max(240, innerHeight * .75), behavior: 'instant' }));
        await p.waitForTimeout(150);
      }
      const warmup = await p.evaluate(() => ({ height: document.documentElement.scrollHeight, elements: document.body.querySelectorAll('*').length, reachedBottom: scrollY + innerHeight >= document.documentElement.scrollHeight - 2, sections: [...document.querySelectorAll('[data-testid^="section-"]')].map(e => e.getAttribute('data-testid')) }));
      expect(warmup.reachedBottom).toBe(true);
      const expectedSections = ['section-stats', 'section-video-demo', 'section-projects', 'section-templates', 'section-features', 'section-languages', 'section-workflow', 'section-testimonials', 'section-cta'];
      if (route === '/') for (const id of expectedSections) await expect(p.getByTestId(id)).toHaveCount(1);
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await p.waitForTimeout(1000);
      const rootSelector = 'body';
      const contrast = await p.locator(rootSelector).first().evaluate(root => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
        const lum = color => color.slice(0, 3).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const intersect = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const measured = [], excluded = [];
        const candidates = [...root.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
        for (const [index, e] of candidates.entries()) {
          const region = e.closest('header') ? 'header' : e.closest('footer') ? 'footer' : 'content';
          const rect = e.getBoundingClientRect();
          if (!rect.width || !rect.height) { excluded.push({ region, reason: 'not rendered', text: e.textContent.trim().slice(0, 100) }); continue; }
          const st = getComputedStyle(e), chain = [];
          for (let n = e; n; n = n.parentElement) chain.push(n);
          const reasons = [];
          if (e.namespaceURI === 'http://www.w3.org/2000/svg') reasons.push('SVG text paint not modeled');
          if (chain.some(n => { const style = getComputedStyle(n); return style.clip !== 'auto' || style.clipPath !== 'none'; })) reasons.push('visually clipped text');
          if (e.closest('[disabled],[aria-disabled=true]')) reasons.push('disabled control');
          if (chain.some(n => getComputedStyle(n).visibility === 'hidden')) reasons.push('hidden text');
          if (chain.some(n => getComputedStyle(n).backgroundImage !== 'none')) reasons.push('gradient/image in ancestor chain');
          if (chain.some(n => Number(getComputedStyle(n).opacity) < 1)) reasons.push('opacity in ancestor chain');
          const foreground = rgb(st.color);
          if (foreground[3] < 255) reasons.push('foreground alpha');
          const nearestOpaque = chain.find(n => rgb(getComputedStyle(n).backgroundColor)[3] === 255);
          if (!nearestOpaque) reasons.push('no explicit opaque background');
          const authRoot = e.closest('.vc-auth-page');
          if (authRoot && (!nearestOpaque || nearestOpaque === authRoot || !authRoot.contains(nearestOpaque))) reasons.push('auth glow/translucent region without an opaque covering surface');
          for (let level = 1; level < chain.length; level++) {
            const parent = chain[level], branch = chain[level - 1];
            for (const layer of parent.children) {
              if (layer === branch || layer.contains(e)) continue;
              const style = getComputedStyle(layer);
              if (!['absolute', 'fixed'].includes(style.position) || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
              const paint = style.backgroundImage !== 'none' || (Number(style.opacity) < 1 && rgb(style.backgroundColor)[3] > 0);
              if (!paint || !intersect(rect, layer.getBoundingClientRect())) continue;
              const branchStyle = getComputedStyle(branch);
              const above = branchStyle.position !== 'static' && Number.parseFloat(branchStyle.zIndex) > (Number.parseFloat(style.zIndex) || 0);
              const covered = nearestOpaque && branch.contains(nearestOpaque) && above;
              if (!covered) reasons.push('overlapping decorative layer / uncertain painted background');
            }
          }
          const item = { index, region, tag: e.tagName, className: e.className, text: e.textContent.trim().slice(0, 160), color: st.color, font: st.fontSize, weight: st.fontWeight, nearestOpaque: nearestOpaque ? { tag: nearestOpaque.tagName, className: nearestOpaque.className, color: getComputedStyle(nearestOpaque).backgroundColor } : null };
          if (reasons.length) { excluded.push({ ...item, reasons: [...new Set(reasons)] }); continue; }
          let bg = [255, 255, 255, 255];
          for (const n of [...chain].reverse()) { const col = rgb(getComputedStyle(n).backgroundColor), a = col[3] / 255; bg = bg.map((v, i) => i < 3 ? col[i] * a + v * (1 - a) : 255); }
          const a = foreground[3] / 255, actual = foreground.map((v, i) => i < 3 ? v * a + bg[i] * (1 - a) : 255);
          const ratio = (Math.max(lum(actual), lum(bg)) + .05) / (Math.min(lum(actual), lum(bg)) + .05);
          const fontSize = Number.parseFloat(st.fontSize), fontWeight = Number.parseFloat(st.fontWeight) || 400;
          const threshold = fontSize >= 24 || (fontSize >= 18.6667 && fontWeight >= 700) ? 3 : 4.5;
          e.setAttribute('data-ui-contrast-id', String(index));
          measured.push({ ...item, background: bg, ratio, threshold, failing: ratio < threshold });
        }
        const exclusionReasons = {};
        for (const item of excluded) for (const reason of item.reasons || [item.reason]) exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
        return { candidates: candidates.length, count: measured.length, min: measured.length ? Math.min(...measured.map(x => x.ratio)) : null, measured, excluded, exclusionReasons, failures: measured.filter(x => x.failing), below45: measured.filter(x => x.ratio < 4.5) };
      });
      out.cases.push({ route, theme, width, rootSelector, initialDom, warmup: { ...warmup, steps }, contrast });
      console.log(route, theme, width, 'measured', contrast.count, 'excluded', contrast.excluded.length, 'failures', contrast.failures.length);
      if (contrast.failures.length) console.log(JSON.stringify({ route, theme, width, failures: contrast.failures }, null, 2));
      for (const item of contrast.failures.slice(0, 4)) await p.locator(`[data-ui-contrast-id="${item.index}"]`).screenshot({ path: `/tmp/ui-public-contrast-body/${route.slice(1) || 'home'}-${theme}-${width}-${item.index}.png` });
    }
    await c.close();
  }
  await browser.close();
  fs.writeFileSync('/tmp/ui-public-contrast-body/receipt.json', JSON.stringify(out, null, 2));
})().catch(e => { fs.writeFileSync('/tmp/ui-public-contrast-body/receipt.json', JSON.stringify(out, null, 2)); console.error(e); process.exit(1); });
