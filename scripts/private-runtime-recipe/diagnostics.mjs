import { lstatSync, readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const stages = Object.freeze([
  'initialization', 'create-local-cluster', 'build-local-images', 'build-production-agent',
  'inspect-production-agent', 'pull-dependency-images', 'load-local-images',
  'start-local-dependencies', 'migrate-local-postgres', 'start-real-api-and-manager',
  'browser-baseline', 'browser-web-ready', 'browser-journey', 'real-api-manager-agent-validation',
  'cleanup',
]);
export const statuses = Object.freeze([
  'begin', 'completed', 'failed', 'command-timeout', 'command-exit', 'command-spawn',
  'output-limit', 'no-state', 'no-owned-node', 'owned-node-deleted',
]);
const valid = (record) => Array.isArray(record) && record.length === 2 &&
  stages.includes(record[0]) && statuses.includes(record[1]);

// No command arguments, exception text, identifiers, paths, stdout or environment enter this channel.
export function createDiagnostics(write) {
  let stage = 'initialization';
  let count = 0;
  const emit = (status) => {
    if (!statuses.includes(status) || count >= 64) return;
    count++;
    try { write(JSON.stringify([stage, status]) + '\n'); } catch { /* Diagnostics cannot turn failure into success. */ }
  };
  return {
    stage(value) { if (stages.includes(value)) { stage = value; emit('begin'); } },
    status: emit,
  };
}
export const diagnostic = createDiagnostics((line) => writeSync(3, line));

export function renderDiagnostics(input) {
  const unavailable = 'QA diagnostic: unavailable or invalid; no regression verdict.';
  if (typeof input !== 'string' || Buffer.byteLength(input) > 8192) return unavailable;
  const lines = input.trim().split('\n');
  if (!input.trim() || lines.length > 64) return unavailable;
  let records;
  try { records = lines.map((line) => JSON.parse(line)); } catch { return unavailable; }
  if (!records.every(valid)) return unavailable;
  return records.map(([stage, status]) => `QA diagnostic: ${stage} / ${status}`).join('\n') +
    '\nDiagnostics are checkpoints only, not proof of regression success.';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input;
  try {
    const info = lstatSync(process.argv[2]);
    if (info.isFile() && !info.isSymbolicLink() && info.size <= 8192) input = readFileSync(process.argv[2], 'utf8');
  } catch { /* Do not print the failing path or exception. */ }
  console.log(renderDiagnostics(input));
}
