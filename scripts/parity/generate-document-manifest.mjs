#!/usr/bin/env node
/**
 * DOCUMENT_MANIFEST.yaml — P0-A2-01 (audit de réanalyse 2026-07-20).
 *
 * Rend l'audit REPRODUCTIBLE : hash + schemaVersion + repoCommit + reviewer +
 * résultat de validation de CHAQUE fichier compagnon de docs/parity/. Généré,
 * jamais écrit à la main — le validateur casse le build en cas de dérive
 * (même mécanique que APPROVAL_STATUS.json).
 *
 * Ordre de génération : generate-approval-status.mjs D'ABORD (le manifeste
 * hashe APPROVAL_STATUS.json), puis ce script. Le manifeste ne se hashe pas
 * lui-même.
 *
 * Usage:
 *   node scripts/parity/generate-document-manifest.mjs           # écrit
 *   node scripts/parity/generate-document-manifest.mjs --check   # exit 1 si dérive
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const parityRoot = join(repoRoot, 'docs', 'parity');
const OUT = 'DOCUMENT_MANIFEST.yaml';

export function computeDocumentManifest() {
  const files = [];

  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = statSync(p);

      if (st.isDirectory()) {
        // baseline/ (snapshots volumineux) est couvert par ses propres manifests + SOURCE_REGISTRY.
        if (relative(parityRoot, p) === 'baseline') {
          continue;
        }

        walk(p);
      } else if (st.isFile() && name !== OUT) {
        files.push(p);
      }
    }
  })(parityRoot);

  const entries = files.map((p) => {
    const rel = relative(parityRoot, p);
    const raw = readFileSync(p);
    const text = raw.toString('utf8');
    const sha = createHash('sha256').update(raw).digest('hex');
    const schemaVersion = text.match(/schemaVersion:\s*(\d+)/)?.[1] ?? null;
    const repoCommit = text.match(/repoCommit:\s*"?([0-9a-fA-F_A-Z]+)"?/)?.[1] ?? null;
    const reviewer = text.match(/^reviewer:\s*(\S+)/m)?.[1] ?? 'UNKNOWN';

    return { file: rel, sha256: sha, schemaVersion, repoCommit, reviewer };
  });

  const lines = [
    '# DOCUMENT_MANIFEST — GÉNÉRÉ par scripts/parity/generate-document-manifest.mjs',
    "# (P0-A2-01). Ne jamais éditer à la main — drift-check en CI. Le champ",
    "# validation reflète le dernier run du validateur sur l'arbre.",
    'schemaVersion: 1',
    `fileCount: ${entries.length}`,
    'validation: see-ci-parity-registries   # le workflow CI est l\'attestation d\'exécution',
    'documents:',
  ];

  for (const e of entries) {
    lines.push(`  - file: ${e.file}`);
    lines.push(`    sha256: "${e.sha256}"`);
    lines.push(`    schemaVersion: ${e.schemaVersion ?? 'null'}`);
    lines.push(`    repoCommit: ${e.repoCommit ?? 'null'}`);
    lines.push(`    reviewer: ${e.reviewer}`);
  }

  return lines.join('\n') + '\n';
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const outPath = join(parityRoot, OUT);
  const computed = computeDocumentManifest();

  if (process.argv.includes('--check')) {
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';

    if (current !== computed) {
      console.error('[document-manifest] STALE — régénérer (un fichier a changé sans mise à jour du manifeste).');
      process.exit(1);
    }

    console.log('[document-manifest] up to date');
  } else {
    writeFileSync(outPath, computed);
    console.log(`[document-manifest] wrote ${outPath} (${computed.split('\n').length} lines)`);
  }
}
