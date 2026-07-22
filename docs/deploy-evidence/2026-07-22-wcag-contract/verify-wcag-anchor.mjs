#!/usr/bin/env node
// P0-V3-13 — ancre le contrat WCAG 2.2 AA à la spec W3C autoritative et vérifie que le
// contrat E-Code nomme les critères AA. Rejouable :
//   node verify-wcag-anchor.mjs            # re-fetch W3C + vérifie + réécrit anchor.json
//   node verify-wcag-anchor.mjs --offline  # vérifie le HTML committé + le contrat
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const SRC_URL = 'https://www.w3.org/TR/WCAG22/';
const HTML = join(HERE, 'wcag22-w3c.html');
const CONTRACT = join(ROOT, 'docs/parity/ACCESSIBILITY_WCAG_CONTRACT.md');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const fail = (m) => { console.error('ASSERTION FAILED:', m); process.exit(1); };

// Critères AA WCAG 2.2 (verbatim W3C) — DOIVENT être dans la spec ET dans le contrat.
const CRITERIA = [
  '2.4.11 Focus Not Obscured (Minimum)',
  '2.5.7 Dragging Movements',
  '2.5.8 Target Size (Minimum)',
  '3.3.7 Redundant Entry',
  '3.3.8 Accessible Authentication (Minimum)',
];
const SPEC_QUOTES = ['Web Content Accessibility Guidelines (WCAG) 2.2', 'Level AA',
  'Focus Not Obscured (Minimum)', 'Dragging Movements', 'Target Size (Minimum)',
  'Redundant Entry', 'Accessible Authentication (Minimum)'];

if (!process.argv.includes('--offline')) {
  execSync(`curl -sL --max-time 40 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" ${JSON.stringify(SRC_URL)} -o ${JSON.stringify(HTML)}`);
}
const spec = readFileSync(HTML, 'utf8');
const contract = readFileSync(CONTRACT, 'utf8');

const specMissing = SPEC_QUOTES.filter((q) => !spec.includes(q));
if (specMissing.length) fail(`spec W3C ne contient pas: ${specMissing.join(' | ')}`);
// le contrat nomme chaque critère AA (par numéro + libellé)
const contractMissing = CRITERIA.filter((c) => {
  const num = c.split(' ')[0], label = c.slice(num.length + 1);
  return !(contract.includes(num) && contract.includes(label));
});
if (contractMissing.length) fail(`contrat ne nomme pas: ${contractMissing.join(' | ')}`);
if (!/WCAG 2\.2/.test(contract) || !/AA/.test(contract)) fail('contrat ne cible pas WCAG 2.2 AA');

const anchor = {
  p0: 'P0-V3-13',
  contract: 'docs/parity/ACCESSIBILITY_WCAG_CONTRACT.md', contractSha256: sha256(readFileSync(CONTRACT)),
  authoritativeSource: SRC_URL, sourceTitle: 'WCAG 2.2 — W3C Recommendation (2024-12-12)',
  specHtml: 'wcag22-w3c.html', specSha256: sha256(readFileSync(HTML)), specBytes: readFileSync(HTML).length,
  aaCriteriaAnchored: CRITERIA,
  note: 'Contrat WCAG 2.2 AA créé et ancré verbatim à la spec W3C autoritative. La mesure a11y par surface reste UNKNOWN (honnête) mais gouvernée par CTR-A11Y-WCAG-2_2-AA. Échoue si un critère disparaît de la spec ou du contrat.',
};
writeFileSync(join(HERE, 'anchor.json'), JSON.stringify(anchor, null, 2));
console.log(JSON.stringify({ specSha256: anchor.specSha256.slice(0, 16),
  contractSha256: anchor.contractSha256.slice(0, 16), aaCriteriaAnchored: CRITERIA.length }, null, 2));
