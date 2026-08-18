/**
 * Theme sweep — WCAG AA contrast audit across themes / viewports / routes.
 *
 * Two stages, because a pure DOM ancestor-walk lies: this codebase paints many
 * surfaces with absolutely-positioned SIBLING overlays (the auth hero gradient,
 * marketing glows), so walking parents reports "white text on the page bg" for
 * text that actually sits on an orange gradient.
 *
 *   1. DOM scan   — every element with its own text node, plus its bbox.
 *   2. Pixel probe — blank all text, screenshot once, sample the real rendered
 *      pixels behind each bbox, and score contrast against that ground truth.
 *
 * Usage: node scripts/theme-sweep.mjs [--routes a,b] [--themes light,dark]
 *        [--viewports mobile,tablet,desktop] [--json out.json]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.SWEEP_BASE ?? 'http://localhost:5173';
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const ALL_VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};
const VIEWPORTS = arg('--viewports', 'mobile,tablet,desktop').split(',').map((n) => ({ name: n, ...ALL_VIEWPORTS[n] }));
const THEMES = arg('--themes', 'light,dark').split(',');
const jsonOut = arg('--json', null);
const ROUTES = arg('--routes', '/,/login,/register,/pricing').split(',');
const authState = arg('--auth', null);

function collectCandidates() {
  const parse = (c) => {
    let m = c && c.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = c && c.match(/^color\(srgb\s+([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const sel = (el) => {
    const parts = [];
    let n = el;
    for (let i = 0; i < 3 && n && n.tagName; i++) {
      let s = n.tagName.toLowerCase();
      if (n.id) {
        s += '#' + n.id;
      } else if (typeof n.className === 'string') {
        const c = n.className.trim().split(/\s+/).slice(0, 3).join('.');
        if (c) s += '.' + c;
      }
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  /*
   * Hidden-ness is INHERITED: the branded boot splash keeps its text at
   * opacity 1 while the wrapper it lives in sits at opacity 0, so checking the
   * element alone reported a fully invisible overlay as a 1.78:1 failure.
   * Walk the ancestors before trusting that an element is on screen.
   */
  const hidden = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      if (parseFloat(cs.opacity) === 0) return true;
      if (n.getAttribute('aria-hidden') === 'true') return true;
      if (n.hasAttribute('inert')) return true;
    }
    return false;
  };

  /*
   * WCAG 1.4.3 exempts "inactive user interface components", so a disabled
   * control is not a violation. The landing page's "Build now" button ships
   * disabled until the prompt has text, and its 40% disabled fill put white on
   * a pale orange at 1.83:1 — flagged as a light-theme defect when it is in
   * fact exempt. Skip disabled controls rather than restyle them.
   */
  const disabled = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.disabled === true) return true;
      if (n.getAttribute('aria-disabled') === 'true') return true;
      if (n.matches && n.matches(':disabled')) return true;
    }
    return false;
  };

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (hidden(el) || disabled(el)) continue;

    /*
     * Content inside role="img" is a single graphic with a text alternative
     * (the /docs feature mockups), not text the user reads — skip it.
     */
    if (el.closest('[role="img"]')) continue;
    let text = '';
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
    text = text.trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) continue;
    /*
     * SVG <text> paints with `fill`, not `color`. Reading `color` reported the
     * inherited token instead of the real ink: the /docs avatar initials are
     * fill="white" in BOTH themes, but `color` followed the theme and made a
     * theme-INVARIANT issue look like a dark-only theme defect.
     */
    const isSvgText = el.ownerSVGElement != null;
    const fg = parse(isSvgText ? cs.fill : cs.color);
    if (!fg || fg.a === 0) continue;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    out.push({
      sel: sel(el),
      text: text.slice(0, 46),
      color: isSvgText ? cs.fill : cs.color,
      fg,
      fontPx: size,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      box: { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height },
    });
  }
  return out;
}

function blankText(on) {
  const id = '__blank_text';
  const existing = document.getElementById(id);
  if (!on) {
    if (existing) existing.remove();
    return 'off';
  }
  if (existing) return 'on';
  const s = document.createElement('style');
  s.id = id;
  s.textContent =
    '*, *::before, *::after { color: transparent !important; text-shadow: none !important; caret-color: transparent !important; -webkit-text-fill-color: transparent !important; }';
  document.head.appendChild(s);
  return 'on';
}

async function samplePixels({ pngB64, boxes }) {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = 'data:image/png;base64,' + pngB64;
  });
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const med = (a) => {
    a.sort((p, q) => p - q);
    return a[Math.floor(a.length / 2)];
  };
  return boxes.map((b) => {
    const x = Math.max(0, Math.round(b.x));
    const y = Math.max(0, Math.round(b.y));
    const w = Math.min(Math.round(b.w), img.width - x);
    const h = Math.min(Math.round(b.h), img.height - y);
    if (w <= 0 || h <= 0) return null;
    const d = ctx.getImageData(x, y, w, h).data;
    const rs = [], gs = [], bs = [];
    const stepX = Math.max(1, Math.floor(w / 40));
    const stepY = Math.max(1, Math.floor(h / 20));
    for (let yy = 0; yy < h; yy += stepY) {
      for (let xx = 0; xx < w; xx += stepX) {
        const i = (yy * w + xx) * 4;
        rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
      }
    }
    if (!rs.length) return null;
    return { r: med(rs), g: med(gs), b: med(bs), n: rs.length };
  });
}

const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a) });

const browser = await chromium.launch();

async function auditPage(page, route) {
  const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
  const status = resp?.status() ?? 0;
  if (status >= 400) return { status, error: 'http ' + status };
  // let entrance transitions and the boot splash settle before sampling
  await page.waitForTimeout(1200);
  const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const cands = await page.evaluate(collectCandidates);
  if (!cands.length) return { status, appliedTheme: applied, byKey: new Map() };

  await page.evaluate(blankText, true);
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await page.evaluate(blankText, false);
  const sampled = await page.evaluate(samplePixels, { pngB64: png.toString('base64'), boxes: cands.map((c) => c.box) });

  const byKey = new Map();
  cands.forEach((c, i) => {
    const bg = sampled[i];
    if (!bg) return;
    const fgc = over(c.fg, bg);
    const r = ratio(fgc, bg);
    const need = c.large ? 3 : 4.5;
    const key = c.sel + '|' + c.text;
    if (byKey.has(key)) return;
    byKey.set(key, {
      sel: c.sel, text: c.text, fontPx: c.fontPx, need,
      ratio: Math.round(r * 100) / 100,
      color: c.color, bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
      pass: r >= need,
    });
  });
  return { status, appliedTheme: applied, byKey };
}

const results = [];
for (const vp of VIEWPORTS) {
  const ctxs = {};
  for (const theme of THEMES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      ...(authState ? { storageState: authState } : {}),
    });
    await ctx.addCookies([{ name: 'ecode_theme', value: theme, url: BASE }]);
    await ctx.addInitScript((t) => { try { localStorage.setItem('bolt_theme', t); } catch {} }, theme);
    ctxs[theme] = { ctx, page: await ctx.newPage() };
  }
  for (const route of ROUTES) {
    const per = {};
    let err = null;
    for (const theme of THEMES) {
      try {
        per[theme] = await auditPage(ctxs[theme].page, route);
        if (per[theme].error) err = per[theme].error;
      } catch (e) { err = String(e.message).slice(0, 160); }
    }
    if (err || !per.light?.byKey || !per.dark?.byKey) {
      results.push({ route, vp: vp.name, error: err ?? 'incomplete' });
      continue;
    }
    const lightMap = per.light.byKey, darkMap = per.dark.byKey;
    const onlyLight = [], onlyDark = [], both = [];
    for (const [k, v] of lightMap) {
      const d = darkMap.get(k);
      if (!v.pass && (!d || d.pass)) onlyLight.push({ ...v, darkRatio: d ? d.ratio : null, darkColor: d ? d.color : null, darkBg: d ? d.bg : null });
      else if (!v.pass && d && !d.pass) both.push({ ...v, darkRatio: d.ratio });
    }
    for (const [k, v] of darkMap) {
      const l = lightMap.get(k);
      if (!v.pass && (!l || l.pass)) onlyDark.push({ ...v, lightRatio: l ? l.ratio : null, lightColor: l ? l.color : null, lightBg: l ? l.bg : null });
    }
    // theme-blind: identical rendered bg AND text colour in both themes
    const blind = [];
    for (const [k, v] of lightMap) {
      const d = darkMap.get(k);
      if (!d) continue;
      if (v.bg === d.bg && v.color === d.color) blind.push({ sel: v.sel, text: v.text, bg: v.bg, color: v.color, ratio: v.ratio, pass: v.pass });
    }
    const sortR = (a, b) => a.ratio - b.ratio;
    results.push({
      route, vp: vp.name,
      appliedLight: per.light.appliedTheme, appliedDark: per.dark.appliedTheme,
      onlyLight: onlyLight.sort(sortR), onlyDark: onlyDark.sort(sortR),
      both: both.sort(sortR), blind,
    });
  }
  for (const theme of THEMES) await ctxs[theme].ctx.close();
}
await browser.close();

let asym = 0, sym = 0;
const errs = [];
for (const r of results) {
  if (r.error) { errs.push(`ERR  ${r.vp.padEnd(7)} ${r.route.padEnd(26)} ${r.error}`); continue; }
  if (r.appliedLight !== 'light' || r.appliedDark !== 'dark') {
    console.log(`WARN theme mismatch ${r.route} ${r.vp}: light=${r.appliedLight} dark=${r.appliedDark}`);
  }
  asym += r.onlyLight.length + r.onlyDark.length;
  sym += r.both.length;
}
for (const e of errs) console.log(e);

console.log(`\n${'='.repeat(78)}`);
console.log(`THEME-ASYMMETRIC failures (fails in ONE theme only) : ${asym}   <-- theme defects`);
console.log(`THEME-INVARIANT failures (fails in BOTH themes)     : ${sym}   <-- brand/AA debt`);
console.log(`${'='.repeat(78)}\n`);

console.log('##################  THEME-ASYMMETRIC (the real theme defects)  ##################');
for (const r of results) {
  if (r.error || (!r.onlyLight.length && !r.onlyDark.length)) continue;
  console.log(`\n### ${r.route}  [${r.vp}]`);
  for (const f of r.onlyLight) {
    console.log(`  LIGHT-ONLY  ${String(f.ratio).padStart(5)}:1 (need ${f.need}, dark=${f.darkRatio})  "${f.text}"`);
    console.log(`      light: color=${f.color} bg=${f.bg}`);
    console.log(`      dark : color=${f.darkColor} bg=${f.darkBg}`);
    console.log(`      ${f.sel}`);
  }
  for (const f of r.onlyDark) {
    console.log(`  DARK-ONLY   ${String(f.ratio).padStart(5)}:1 (need ${f.need}, light=${f.lightRatio})  "${f.text}"`);
    console.log(`      dark : color=${f.color} bg=${f.bg}`);
    console.log(`      light: color=${f.lightColor} bg=${f.lightBg}`);
    console.log(`      ${f.sel}`);
  }
}

console.log('\n\n##################  THEME-BLIND elements failing contrast  ##################');
for (const r of results) {
  if (r.error) continue;
  const bad = r.blind.filter((b) => !b.pass);
  if (!bad.length) continue;
  console.log(`\n### ${r.route}  [${r.vp}]  ${bad.length} identical-in-both-themes failing element(s)`);
  for (const b of bad.slice(0, 10)) {
    console.log(`  ${String(b.ratio).padStart(5)}:1  "${b.text}"  color=${b.color} bg=${b.bg}`);
    console.log(`      ${b.sel}`);
  }
}

console.log('\n\n##################  THEME-INVARIANT AA debt (summary)  ##################');
for (const r of results) {
  if (r.error || !r.both.length) continue;
  console.log(`  ${r.route} [${r.vp}] : ${r.both.length}  worst ${r.both[0].ratio}:1 "${r.both[0].text}"`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
