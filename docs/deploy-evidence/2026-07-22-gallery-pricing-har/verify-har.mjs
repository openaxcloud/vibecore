#!/usr/bin/env node
// P0-LS-13 — TESTS NÉGATIFS fail-closed + vérification de cohérence du manifeste/HAR.
//   node verify-har.mjs
// (1) tests unitaires négatifs des gardes pures (sameValueCarried, assertOkNav) ;
// (2) asserte que le manifeste committé est fail-closed cohérent avec le HAR.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sameValueCarried, assertOkNav, normalizeUrl } from './har-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const fail = (m) => { console.error('ASSERTION FAILED:', m); process.exit(1); };
const eq = (a, b, m) => { if (a !== b) fail(`${m}: attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };
const throws = (fn, m) => { let t = false; try { fn(); } catch { t = true; } if (!t) fail(`${m}: aurait dû lever`); };

// ---- (1) TESTS NÉGATIFS des gardes pures ----
// sameValueCarried : deux nuls / un nul / vides / différents → FALSE ; égal non nul → TRUE
eq(sameValueCarried(null, null), false, 'neg: deux empreintes nulles');
eq(sameValueCarried('abc', null), false, 'neg: sent nul');
eq(sameValueCarried(null, 'abc'), false, 'neg: set nul');
eq(sameValueCarried('', ''), false, 'neg: deux vides');
eq(sameValueCarried('abc', 'def'), false, 'neg: empreintes différentes');
eq(sameValueCarried('abc', 'abc'), true, 'pos: deux empreintes égales non nulles');
// assertOkNav : non-200 rejeté ; URL inattendue rejetée ; slash final normalisé accepté
throws(() => assertOkNav({ key: 't', status: 403, finalUrl: 'https://replit.com/pricing', expectedUrl: 'https://replit.com/pricing' }), 'neg: statut 403');
throws(() => assertOkNav({ key: 't', status: 404, finalUrl: 'https://replit.com/pricing', expectedUrl: 'https://replit.com/pricing' }), 'neg: statut 404');
throws(() => assertOkNav({ key: 't', status: 0, finalUrl: 'https://replit.com/pricing', expectedUrl: 'https://replit.com/pricing' }), 'neg: statut 000');
throws(() => assertOkNav({ key: 't', status: 200, finalUrl: 'https://replit.com/login', expectedUrl: 'https://replit.com/pricing' }), 'neg: URL finale inattendue (redirection login)');
throws(() => assertOkNav({ key: 't', status: 200, finalUrl: 'https://evil.com/pricing', expectedUrl: 'https://replit.com/pricing' }), 'neg: host différent');
assertOkNav({ key: 't', status: 200, finalUrl: 'https://replit.com/pricing/', expectedUrl: 'https://replit.com/pricing' }); // slash final OK
eq(normalizeUrl('https://replit.com/pricing?x=1#h'), 'https://replit.com/pricing', 'normalize enlève query/hash');
console.error('  ✓ tests négatifs des gardes pures OK');

// ---- (2) COHÉRENCE du manifeste committé vs HAR ----
const manifest = JSON.parse(readFileSync(join(HERE, 'context-manifest.json'), 'utf8'));
const harRaw = readFileSync(join(HERE, 'gallery-pricing.har'));
const har = JSON.parse(harRaw);
// le sha256 déclaré == le HAR réel
eq('sha256:' + sha256(harRaw), 'sha256:' + manifest.har.sha256, 'HAR sha256 committé == fichier');
// entryCount déclaré == entrées réelles du HAR
eq(manifest.har.entryCount, har.log.entries.length, 'entryCount manifeste == entrées HAR');
// chaque navigation : statut 200 + domSha == fichier committé
for (const nav of manifest.navigations) {
  eq(nav.httpStatus, 200, `nav ${nav.key} statut 200`);
  eq(nav.harEvidence.responseStatus, 200, `nav ${nav.key} HAR responseStatus 200`);
  const domSha = sha256(readFileSync(join(HERE, nav.domFile)));
  eq(domSha, nav.domSha256, `nav ${nav.key} domSha == fichier ${nav.domFile}`);
}
// liaison : au moins 1 cookie transporté avec 2 empreintes non nulles
for (const c of manifest.cookieLinkage) {
  if (c.sameValueCarried) {
    if (c.valueHashSetDuringSession == null || c.valueHashSentOnPricing == null)
      fail(`cookie ${c.cookie}: sameValueCarried=true avec une empreinte nulle (interdit)`);
  }
}
if ((manifest.cookiesCarriedCount || 0) < 1) fail('aucun cookie transporté (2 empreintes non nulles)');

console.log(JSON.stringify({ negativeTests: 'PASS', harEntryCountMatches: true,
  navsAll200: manifest.navigations.every((n) => n.httpStatus === 200),
  cookiesCarried: manifest.cookiesCarriedCount,
  pricingObsEvidenced: manifest.pricingObservationLinkage?.evidenced?.length ?? 0 }, null, 2));
