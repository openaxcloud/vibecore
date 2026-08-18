/**
 * Static detector for theme-blind CSS: declarations that paint a SURFACE
 * (background / color / border-color) with a hardcoded colour, in a rule that
 * is not itself scoped to a theme and not a `--token:` definition.
 *
 * Such a declaration renders identically in light and dark — i.e. the element
 * "forgets" the theme. Ranked by how dark/light the literal is, because a
 * near-black or near-white literal is the one that actually becomes unreadable
 * when the opposite theme is active.
 *
 * Usage: node scripts/theme-blind-css.mjs <compiled.css>
 */
import fs from 'node:fs';

const css = fs.readFileSync(process.argv[2], 'utf8');
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

const RULE = /([^{}]+)\{([^{}]*)\}/g;
const SURFACE = /(?:^|;)\s*(background|background-color|color|border-color|border(?:-top|-right|-bottom|-left)?-color|fill|stroke)\s*:\s*([^;]+)/gi;
const HEX = /#([0-9a-f]{3,8})\b/i;
const RGB = /\brgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i;

const themeScoped = (sel) => /\[data-theme|prefers-color-scheme|\.dark\b|\.light\b/.test(sel);

const toRgb = (v) => {
  let m = v.match(HEX);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = v.match(RGB);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
};
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };

const findings = [];
let m;
while ((m = RULE.exec(clean))) {
  const sel = m[1].trim().replace(/\s+/g, ' ');
  const body = m[2];
  if (!sel || sel.startsWith('@')) continue;
  if (themeScoped(sel)) continue;
  if (/^(html|:root)\b/.test(sel) && /--/.test(body)) continue;

  let d;
  const re = new RegExp(SURFACE.source, 'gi');
  while ((d = re.exec(body))) {
    const prop = d[1].toLowerCase();
    const val = d[2].trim();
    if (/var\(|currentcolor|inherit|transparent|initial|unset|none/i.test(val)) continue;
    const rgb = toRgb(val);
    if (!rgb) continue;
    const L = lum(rgb);
    // only literals extreme enough to break in the opposite theme
    if (L > 0.12 && L < 0.75) continue;
    findings.push({ sel, prop, val, L: Math.round(L * 1000) / 1000, kind: L <= 0.12 ? 'DARK' : 'LIGHT' });
  }
}

// group by selector
const bySel = new Map();
for (const f of findings) {
  if (!bySel.has(f.sel)) bySel.set(f.sel, []);
  bySel.get(f.sel).push(f);
}
console.log(`theme-blind surface declarations: ${findings.length} across ${bySel.size} selectors\n`);
const rows = [...bySel.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [sel, fs_] of rows) {
  console.log(`${sel}`);
  for (const f of fs_) console.log(`    [${f.kind}] ${f.prop}: ${f.val}   (L=${f.L})`);
}
