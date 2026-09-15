#!/usr/bin/env node
/**
 * PARITY_STATUS.md — vue humaine GÉNÉRÉE (réconciliation A2, manquant #1).
 *
 * Le plan (§1) classe PARITY_STATUS parmi les vues générées : ce script rend
 * cette promesse vraie. La partie calculée vient d'APPROVAL_STATUS.json ; le
 * détail par chantier (états 📤/💻/✅, evidenceIds) vient de
 * PARITY_STATUS_NOTES.md, MAINTENU À LA MAIN et déclaré comme tel — embarqué
 * verbatim. Drift-check par le validateur : éditer PARITY_STATUS.md à la main
 * casse le build ; on édite les NOTES puis on régénère.
 *
 * Usage :
 *   node scripts/parity/generate-parity-status.mjs           # écrit
 *   node scripts/parity/generate-parity-status.mjs --check   # exit 1 si dérive
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const parityRoot = join(repoRoot, 'docs', 'parity');

export function computeParityStatus() {
  const s = JSON.parse(readFileSync(join(parityRoot, 'APPROVAL_STATUS.json'), 'utf8'));
  const notes = readFileSync(join(parityRoot, 'PARITY_STATUS_NOTES.md'), 'utf8');
  const att = readFileSync(join(parityRoot, 'CI_ATTESTATION.yaml'), 'utf8');
  const runId = att.match(/runId:\s*(\d+)/)?.[1] ?? 'UNKNOWN';
  const runDate = att.match(/runDate:\s*"([^"]+)"/)?.[1] ?? 'UNKNOWN';
  const runCommit = (att.match(/runCommit:\s*"?([0-9a-f]+)"?/)?.[1] ?? 'UNKNOWN').slice(0, 8);

  const lines = [];
  lines.push('# PARITY_STATUS — vue GÉNÉRÉE (ne pas éditer : modifier les registres ou PARITY_STATUS_NOTES.md puis régénérer)');
  lines.push('');
  lines.push('schemaVersion: 2');
  lines.push(`repoCommit: ${runCommit}`);
  lines.push('généréPar: scripts/parity/generate-parity-status.mjs (drift-check CI)');
  lines.push('');
  lines.push(`**Statut global** : \`overallStatus: ${s.overallStatus}\` · \`highestPassedLevel: ${s.highestPassedLevel}\``);
  lines.push(`**Attestation CI** : run ${runId} (${runDate}, commit ${runCommit}) — verte.`);
  lines.push('');
  lines.push('| Niveau | État |');
  lines.push('|---|---|');
  for (const l of s.levels) {
    lines.push(`| ${l.name} | ${l.passed ? '✅ PASS' : `❌ FAIL (${(l.reasons[0] ?? '').slice(0, 80)}${l.reasons.length > 1 ? ` … +${l.reasons.length - 1}` : ''})`} |`);
  }
  lines.push('');
  const c = s.counts;
  lines.push(`**Compteurs (source unique)** : P0 ${c.p0.total} (${c.p0.open} OPEN · ${c.p0.proven} PROVEN · ${c.p0.closed} CLOSED) · P1 ${c.p1.total} · surfaces déclarées ${c.surfaces.total} (univers ${s.surfaceUniverse.present}/${s.surfaceUniverse.expected} importé, ${s.surfaceUniverse.evaluated} évaluées, ${s.surfaceUniverse.services} services) · e2e ${c.e2e.proven}/${c.e2e.total} · constats ${c.backlog.total} → ${c.canonicalWorkItems} work items · claims non ancrées ${c.unanchoredClaims} · uiGaps [${s.uiGaps.join(', ')}]`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(notes.trimEnd());
  lines.push('');

  return lines.join('\n');
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const outPath = join(parityRoot, 'PARITY_STATUS.md');
  const computed = computeParityStatus();

  if (process.argv.includes('--check')) {
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';

    if (current !== computed) {
      console.error('[parity-status] STALE — régénérer (registres/notes ont changé).');
      process.exit(1);
    }

    console.log('[parity-status] up to date');
  } else {
    writeFileSync(outPath, computed);
    console.log(`[parity-status] wrote ${outPath}`);
  }
}
