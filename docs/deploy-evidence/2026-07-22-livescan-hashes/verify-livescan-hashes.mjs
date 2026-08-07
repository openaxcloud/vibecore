#!/usr/bin/env node
// P0-LS-03 — complète le paquet livescan : HASHE TOUS les éléments, dont les 21
// fichiers *.links.txt que manifest.json laissait non hashés (refus expert).
// Produit hash-index.json (sha256 de chaque fichier) et le VÉRIFIE (recalcul) :
//   node verify-livescan-hashes.mjs           # recalcule + réécrit l'index + vérifie
//   node verify-livescan-hashes.mjs --check    # vérifie l'index committé (échoue sur écart)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN_DIR = resolve(HERE, '../../parity/livescan-2026-07-20');
const INDEX = join(HERE, 'hash-index.json');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const checkOnly = process.argv.includes('--check');

const files = readdirSync(SCAN_DIR).filter((f) => statSync(join(SCAN_DIR, f)).isFile()).sort();
const computed = files.map((f) => {
  const buf = readFileSync(join(SCAN_DIR, f));
  return { file: f, sha256: sha256(buf), bytes: buf.length,
    kind: f.endsWith('.links.txt') ? 'links' : f.endsWith('.png') ? 'screenshot'
      : f.endsWith('.md') ? 'doc' : f === 'manifest.json' ? 'manifest' : 'text' };
});
const byKind = computed.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {});

if (checkOnly) {
  const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
  const prev = new Map(idx.files.map((r) => [r.file, r.sha256]));
  const drift = computed.filter((r) => prev.get(r.file) !== r.sha256);
  const missing = computed.filter((r) => !prev.has(r.file));
  if (drift.length || missing.length || prev.size !== computed.length) {
    console.error('ASSERTION FAILED — dérive de hash / couverture:',
      { drift: drift.map((d) => d.file), missing: missing.map((m) => m.file),
        indexed: prev.size, actual: computed.length });
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, filesVerified: computed.length,
    linksHashed: byKind.links || 0 }, null, 2));
} else {
  const index = {
    p0: 'P0-LS-03',
    scanDir: 'docs/parity/livescan-2026-07-20/',
    totalFiles: computed.length,
    byKind,
    linksFilesHashed: computed.filter((r) => r.kind === 'links').map((r) => r.file),
    files: computed,
    note: 'Couverture de hash COMPLÈTE : tous les fichiers du paquet livescan, dont les 21 *.links.txt jusque-là non hashés dans manifest.json. Vérifiable par --check (échoue sur écart).',
  };
  writeFileSync(INDEX, JSON.stringify(index, null, 2));
  console.log(JSON.stringify({ totalFiles: computed.length, byKind,
    linksHashed: byKind.links || 0 }, null, 2));
}
