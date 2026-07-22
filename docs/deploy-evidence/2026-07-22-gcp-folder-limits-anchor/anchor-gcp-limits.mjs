#!/usr/bin/env node
// P0-V3-03 & P0-V4-3 — ancre les constantes « folder-per-tenant mort » (300 enfants,
// 0,1 folder/s) à la SOURCE GCP AUTORITATIVE (docs.cloud.google.com), au lieu de tests
// auto-référentiels. Rejouable : re-fetch la doc live et RÉ-ASSERTE les citations exactes.
//
//   node anchor-gcp-limits.mjs           # re-fetch live + vérifie + réécrit anchor.json
//   node anchor-gcp-limits.mjs --offline # vérifie le HTML committé (sans réseau)
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_URL = 'https://docs.cloud.google.com/resource-manager/docs/limits';
const HTML_FILE = join(HERE, 'gcp-resource-manager-limits.html');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// Citations exactes qui DOIVENT être présentes dans la source (sinon échec).
const QUOTES = [
  { claim: '300 direct child folders', text: 'cannot contain more than 300 folders', p0: ['P0-V3-03', 'P0-V4-3'] },
  { claim: '0.1 folder-create req/s', text: 'Up to 0.1', p0: ['P0-V3-03', 'P0-V4-3'] },
  { claim: '10 nesting levels', text: '10 levels', p0: ['P0-V3-03'] },
];

const offline = process.argv.includes('--offline');
let html;
if (offline) {
  html = readFileSync(HTML_FILE, 'utf8');
} else {
  execSync(`curl -sL --max-time 40 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" ${JSON.stringify(SRC_URL)} -o ${JSON.stringify(HTML_FILE)}`);
  html = readFileSync(HTML_FILE, 'utf8');
}
const htmlSha = sha256(readFileSync(HTML_FILE));

const results = QUOTES.map((q) => {
  const idx = html.indexOf(q.text);
  return { ...q, present: idx >= 0, byteOffset: idx };
});
const missing = results.filter((r) => !r.present);
if (missing.length) {
  console.error('ASSERTION FAILED — citation absente de la source GCP :', missing.map((m) => m.text));
  process.exit(1);
}

const anchor = {
  p0Ids: ['P0-V3-03', 'P0-V4-3'],
  dedup: 'P0-V3-03 et P0-V4-3 revendiquent la MÊME limite folder-per-tenant (300 enfants, 0,1 folder/s) — même source, ancrées ensemble.',
  authoritativeSource: SRC_URL,
  sourceTitle: 'Resource Manager — Limits and quotas (Google Cloud)',
  fetchedUtc: process.env.ANCHOR_UTC || null,
  htmlFile: 'gcp-resource-manager-limits.html',
  htmlSha256: htmlSha,
  htmlBytes: readFileSync(HTML_FILE).length,
  verbatimQuotesPresent: results,
  note: 'Les constantes 300 et 0,1 ne sont plus des tests auto-référentiels : elles sont ancrées verbatim à la doc GCP autoritative. Rejouable via --offline (HTML committé) ou re-fetch live.',
};
writeFileSync(join(HERE, 'anchor.json'), JSON.stringify(anchor, null, 2));
console.log(JSON.stringify({ htmlSha256: htmlSha, quotes: results.map((r) => ({ text: r.text, present: r.present })) }, null, 2));
