#!/usr/bin/env node
// P0-LS-13 — lie MÉCANIQUEMENT Gallery + Pricing dans UNE seule session navigateur,
// de façon FAIL-CLOSED (correction expert V3 §P0-LS-13). Produit dans le MÊME run :
//   - un HAR unique (mode full : Cookie/Set-Cookie) des DEUX navigations ;
//   - les 2 DOM hashés ; un context-manifest.json d'où README/proof sont dérivés.
// Fail-closed : la capture ÉCHOUE (exit ≠ 0) sur erreur de navigation, statut ≠ 200,
// ou URL finale inattendue. sameValueCarried exige 2 empreintes NON NULLES.
import { chromium } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { sameValueCarried, assertOkNav } from './har-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const require = createRequire(import.meta.url);
const YAML = require(join(ROOT, 'node_modules/yaml'));
const RUN_ID = process.env.HAR_RUN_ID || randomUUID();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const PAGES = [
  { key: 'gallery', url: 'https://replit.com/gallery' },
  { key: 'pricing', url: 'https://replit.com/pricing' },
];
const HAR_PATH = join(HERE, 'gallery-pricing.har');

const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const context = await browser.newContext({
  recordHar: { path: HAR_PATH, mode: 'full', content: 'omit' },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
});
const page = await context.newPage();

// teardown fail-safe : ferme browser/context même en cas d'exception (le HAR partiel reste)
async function shutdown() { try { await context.close(); } catch {} try { await browser.close(); } catch {} }
process.on('uncaughtException', async (e) => { console.error('FATAL', e.message); await shutdown(); process.exit(1); });

const captures = [];
try {
  for (const p of PAGES) {
    const startedAt = new Date().toISOString();
    // PAS de try/catch qui avale : une erreur de navigation fait échouer tout le run.
    const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const httpStatus = resp ? resp.status() : null;
    await page.waitForTimeout(4000);
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    // FAIL-CLOSED : statut 200 + URL finale attendue, sinon exception.
    assertOkNav({ key: p.key, status: httpStatus, finalUrl: page.url(), expectedUrl: p.url });
    const dom = await page.content();
    const domSha = sha256(dom);
    writeFileSync(join(HERE, `${p.key}-dom.html`), dom);
    const cookies = await context.cookies();
    const jsCookie = await page.evaluate(() => document.cookie).catch(() => '');
    captures.push({
      key: p.key, url: p.url, finalUrl: page.url(), httpStatus, startedAt,
      capturedAt: new Date().toISOString(), domFile: `${p.key}-dom.html`,
      domSha256: domSha, domBytes: Buffer.byteLength(dom),
      contextCookieNames: cookies.map((c) => c.name).sort(),
      contextCookieCount: cookies.length, documentCookiePresent: jsCookie.length > 0,
    });
    console.error(`[${p.key}] status=${httpStatus} domSha=${domSha.slice(0, 16)}… cookies=${cookies.length}`);
  }
} finally {
  await shutdown(); // FLUSH le HAR
}

// ---- SANITISATION : caviarder les VALEURS de cookies (garder noms + sha256_12) ----
const har = JSON.parse(readFileSync(HAR_PATH, 'utf8'));
const entries = har.log.entries || [];
const h12 = (v) => sha256(v).slice(0, 12);
const sanitize = (name, value) => `${name}=REDACTED(len=${value.length},sha256_12=${h12(value)})`;
for (const e of entries) {
  for (const h of e.request?.headers || []) if (h.name.toLowerCase() === 'cookie') {
    h.value = h.value.split(';').map((c) => { const i = c.indexOf('='); return i < 0 ? c.trim() : sanitize(c.slice(0, i).trim(), c.slice(i + 1).trim()); }).join('; ');
  }
  for (const h of e.response?.headers || []) if (h.name.toLowerCase() === 'set-cookie') {
    const parts = h.value.split(';'); const i = parts[0].indexOf('=');
    if (i >= 0) parts[0] = sanitize(parts[0].slice(0, i).trim(), parts[0].slice(i + 1).trim());
    h.value = parts.join(';');
  }
  for (const c of e.request?.cookies || []) if (c.value) c.value = `sha256_12:${h12(c.value)}`;
  for (const c of e.response?.cookies || []) if (c.value) c.value = `sha256_12:${h12(c.value)}`;
}
writeFileSync(HAR_PATH, JSON.stringify(har, null, 2));
const harSha = sha256(readFileSync(HAR_PATH));

// ---- Liaison cookie par VALEUR (fail-closed : 2 empreintes non nulles) ----
const valueHashOfSetCookie = (name) => {
  for (const e of entries) for (const h of e.response?.headers || [])
    if (h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(name + '=')) {
      const m = h.value.match(/sha256_12=([0-9a-f]{12})/); if (m) return m[1];
    }
  return null;
};
const valueHashOfRequestCookie = (url, name) => {
  const e = entries.find((x) => x.request?.url === url);
  const ck = (e?.request?.headers || []).find((h) => h.name.toLowerCase() === 'cookie');
  if (!ck) return null;
  const seg = ck.value.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  const m = seg && seg.match(/sha256_12=([0-9a-f]{12})/); return m ? m[1] : null;
};
const sharedCookies = ['cf_clearance', '__cf_bm', '_cfuvid'];
const cookieLinkage = sharedCookies.map((name) => {
  const setBy = valueHashOfSetCookie(name);
  const sent = valueHashOfRequestCookie('https://replit.com/pricing', name);
  return { cookie: name, valueHashSetDuringSession: setBy, valueHashSentOnPricing: sent,
    sameValueCarried: sameValueCarried(setBy, sent) };
});
const carriedCount = cookieLinkage.filter((c) => c.sameValueCarried).length;
if (carriedCount === 0) throw new Error('FAIL-CLOSED: aucun cookie transporté avec 2 empreintes non nulles — liaison non prouvée');

function harFactsFor(url) {
  const e = entries.find((x) => x.request?.url === url);
  if (!e) return { found: false };
  const cookieHeader = (e.request.headers || []).find((h) => h.name.toLowerCase() === 'cookie');
  const setCookie = (e.response.headers || []).filter((h) => h.name.toLowerCase() === 'set-cookie');
  return { found: true, requestUrl: e.request.url, responseStatus: e.response.status,
    cookieHeaderPresent: !!cookieHeader,
    cookieHeaderNames: cookieHeader ? cookieHeader.value.split(';').map((c) => c.trim().split('=')[0]).filter(Boolean).sort() : [],
    setCookieCount: setCookie.length };
}

// ---- Rattachement aux observations tarifaires réellement évidencées par CE run ----
const pricingDom = readFileSync(join(HERE, 'pricing-dom.html'), 'utf8');
const priceRegPath = join(ROOT, 'docs/parity/PRICE_OBSERVATION_REGISTRY.yaml');
let pricingObservationLinkage = { note: 'PRICE_OBSERVATION_REGISTRY absent', evidenced: [], notEvidenced: [] };
if (existsSync(priceRegPath)) {
  const preg = YAML.parse(readFileSync(priceRegPath, 'utf8'));
  const obs = preg.observations || Object.values(preg).find(Array.isArray) || [];
  const evidenced = [], notEvidenced = [];
  for (const o of obs) {
    const key = `${o.planId}-${o.amount}-${o.cadence}`;
    const isPricingSrc = (o.sourceUrl || '').includes('replit.com/pricing');
    // évidencé si le montant apparaît en clair dans le DOM pricing de CE run (ex: "$20")
    const amountPresent = o.amount != null && o.amount !== 0 && pricingDom.includes(`$${o.amount}`);
    const rec = { key, planId: o.planId, amount: o.amount, cadence: o.cadence, sourceUrl: o.sourceUrl, amountPresentInThisRunPricingDom: !!amountPresent };
    if (isPricingSrc && amountPresent) evidenced.push(rec); else notEvidenced.push(rec);
  }
  pricingObservationLinkage = {
    note: 'La session HAR évidence DIRECTEMENT les observations dont le montant apparaît dans le DOM pricing de CE run ; les autres conservent leur provenance propre (honnête, non revendiquée par cette session).',
    linkedObservationScanId: 'OBS-DELTA-20260720-13',
    evidenced, notEvidenced,
  };
}

const manifest = {
  p0: 'P0-LS-13',
  purpose: 'Liaison mécanique Gallery↔Pricing FAIL-CLOSED : même session, mêmes cookies (2 empreintes non nulles), DOM hashés, un seul run.',
  runId: RUN_ID, contextSessionId: `har-run-${RUN_ID}`, singleBrowserContext: true,
  browser: { engine: 'chromium', version: browserVersion },
  capturedUtc: new Date().toISOString(),
  har: { file: 'gallery-pricing.har', sha256: harSha, entryCount: entries.length, mode: 'full', contentEmbedded: false },
  navigations: captures.map((c) => ({ ...c, harEvidence: harFactsFor(c.url) })),
  cookieLinkage, cookiesCarriedCount: carriedCount, cookieValuesRedacted: true,
  failClosed: { navRejectsNon200: true, navRejectsUnexpectedUrl: true, linkageRequiresTwoNonNullFingerprints: true },
  pricingObservationLinkage,
};
writeFileSync(join(HERE, 'context-manifest.json'), JSON.stringify(manifest, null, 2));
console.error('MANIFEST written. HAR entries:', entries.length, '| cookies carried:', carriedCount);
console.log(JSON.stringify({ runId: RUN_ID, harSha256: harSha.slice(0, 16), entries: entries.length,
  navsAll200: captures.every((c) => c.httpStatus === 200), cookiesCarried: carriedCount,
  pricingObsEvidenced: pricingObservationLinkage.evidenced?.length ?? 0 }, null, 2));
