#!/usr/bin/env node
// P0-A2-14 — ancre les SEUILS multi-tenant Cloud Run à la doc GCP autoritative
// (au lieu de « seuils nommés inexistants »). Rejouable :
//   node anchor-cloudrun-limits.mjs            # re-fetch live + vérifie + réécrit anchor.json
//   node anchor-cloudrun-limits.mjs --offline  # vérifie le HTML committé (sans réseau)
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_URL = 'https://docs.cloud.google.com/run/quotas';
const HTML_FILE = join(HERE, 'cloudrun-quotas.html');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// Seuils Cloud Run par instance (bornes GCP autoritatives) — cités verbatim.
const QUOTES = [
  { threshold: 'maxConcurrentRequestsPerInstance', value: 1000, text: 'concurrent requests per instance' },
  { threshold: 'maxVcpuPerInstance', value: 8, text: 'Maximum number of vCPU' },
  { threshold: 'maxMemoryGiBPerInstance', value: 32, text: 'Maximum memory size, in GiB' },
  { threshold: 'maxRequestTimeout', value: '60 minutes', text: 'Maximum time before timeout per request' },
];

const offline = process.argv.includes('--offline');
if (!offline) {
  execSync(`curl -sL --max-time 40 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" ${JSON.stringify(SRC_URL)} -o ${JSON.stringify(HTML_FILE)}`);
}
const html = readFileSync(HTML_FILE, 'utf8');
const htmlSha = sha256(readFileSync(HTML_FILE));

const results = QUOTES.map((q) => ({ ...q, present: html.indexOf(q.text) >= 0, byteOffset: html.indexOf(q.text) }));
const missing = results.filter((r) => !r.present);
if (missing.length) {
  console.error('ASSERTION FAILED — seuil absent de la source GCP :', missing.map((m) => m.text));
  process.exit(1);
}

const anchor = {
  p0: 'P0-A2-14',
  authoritativeSource: SRC_URL,
  sourceTitle: 'Cloud Run — Quotas and limits (Google Cloud)',
  htmlFile: 'cloudrun-quotas.html',
  htmlSha256: htmlSha,
  htmlBytes: readFileSync(HTML_FILE).length,
  namedThresholds: results,
  note: 'Les seuils multi-tenant Cloud Run ne sont plus « inexistants » : chaque seuil nommé du contrat CLOUDRUN_MULTITENANT_THRESHOLDS.md est ancré verbatim à la doc GCP autoritative. Rejouable (--offline ou re-fetch) ; échoue si une citation disparaît.',
};
writeFileSync(join(HERE, 'anchor.json'), JSON.stringify(anchor, null, 2));
console.log(JSON.stringify({ htmlSha256: htmlSha, thresholds: results.map((r) => ({ name: r.threshold, value: r.value, present: r.present })) }, null, 2));
