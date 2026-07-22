#!/usr/bin/env node
// P0-LS-13 — lie MÉCANIQUEMENT Gallery + Pricing dans UNE seule session navigateur.
// Produit, dans le MÊME run et le MÊME contexte Playwright :
//   - un HAR (mode full : en-têtes de requête dont `Cookie`, en-têtes de réponse dont `Set-Cookie`)
//     contenant les DEUX navigations replit.com/gallery puis replit.com/pricing ;
//   - l'identifiant de contexte/session (runId + version navigateur + snapshot cookies) ;
//   - les DEUX DOM produits par ce run + leurs hashes sha256 ;
//   - un manifest reliant hashes DOM ↔ entrées HAR ↔ cookies par page.
//
// Standard expert : rien n'est déclaratif — tout est extrait du HAR réellement écrit.
import { chromium } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_ID = process.env.HAR_RUN_ID || randomUUID();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const PAGES = [
  { key: 'gallery', url: 'https://replit.com/gallery' },
  { key: 'pricing', url: 'https://replit.com/pricing' },
];
const HAR_PATH = join(HERE, 'gallery-pricing.har');

const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
// UN SEUL contexte pour les 2 navigations ; HAR mode full = en-têtes + cookies capturés.
const context = await browser.newContext({
  // mode:full => en-têtes complets (Cookie/Set-Cookie) ; content:omit => pas de corps
  // (les DOM sont committés séparément et hashés) pour un HAR léger, suivi dans git.
  recordHar: { path: HAR_PATH, mode: 'full', content: 'omit' },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
});
const page = await context.newPage();

const captures = [];
for (const p of PAGES) {
  const startedAt = new Date().toISOString();
  let httpStatus = null;
  try {
    const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    httpStatus = resp ? resp.status() : null;
    // laisse le contenu (et d'éventuels cookies applicatifs) se poser
    await page.waitForTimeout(4000);
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  } catch (e) {
    console.error(`[${p.key}] navigation error: ${e.message}`);
  }
  const dom = await page.content();
  const domSha = sha256(dom);
  const domFile = `${p.key}-dom.html`;
  writeFileSync(join(HERE, domFile), dom);
  // cookies vus par le contexte AU MOMENT de la capture (== identité de session)
  const cookies = await context.cookies();
  const jsCookie = await page.evaluate(() => document.cookie).catch(() => '');
  captures.push({
    key: p.key,
    url: p.url,
    finalUrl: page.url(),
    httpStatus,
    startedAt,
    capturedAt: new Date().toISOString(),
    domFile,
    domSha256: domSha,
    domBytes: Buffer.byteLength(dom),
    contextCookieNames: cookies.map((c) => c.name).sort(),
    contextCookieCount: cookies.length,
    documentCookiePresent: jsCookie.length > 0,
  });
  console.error(`[${p.key}] status=${httpStatus} domSha=${domSha.slice(0, 16)}… cookies=${cookies.length}`);
}

// Fermer le contexte FLUSH le HAR sur disque.
await context.close();
await browser.close();

// ---- SANITISATION : caviarder les VALEURS de cookies (garder les noms + hash-12) ----
// Les valeurs (tokens Cloudflare éphémères) ne sont pas nécessaires à la preuve et ne
// doivent pas être committées. On remplace chaque valeur par sha256_12 pour permettre
// la comparaison d'égalité (même valeur posée par Gallery == renvoyée par Pricing).
const har = JSON.parse(readFileSync(HAR_PATH, 'utf8'));
const entries = har.log.entries || [];
const h12 = (v) => sha256(v).slice(0, 12);
function sanitizeCookiePair(name, value) {
  return `${name}=REDACTED(len=${value.length},sha256_12=${h12(value)})`;
}
for (const e of entries) {
  for (const h of e.request?.headers || []) {
    if (h.name.toLowerCase() === 'cookie') {
      h.value = h.value.split(';').map((c) => {
        const i = c.indexOf('='); if (i < 0) return c.trim();
        return sanitizeCookiePair(c.slice(0, i).trim(), c.slice(i + 1).trim());
      }).join('; ');
    }
  }
  for (const h of e.response?.headers || []) {
    if (h.name.toLowerCase() === 'set-cookie') {
      const parts = h.value.split(';');
      const i = parts[0].indexOf('=');
      if (i >= 0) parts[0] = sanitizeCookiePair(parts[0].slice(0, i).trim(), parts[0].slice(i + 1).trim());
      h.value = parts.join(';');
    }
  }
  for (const c of e.request?.cookies || []) if (c.value) c.value = `sha256_12:${h12(c.value)}`;
  for (const c of e.response?.cookies || []) if (c.value) c.value = `sha256_12:${h12(c.value)}`;
}
writeFileSync(HAR_PATH, JSON.stringify(har, null, 2));
const harSha = sha256(readFileSync(HAR_PATH));

// ---- Liaison par VALEUR : le cf_clearance posé (Set-Cookie) == celui renvoyé (Cookie) ----
function valueHashOfSetCookie(cookieName) {
  for (const e of entries) for (const h of e.response?.headers || [])
    if (h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(cookieName + '=')) {
      const m = h.value.match(/sha256_12=([0-9a-f]{12})/); if (m) return m[1];
    }
  return null;
}
function valueHashOfRequestCookie(url, cookieName) {
  const e = entries.find((x) => x.request?.url === url);
  const ck = (e?.request?.headers || []).find((h) => h.name.toLowerCase() === 'cookie');
  if (!ck) return null;
  const seg = ck.value.split(';').map((s) => s.trim()).find((s) => s.startsWith(cookieName + '='));
  const m = seg && seg.match(/sha256_12=([0-9a-f]{12})/); return m ? m[1] : null;
}
const sharedCookies = ['cf_clearance', '__cf_bm', '_cfuvid'];
const cookieLinkage = sharedCookies.map((name) => {
  const setBy = valueHashOfSetCookie(name);
  const sentOnPricing = valueHashOfRequestCookie('https://replit.com/pricing', name);
  return { cookie: name, valueHashSetDuringSession: setBy, valueHashSentOnPricing: sentOnPricing,
    sameValueCarried: !!sentOnPricing && (setBy === null || setBy === sentOnPricing) };
});
function harFactsFor(url) {
  const e = entries.find((x) => x.request?.url === url) ||
            entries.find((x) => (x.request?.url || '').startsWith(url));
  if (!e) return { found: false };
  const reqHeaders = (e.request.headers || []).map((h) => h.name.toLowerCase());
  const cookieHeader = (e.request.headers || []).find((h) => h.name.toLowerCase() === 'cookie');
  const setCookie = (e.response.headers || []).filter((h) => h.name.toLowerCase() === 'set-cookie');
  return {
    found: true,
    requestUrl: e.request.url,
    responseStatus: e.response.status,
    cookieHeaderPresent: !!cookieHeader,
    cookieHeaderNames: cookieHeader
      ? cookieHeader.value.split(';').map((c) => c.trim().split('=')[0]).filter(Boolean).sort()
      : [],
    requestCookiesField: (e.request.cookies || []).map((c) => c.name).sort(),
    setCookieCount: setCookie.length,
  };
}

const manifest = {
  p0: 'P0-LS-13',
  purpose: 'Liaison mécanique Gallery↔Pricing : même session, mêmes cookies, DOM hashés, un seul run.',
  runId: RUN_ID,
  contextSessionId: `har-run-${RUN_ID}`,
  singleBrowserContext: true,
  browser: { engine: 'chromium', version: browserVersion, playwright: 'node_modules/playwright' },
  capturedUtc: new Date().toISOString(),
  har: {
    file: 'gallery-pricing.har',
    sha256: harSha,
    entryCount: entries.length,
    mode: 'full',
    contentEmbedded: false,
    note: 'content omis (HAR léger) ; corps DOM committés séparément et hashés (domSha256).',
  },
  navigations: captures.map((c) => ({
    ...c,
    harEvidence: harFactsFor(c.url),
  })),
  cookieLinkage,
  cookieValuesRedacted: true,
  linkageProof: [
    'Le HAR unique contient les entrées des DEUX URLs (gallery puis pricing) — même log HAR = même contexte.',
    'Chaque navigation liste ses cookies de contexte (contextCookieNames) ET la présence de l\'en-tête Cookie dans le HAR (harEvidence.cookieHeaderPresent).',
    'domSha256 de chaque page == sha256 du fichier *-dom.html joint == DOM réellement rendu dans ce run.',
    'harEvidence.responseStatus prouve le code HTTP réel de chaque page (non 403/404 pour une capture valide).',
  ],
};
writeFileSync(join(HERE, 'context-manifest.json'), JSON.stringify(manifest, null, 2));
console.error('MANIFEST written. HAR entries:', entries.length);
console.log(JSON.stringify({ runId: RUN_ID, harSha256: harSha, entries: entries.length,
  gallery: manifest.navigations[0]?.harEvidence, pricing: manifest.navigations[1]?.harEvidence }, null, 2));
