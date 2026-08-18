import { chromium } from '@playwright/test';

const WWW = 'https://e-code.ai';
const APP = 'https://app.e-code.ai';
const PAGES = [
  { nom: 'ide/editor', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=editor` },
  { nom: 'ide/files', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=files` },
  { nom: 'ide/workflows', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=workflows` },
  { nom: 'ide/database', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=database` },
  { nom: 'ide/deployments', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=deployments` },
  { nom: 'ide/git', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=git` },
  { nom: 'ide/security', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=security` },
  { nom: 'ide/skills', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=skills` },
  { nom: 'ide/secrets', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=secrets` },
  { nom: 'ide/object-storage', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=object-storage` },
  { nom: 'ide/terminal', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=terminal` },
  { nom: 'ide/preview', url: `https://app.34.163.208.161.sslip.io/@org-i2poqn16/react-saas-msyekcfa?panel=preview` },
];

const VP = [
  { nom: '390', width: 390, height: 844, mobile: true },
  { nom: '768', width: 768, height: 1024, mobile: false },
  { nom: '1440', width: 1440, height: 900, mobile: false },
];

/*
 * Fond réellement peint sous un texte, SANS test par point : celui-ci renvoie ce
 * qui se trouve derrière tout élément en `pointer-events:none` (un bouton
 * désactivé, un voile décoratif) et, hors écran, le haut de la page. On remonte
 * donc les ancêtres, en tenant compte des frères positionnés en absolu qui
 * recouvrent la boîte du texte — c'est ce cas-là qui donnait un faux
 * « blanc sur blanc » sur le héros de la page de connexion.
 */
const AUDIT = `() => {
  const parse = (s) => { if (!s) return null; let m = s.match(/color\\(srgb\\s+([^)]+)\\)/);
    if (m) { const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0,3).map(v=>v*255), a: p.length>3?p[3]:1 }; }
    m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0,3), a: p.length>3?p[3]:1 }; };
  const compose = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
  const lum = (c) => { const s = c.map((v) => { const x = v/255; return x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); }); return 0.2126*s[0]+0.7152*s[1]+0.0722*s[2]; };
  const couvre = (a, b) => a.left <= b.left + 1 && a.right >= b.right - 1 && a.top <= b.top + 1 && a.bottom >= b.bottom - 1;

  const fondDe = (el) => {
    const boite = el.getBoundingClientRect();
    const couches = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const st = getComputedStyle(n);
      if (st.backgroundImage && st.backgroundImage !== 'none') return null;
      // Un frère absolu qui recouvre le texte peint AVANT le fond de l'ancêtre.
      for (const enfant of n.children) {
        if (enfant === el || enfant.contains(el)) continue;
        const se = getComputedStyle(enfant);
        if (se.position !== 'absolute' && se.position !== 'fixed') continue;
        if (!couvre(enfant.getBoundingClientRect(), boite)) continue;
        if (se.backgroundImage && se.backgroundImage !== 'none') return null;
        const ce = parse(se.backgroundColor);
        if (ce && ce.a > 0) { couches.push(ce); if (ce.a === 1) { let b = [255,255,255]; for (let i = couches.length-1; i >= 0; i--) b = compose(couches[i], b); return b; } }
      }
      const c = parse(st.backgroundColor);
      if (c && c.a > 0) { couches.push(c); if (c.a === 1) break; }
      n = n.parentElement;
    }
    let b = [255, 255, 255];
    for (let i = couches.length - 1; i >= 0; i--) b = compose(couches[i], b);
    return b;
  };

  const out = []; const vus = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  let total = 0;
  while ((n = w.nextNode())) {
    const t = n.textContent.trim(); if (t.length < 2) continue;
    const el = n.parentElement; if (!el || vus.has(el)) continue; vus.add(el);
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.1) continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    if (el.closest('.sr-only') || st.clip === 'rect(0px, 0px, 0px, 0px)') continue;
    const fg = parse(st.color); if (!fg || fg.a === 0) continue;
    total++;
    const bg = fondDe(el); if (!bg) continue;
    const fgc = compose(fg, bg);
    const l1 = lum(fgc), l2 = lum(bg);
    const cr = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const taille = parseFloat(st.fontSize); const gras = Number(st.fontWeight) >= 700;
    const seuil = taille >= 24 || (taille >= 18.66 && gras) ? 3 : 4.5;
    if (cr < seuil) out.push({ t: t.slice(0,50), ratio: Number(cr.toFixed(2)), seuil, couleur: st.color,
      fond: 'rgb(' + bg.map(Math.round).join(',') + ')',
      sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '') });
  }
  return { total, defauts: out };
}`;

const { readFile } = await import('node:fs/promises');
const storageState = JSON.parse(await readFile('/private/tmp/claude-501/-Users-hb-dev-vibecore/5e5f91e5-bd6e-4d18-815b-edf5cac00150/scratchpad/audit-session.json', 'utf8'));
const browser = await chromium.launch();
for (const p of PAGES) {
  for (const theme of ['light', 'dark']) {
    for (const vp of VP) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 2, colorScheme: theme, ignoreHTTPSErrors: true, storageState });
      for (const d of ['app.e-code.ai', 'e-code.ai', '34.163.208.161.sslip.io']) await ctx.addCookies([{ name: 'ecode_theme', value: theme, domain: d, path: '/' }]).catch(() => {});
      const page = await ctx.newPage();
      const label = `${p.nom} ${theme} ${vp.nom}`;
      try {
        await page.addInitScript((t) => { try { localStorage.setItem('bolt_theme', t); } catch {} }, theme);
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(14000);
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } window.scrollTo(0, 0); });
        await page.waitForTimeout(600);
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(1200);
        const dt = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        const { total, defauts } = await page.evaluate(`(${AUDIT})()`);
        if (!defauts.length) console.log(`OK   ${label} (dt=${dt}, ${total} textes)`);
        else {
          console.log(`FAIL ${label} (dt=${dt}) — ${defauts.length}/${total}`);
          const vus = new Set();
          for (const d of defauts) { const k = `${d.couleur}|${d.fond}`; if (vus.has(k)) continue; vus.add(k);
            console.log(`       ${d.ratio}/${d.seuil} "${d.t}" ${d.couleur} sur ${d.fond} [${d.sel}]`); }
        }
      } catch (e) { console.log(`ERR  ${label}: ${e.message.split('\n')[0].slice(0, 70)}`); }
      await ctx.close();
    }
  }
}
await browser.close();
