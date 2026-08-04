/**
 * Evidence generator for the interoperable Agent Skills security audit + progressive
 * disclosure (RPL-SK-001.2 / .3). Runs the REAL modules on the real shipped skill and
 * the malicious fixture, and prints the verdicts, findings, content hashes, and the
 * disclosure trace. Not a test — a reproducible proof artifact.
 *
 *   npx tsx services/api/scripts/skill-audit-proof.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { auditSkill } from '../src/skill-audit.js';
import { SkillDisclosureSession } from '../src/skill-disclosure.js';
import { loadSkillFromFiles, parseSkillManifest } from '../src/skill-manifest.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function line(label: string) {
  console.log(`\n=== ${label} ===`);
}

// 1) Real shipped skill → parse + audit (must be APPROVED, clean).
line('RPL-SK-001.1 — real interop skill .agents/skills/commit-helper/');
const skillMd = read('../../../.agents/skills/commit-helper/SKILL.md');
const refMd = read('../../../.agents/skills/commit-helper/references/conventional-commits.md');
const loaded = loadSkillFromFiles('commit-helper', [
  { path: 'SKILL.md', content: skillMd },
  { path: 'references/conventional-commits.md', content: refMd },
]);

if (!loaded.ok) {
  throw new Error(`real skill failed to parse: ${loaded.errors.join(', ')}`);
}

console.log('name       :', loaded.manifest.name);
console.log('description:', loaded.manifest.description.slice(0, 70), '…');
console.log('resources  :', loaded.manifest.resources.map((r) => `${r.path} (${r.kind}, ${r.bytes}B)`).join(', '));

const benignAudit = auditSkill({
  manifest: loaded.manifest,
  resourceContents: { 'references/conventional-commits.md': refMd },
});
console.log('AUDIT verdict:', benignAudit.verdict.toUpperCase(), '| findings:', benignAudit.findings.length);
console.log('content hash :', `sha256:${benignAudit.contentHash}`);

// 2) Malicious fixture → audit (must be REJECTED, findings printed).
line('RPL-SK-001.3 — malicious skill is REFUSED');
const evilMd = read('../src/tests/fixtures/skills/data-exfiltrator/SKILL.md');
const evilSh = read('../src/tests/fixtures/skills/data-exfiltrator/scripts/collect.sh');
const evilParsed = parseSkillManifest(evilMd, { expectedName: 'data-exfiltrator' });

if (!evilParsed.ok) {
  throw new Error(`fixture failed to parse: ${evilParsed.errors.join(', ')}`);
}

const evilAudit = auditSkill({
  manifest: { ...evilParsed.manifest, resources: [{ path: 'scripts/collect.sh', kind: 'script', bytes: evilSh.length }] },
  resourceContents: { 'scripts/collect.sh': evilSh },
});
console.log('AUDIT verdict:', evilAudit.verdict.toUpperCase(), '(installable:', evilAudit.verdict !== 'rejected', ')');
console.log('content hash :', `sha256:${evilAudit.contentHash}`);
for (const f of evilAudit.findings) {
  console.log(`  - [${f.severity.toUpperCase()}] ${f.code} @ ${f.location}: ${f.title}`);
  console.log(`      evidence: ${f.evidence}`);
}

// 3) Progressive disclosure → trace proving on-demand loading.
line('RPL-SK-001.2 — progressive disclosure trace (on-demand)');
let clock = 0;
const session = new SkillDisclosureSession(
  [
    {
      name: loaded.manifest.name,
      description: loaded.manifest.description,
      resources: loaded.manifest.resources.map((r) => ({ path: r.path, bytes: r.bytes })),
      loadBody: () => loaded.manifest.body,
      loadResource: (p) => (p === 'references/conventional-commits.md' ? refMd : ''),
    },
  ],
  () => `t+${clock++}`,
);

console.log('L1 manifest built (name+description in context):');
console.log(session.contextManifest());
console.log('trace after L1 only:', JSON.stringify(session.trace().map((e) => ({ seq: e.seq, level: e.level }))));

console.log('\nagent triggers the skill → L2 body loads:');
session.open('commit-helper');
console.log('agent opens the reference → L3 resource loads:');
session.openResource('commit-helper', 'references/conventional-commits.md');

console.log('\nfull disclosure trace (level rises only after demand):');
for (const e of session.trace()) {
  console.log(`  seq ${e.seq}  L${e.level}  ${e.skill}${e.resource ? ` / ${e.resource}` : ''}  ${e.bytes}B  @${e.at}`);
}
console.log('bytes by level:', JSON.stringify(session.bytesByLevel()));

line('SUMMARY');
console.log('benign verdict :', benignAudit.verdict, '(expected approved)');
console.log('malicious verdict:', evilAudit.verdict, '(expected rejected)');
console.log('disclosure order:', session.trace().map((e) => `L${e.level}`).join(' → '), '(L1s → L2 → L3)');
